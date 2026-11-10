# As encomendas da Franja Kids: o contrato entre o site, o Worker e o painel

Escrito a 9 nov 2026 (a forma vem da LF Mobile). Três peças falam entre si; este ficheiro diz como,
para cada uma se construir sem ver as outras.

- **O site** (este repositório): `assets/js/site.js` guarda o carrinho no browser, lê os preços do
  catálogo publicado (`assets/catalogo.json`, a forma está em `src/build.mjs`, `paraCarrinho`) e fala
  com o Worker em `document.body.dataset.api` (o `--api=` do build:
  `https://franjakids-encomendas.renato-lima-valente-dcb.workers.dev`). Sem `--api` (a
  pré-visualização, enquanto o Worker não está no ar) o finalizar confere tudo e acaba no aviso
  «Quase a abrir», sem enviar nada.
- **O Worker das encomendas** (`worker/encomendas/`, nome `franjakids-encomendas`): recebe a
  encomenda, refaz as contas do seu lado com o catálogo publicado e com as MESMAS regras do site
  (importa `src/lib/regras.mjs`: `conferirEscolha`, `portesDe`, `nifValido`, `emailValido`…),
  guarda-a no KV, manda os emails e, em modo «online», abre a página segura da Stripe e ouve os
  webhooks.
- **O painel** (`renatovalente5/franjakids-painel`): lista e marca as encomendas através do Worker
  (nunca lê o KV directamente), com um segredo partilhado.

## 1. Modos

O `content/loja.json` diz `pagamentos.modo`: `"encomenda"` (o de agora: sem chaves da Stripe; a
encomenda regista-se e a loja confirma e combina o pagamento, por MB WAY ou transferência) ou
`"online"` (a Stripe: cartão e MB WAY; quando o Renato ligar a conta da cliente, no fim). O catálogo
publicado leva o `modo`; o Worker lê-o de lá (`MODO` nas vars só o pode forçar para `encomenda`,
como travão). Em modo «online» sem `STRIPE_SECRET_KEY` o Worker responde 503 com
`{ erro: 'O pagamento no site ainda não está ligado. Encomenda por mensagem no Instagram.' }`.

## 2. O que o site envia: `POST /checkout`

```json
{
  "linhas": [{ "produto": "babygrow-com-nome", "tamanho": "1 mês", "cor": "Rosa",
               "opcoes": { "Manga": "Manga curta" }, "personalizar": true, "texto": "Clara", "qtd": 1 }],
  "entrega": "continente",
  "cliente": { "nome": "…", "email": "…", "telefone": "…", "nif": "123456789",
               "morada": "…", "codigoPostal": "4440-000", "localidade": "…", "pais": "…" },
  "oferta": true, "mensagem": "Parabéns!", "notas": "Preciso para dia 20",
  "termos": true,
  "total_cents": 1990
}
```

- **A escolha de cada linha** (`tamanho`, `cor`, `opcoes`, `personalizar`, `texto`) confere-se com
  `R.conferirEscolha(produto, linha)` sobre a entrada do catálogo publicado (que tem a forma de um
  produto: `preco`, `tamanhos` [lista], `cores` [{ nome, foto? }], `opcoes` [{ nome, valores:
  [{ nome, suplemento }] }], `personalizacao` { rotulo, pista, max, obrigatoria, opcional,
  suplemento } | null). A função devolve o preço de uma unidade em cêntimos, as `escolhas` em texto
  («Tamanho: 1 mês», «Cor: Rosa», «Nome a bordar: Clara») e se a linha é `personalizada`; ou
  `{ ok: false, campo, mensagem }`, e o Worker responde 400 com essa frase. Uma escolha que falta
  num grupo de `opcoes` vale a primeira sem acréscimo (a mesma regra do site).
- `qtd`: 1 a 20. Até 50 linhas.
- `entrega`: um dos ids de `catalogo.zonas` (`continente`, `ilhas`, `estrangeiro`, `mao`). Com
  entrega que não seja `mao`, a morada, o código postal e a localidade são obrigatórios; o código
  postal é `0000-000` e começa por 1 a 8 no `continente`, por 9 nas `ilhas` (400 com
  `campo: "codigoPostal"` e a frase a dizê-lo); no `estrangeiro` é texto livre, e o `pais` é
  obrigatório. Na entrega em mão a morada ignora-se.
- `nif`, `morada`, `codigoPostal`, `localidade`, `pais`, `mensagem`, `notas`: opcionais (ausentes, não
  vazios). O NIF, se vier, tem de ser válido (`R.nifValido`). `mensagem` até 240 caracteres, `notas`
  até 600; `oferta` é sim ou não.
- `total_cents`: o que o site mostrou (os artigos mais os portes, ou só os artigos quando os portes
  estão por confirmar). É só para comparar: se o Worker chegar a outro total (um preço mudou
  entretanto) responde 409 `{ erro: 'Os preços mudaram. Confirma o total e envia outra vez.' }` e o
  site redesenha.

**Os portes** (`R.portesDe(zona, artigosCents, catalogo.gratisAPartirDe)`): os da zona, grátis no
`continente` a partir de `gratisAPartirDe` em artigos, zero na entrega em mão. Uma zona sem portes
(`null`) está «por confirmar»: em modo «encomenda» a encomenda segue com `portes_por_confirmar: true`
e o email diz-o; em modo «online» recusa (400, `campo: "entrega"`: «Para esta entrega confirmamos os
portes antes do pagamento: manda-nos mensagem no Instagram.») — o site nem a mostra.

Recusa ainda (400, `{ erro, campo? }`, frases em português para o site mostrar tal e qual): produto
que não existe ou não se compra («já não se vende no site»); email inválido; telefone sem 9 a 15
algarismos; NIF errado; `termos` que não seja `true`; nome vazio.

Respostas boas (200):

- modo «encomenda»: `{ "encomenda": "FK-20261109-7K2Q9M", "chave": "…", "estado": "registada", "total_cents": 1990 }`
- modo «online»: `{ "encomenda": "…", "chave": "…", "url": "https://checkout.stripe.com/…", "total_cents": 1990 }`

O site: com `url` segue para lá; com `encomenda` esvazia o carrinho e segue para
`/obrigado/?e=<encomenda>&c=<chave>`. A Stripe volta para `SITE_URL/obrigado/?s={CHECKOUT_SESSION_ID}`
(sucesso) e para `SITE_URL/finalizar/?cancelado=1` (cancelar).

CORS: só as origens de `ALLOWED_ORIGINS` (a pré-visualização `https://renatovalente5.github.io`, o
`http://127.0.0.1:8985` do build local e, depois, o domínio); `OPTIONS` responde às duas rotas
públicas. Um travão de 5 pedidos por minuto por IP no `/checkout` (rate limit binding).

## 3. O que o site lê: `GET /encomenda?e=<id>&c=<chave>` ou `GET /encomenda?s=<sessão Stripe>`

Só o que a pessoa já sabe, sem email, telefone nem morada (a chave é o segredo da encomenda; sem
ela, ou errada, 404):

```json
{ "encomenda": "FK-20261109-7K2Q9M", "estado": "registada", "modo": "encomenda",
  "entrega": "continente", "portes_por_confirmar": true,
  "linhas": [{ "nome": "Babygrow", "qtd": 1, "total_cents": 1990, "escolhas": ["Tamanho: 1 mês", "Cor: Rosa", "Nome a bordar: Clara"] }],
  "artigos_cents": 1990, "portes_cents": 0, "total_cents": 1990,
  "cliente": { "nome": "Maria" } }
```

`cliente.nome` é só o primeiro nome. Pela sessão da Stripe (`s`) responde o mesmo, se a sessão for
de uma encomenda conhecida (índice `session:`).

## 4. O que fica no KV (namespace `ORDERS`, só o Worker escreve)

- `order:<id>` → a encomenda inteira (JSON abaixo), 400 dias.
- `session:<id da Checkout Session>` → `<id>`, `pi:<PaymentIntent>` → `<id>` (modo «online»).
- `evt:<id do evento Stripe>` → `1`, 30 dias (um webhook repetido não repete emails).

Os ids: `FK-AAAAMMDD-XXXXXX` (6 caracteres de `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, sem 0/O/1/I):
ordenam por data no `list({ prefix: 'order:' })` e dizem-se por mensagem. A chave: 20 caracteres do
mesmo alfabeto, gerada com `crypto.getRandomValues`.

```json
{
  "v": 1,
  "encomenda": "FK-20261109-7K2Q9M",
  "chave": "…",
  "modo": "encomenda",
  "estado": "registada",
  "entrega": "continente",
  "linhas": [{ "produto": "babygrow-com-nome", "nome": "Babygrow", "qtd": 1,
               "tamanho": "1 mês", "cor": "Rosa", "opcoes": {}, "personalizar": true, "texto": "Clara",
               "escolhas": ["Tamanho: 1 mês", "Cor: Rosa", "Nome a bordar: Clara"], "personalizada": true,
               "unidade_cents": 1990, "total_cents": 1990 }],
  "artigos_cents": 1990, "portes_cents": 0, "portes_por_confirmar": true, "total_cents": 1990,
  "cliente": { "nome": "…", "email": "…", "telefone": "…", "nif": "…",
               "morada": "…", "codigoPostal": "…", "localidade": "…", "pais": "…" },
  "oferta": { "sim": true, "mensagem": "…" },
  "notas": "…",
  "termos": { "aceites_em": "2026-11-09T21:02:11.000Z", "pagina": "https://…/termos/" },
  "stripe": { "session_id": "cs_…", "payment_intent": "pi_…", "metodo": "card", "pago_em": "…" },
  "historico": [{ "em": "2026-11-09T21:02:11.000Z", "estado": "registada", "por": "site" }],
  "notas_painel": [{ "em": "…", "por": "email da dona", "texto": "…" }],
  "criada_em": "2026-11-09T21:02:11.000Z",
  "actualizada_em": "2026-11-09T21:02:11.000Z"
}
```

Estados (`estado`), e quem os põe:

| estado | quem | quando |
|---|---|---|
| `registada` | Worker | modo «encomenda»: a encomenda ficou gravada; a loja confirma e combina o pagamento |
| `pendente` | Worker | modo «online»: a sessão da Stripe foi aberta |
| `paga` | Worker (webhook) ou painel | o pagamento entrou (Stripe), ou a loja recebeu-o (MB WAY, transferência) |
| `pronta` | painel | pronta para entregar em mão (entrega `mao`) |
| `enviada` | painel | seguiu pelos CTT (entregas `continente`, `ilhas`, `estrangeiro`); a nota pode levar o registo |
| `levantada` | painel | entregue em mão |
| `anulada` | painel | a loja anulou (sem pagamento, ou com reembolso feito à parte) |
| `reembolsada` | Worker (webhook) | a Stripe devolveu o dinheiro |
| `falhou` / `expirou` | Worker (webhook) | o pagamento falhou, ou a sessão expirou sem pagar |

Cada mudança acrescenta uma linha ao `historico` (`por`: `site`, `stripe` ou o email de quem marcou
no painel; `nota` opcional).

As transições que o painel pode pedir (o Worker recusa as outras com 409): `registada` → `paga` |
`anulada`; `pendente` → `paga` | `anulada`; `paga` → `pronta` | `enviada` | `levantada` |
`anulada`; `pronta` → `levantada` | `anulada`; `enviada` → `anulada`; `falhou` e `expirou` →
`paga` | `anulada`; `levantada`, `anulada` e `reembolsada` são finais. `pronta` e `levantada` só
com entrega `mao`; `enviada` só com as outras. (Ao contrário da LF Mobile, `registada` não passa a
`pronta`: a Franja Kids só produz depois do pagamento.)

Campos que o Worker acrescenta à encomenda, além dos de cima: `avisos` (o resultado de cada email
enviado) e `stripe.reembolsado_cents`.

## 5. O que o painel usa (`Authorization: Bearer <PAINEL_SEGREDO>`; sem ele, 401; sem CORS)

- `GET /painel/encomendas?estado=<…>&desde=<AAAA-MM-DD>&ate=<…>&q=<texto>` → `{ encomendas: [resumo…] }`,
  as mais recentes primeiro (resumo: `encomenda, estado, modo, entrega, total_cents, cliente.nome,
  cliente.telefone, criada_em, actualizada_em, linhas: [{ nome, qtd }]`). `q` procura no id, no
  nome, no email e no telefone (sem acentos nem maiúsculas). Até 200; o resto por `?pagina=`.
- `GET /painel/encomendas/<id>` → a encomenda inteira.
- `POST /painel/encomendas/<id>/estado` `{ "estado": "enviada", "nota": "CTT RR123…", "por": "email da dona" }`
  → a encomenda inteira depois de mudar. Só as transições do painel (tabela acima); outra, 409.
  Manda o email ao cliente que a transição pede (§6) — `"avisar": false` não manda.
- `POST /painel/encomendas/<id>/nota` `{ "texto": "…", "por": "…" }` → acrescenta a `notas_painel`.
- `GET /painel/saude` → `{ ok, modo, stripe, webhook, email, dona, catalogo }` (booleanos; `catalogo` é
  `"ok"` ou o erro de ler o catálogo publicado).

A lista faz-se dos metadados das chaves do KV (sem ler cada encomenda, por causa do limite de
subpedidos): uma mudança de estado pode levar até 60 s a aparecer na lista; a ficha é imediata. A
lista traz também `pagina`, `paginas`, `total` e, em cada resumo, `linhas_a_mais`.

O segredo `PAINEL_SEGREDO` é o mesmo nos dois Workers (um `wrangler secret put` em cada).

## 6. Emails (pela Cloudflare, o binding `EMAIL`; ou pelo Resend, `RESEND_API_KEY`; sem nenhum não se manda nada e a encomenda fica na mesma)

Texto e HTML, em português de Portugal e no tratamento do site (tu), curtos, com o logótipo no topo
(`LOGO_URL`, o PNG do site), o número da encomenda, as linhas com as escolhas e o texto da
personalização, o total, a entrega e o contacto da loja; sem «obrigação de pagar»; com o aviso dos 14
dias para o que não é personalizado e a ligação a `/trocas-e-devolucoes/` (DL 24/2014, art. 4.º e
5.º: a confirmação em suporte duradouro leva as condições). Remetente `MAIL_FROM` (um endereço do
domínio: `encomendas@franjakids.com`, pelo Email Sending da Cloudflare desde 10 nov 2026 — o domínio
está nele, com os registos no `cf-bounce` e o DMARC, e a conta no Workers Paid deixa mandar a qualquer
pessoa; o Resend fica como plano B).

| momento | ao cliente | à loja (`STORE_EMAIL`) |
|---|---|---|
| encomenda registada (modo «encomenda») | «Recebemos a tua encomenda» + o que vem a seguir (confirmamos e combinamos o pagamento; a pré-visualização antes de produzir) | «Nova encomenda FK-…» com tudo, e o telefone do cliente |
| paga (Stripe) | «Pagamento recebido» + a pré-visualização vem a seguir | «Encomenda paga FK-…» |
| paga (marcada no painel) | «Pagamento recebido» | — |
| pronta | «A tua encomenda está pronta» + combinamos a entrega em mão | — |
| enviada | «A tua encomenda seguiu» + nota (registo dos CTT) | — |
| anulada | «A tua encomenda foi anulada» + nota | — |
| reembolsada / falhou / expirou | «Reembolso feito» / «O pagamento não se concluiu» | «FK-… falhou/expirou» |

## 7. Vars do Worker (wrangler)

`SITE_URL` (a pré-visualização `https://renatovalente5.github.io/franjakids`, depois o domínio),
`CATALOGO_URL` (por omissão `${SITE_URL}/assets/catalogo.json`), `LOGO_URL` (o PNG do logótipo para
os emails: o Outlook não mostra WebP), `ALLOWED_ORIGINS`, `MAIL_FROM`, `STORE_EMAIL`,
`STORE_NAME = "Franja Kids"`, `STORE_INSTAGRAM = "franjakids"`, `STRIPE_API_VERSION =
"2026-07-29.dahlia"` e, opcional, `MODO = "encomenda"` como travão. Segredos: `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `PAINEL_SEGREDO`. Bindings: KV `ORDERS`, rate limit
`TRAVAO_CHECKOUT`. `wrangler deploy --config worker/encomendas/wrangler.toml` sempre com `--config`
(memória: wrangler-autoconfig-pasta-mae).

## 8. O que o Worker fixou (9 nov 2026)

O que este contrato não dizia, decidido no Worker pelo lado mais seguro (a lista inteira, com o
porquê, está na secção «Decisões» do `worker/encomendas/README.md`):

- `avisos` = `{ <momento>: { em, cliente, loja } }`, com `'enviado'`, `'falhou'`, `'sem chave'`,
  `'sem email'`, `'sem destinatário'` ou `'não se aplica'`.
- Anular (ou marcar paga) uma encomenda `pendente` fecha a página da Stripe
  (`POST /checkout/sessions/<id>/expire`).
- Um pagamento que chega a uma encomenda já `anulada` não a põe `paga`: fica uma linha no histórico e
  um email só à loja, a dizer que é preciso devolver o dinheiro na Stripe.
- `stripe.metodo` é o meio usado (lido da cobrança: `card`, `mb_way`), não o primeiro aceite.
- O catálogo publicado tem versão: o Worker só lê a `v: 2` (outra dá 503 e a `/painel/saude` diz
  porquê). Mudar a forma do catálogo no `build.mjs` = subir a versão nos dois sítios.
- A mensagem do cartão e as notas acima de 240 e 600 caracteres recusam-se (400), não se cortam; o
  corpo do pedido pode ir até 64 KiB (50 linhas personalizadas).
