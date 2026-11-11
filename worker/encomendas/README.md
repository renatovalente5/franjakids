# franjakids-encomendas — o Worker das encomendas da Franja Kids

O contrato (as rotas, a forma da encomenda, os estados, os emails, as vars) está em
[`docs/ENCOMENDAS.md`](../../docs/ENCOMENDAS.md); este Worker segue-o, e o que o contrato não dizia
está nas [Decisões](#decisões). O site (`assets/js/site.js`) e o painel
(`renatovalente5/franjakids-painel`) falam com ele. A base é o Worker da LF Mobile
(`~/Websites/lfmobile/worker/encomendas/`), que veio do Worker da Stripe do Armazém dos Pneus.

**Ainda não publicado.** O site chama-o em `https://franjakids-encomendas.renato-lima-valente-dcb.workers.dev`
(o `--api=` do build, por omissão).

## O que faz

- `POST /checkout` — recebe a encomenda do site e **refaz as contas** com o catálogo publicado
  (`SITE_URL/assets/catalogo.json`, cache de 60 s) e com as **regras do site, importadas** de
  `src/lib/regras.mjs`: `conferirEscolha` (o preço de uma unidade, as escolhas em texto, a
  personalização), `portesDe` (os portes da zona, grátis no continente a partir de X, `null` por
  confirmar), `nifValido`, `emailValido`, `zonaComMorada`. Nenhuma destas contas se repete aqui.
  Confere o cliente (o telemóvel, o NIF, a morada e o código postal de cada zona, o país fora de
  Portugal), a oferta, as notas e os termos, e compara o total com o que o site mostrou (409 se um
  preço mudou entretanto). Grava no KV `ORDERS`. Em modo **encomenda** (o de agora) manda os emails e
  devolve o número e a chave; em modo **online** abre a página segura da Stripe (hosted, em
  português, com os meios ligados na conta: cartão e MB WAY) e devolve o URL.
- `GET /encomenda?e=<id>&c=<chave>` (ou `?s=<sessão Stripe>`) — o que a página «obrigado» mostra:
  sem email, telefone, morada, NIF nem notas, e do nome só o primeiro.
- `POST /stripe/webhook` — os eventos da Stripe, com a assinatura verificada e a idempotência por
  evento (`evt:`, gravada DEPOIS de aplicar e de enviar). O estado grava-se antes de responder; um
  webhook que falhe a enviar os emails responde 500, para a Stripe o reentregar; um evento atrasado
  nunca rebaixa uma encomenda; «pago» é `payment_status !== 'unpaid'`, nunca o `completed` sozinho.
- `/painel/…` com `Authorization: Bearer <PAINEL_SEGREDO>` — a saúde, a lista (feita dos metadados
  das chaves do KV, sem ler cada encomenda), a ficha, mudar o estado (só as transições do §4; as
  outras dão 409 com a razão) e as notas.

Ficheiros: `index.js` (as rotas, o CORS, o travão, o checkout, o webhook), `contas.js` (as
validações e a data de Lisboa; as contas são as do `regras.mjs`), `encomenda.js` (o KV, os ids, os
estados, as vistas), `catalogo.js`, `stripe.js`, `email.js` + `email-html.js`, `painel.js`,
`http.js`. Sem dependências npm: o wrangler junta o `regras.mjs` no pacote (77 KiB).

O modo vem do catálogo (`content/loja.json` → `pagamentos.modo`); a var `MODO = "encomenda"` força
o modo «encomenda» como travão de emergência.

## Testar

```sh
cd worker/encomendas && npm test        # node --test, sem rede: catálogo, Stripe e Resend de faz-de-conta
```

Os testes cobrem as contas (os acréscimos das escolhas, a personalização opcional com acréscimo e a
obrigatória, os portes grátis só no continente e no limiar, os portes `null` nos dois modos), cada
frase das recusas com o seu campo, a forma da encomenda no KV, os dois modos, o CORS, o travão, o
`GET /encomenda` sem dados pessoais, as rotas do painel e as transições proibidas (`registada` →
`pronta`, `pronta` numa entrega por CTT, `enviada` numa em mão…), o webhook (pago, diferido,
expirado, falhado, reembolsado, repetido, fora de ordem, pago depois de anulada, Resend em baixo) e
os emails (texto e HTML com os mesmos factos, a livre resolução certa, nunca o NIF no email do
cliente, nunca a frase do botão da lei, os contrastes das cores medidos no claro e no escuro).

**O catálogo dos testes:** o `_site/assets/catalogo.json` gerado, se existir; senão a cópia
congelada `test/catalogo.json` (o gerado a 9 nov 2026, com os portes do continente — 3,90 € —
acrescentados à mão). É o caso do CI, onde não há `_site/`. Como o catálogo gerado é da dona e muda
no painel, os cenários não afirmam nada sobre ele: correm sobre `catalogoDeEnsaio()`
(`test/ajuda.mjs`), que lhe põe por cima as zonas e os portes de cada cenário e produtos congelados
(cópias dos verdadeiros a 9 nov 2026, e um inventado com acréscimos). Do catálogo lido, um teste prova
que cada produto que o site vende se encomenda no Worker com o preço da conta do carrinho.

O CI (`.github/workflows/worker.yml`) corre-os a cada mudança em `worker/encomendas/**` **e em
`src/lib/regras.mjs`** (as contas são as de lá).

Para testar em local contra o Worker a correr: `wrangler dev --config worker/encomendas/wrangler.toml`
(arrancar, testar com `curl`, parar — um `wrangler dev` deixado a correr morre a meio de edições).

## Publicar

O wrangler corre-se **sempre com `--config`** apontado a este `wrangler.toml` (da pasta-mãe sem
config, a autoconfiguração inventa um Worker com o conteúdo de outro projecto; e na raiz deste
repositório há o `wrangler.jsonc` do `franjakids-site`). Não há wrangler instalado neste repositório;
usa-se o da `mimices-painel`:

```sh
WR=~/Websites/mimices-painel/node_modules/.bin/wrangler
CFG=~/Websites/franjakids/worker/encomendas/wrangler.toml
$WR deploy --dry-run --config $CFG --outdir /tmp/franjakids-encomendas   # o pacote, sem publicar
$WR kv namespace create franjakids-encomendas-ORDERS --config $CFG        # UMA vez: o id vai para o toml
$WR deploy --config $CFG
```

Segredos (nunca no repositório; o valor passa pelo stdin a partir de um ficheiro em
`_cliente/segredos/`, que está fora do git):

```sh
$WR secret put PAINEL_SEGREDO --config $CFG < ~/Websites/franjakids/_cliente/segredos/PAINEL_SEGREDO
```

Uma encomenda de teste vive no objecto dela (a verdade) e no KV (a cópia da lista): apagar só a chave do
KV (`$WR kv key delete "order:FK-…" --binding ORDERS --remote --preview false --config $CFG`) tira-a da
lista, mas a ficha continua a lê-la do objecto, que se apaga sozinho 400 dias depois.

Nota: a lista do painel (o `list()` do KV) pode levar até um minuto a reflectir uma mudança de estado;
a ficha é a de agora (o objecto da encomenda). ANTES DE 11 NOV 2026 não era: a ficha vinha do KV e podia
vir com ~50 s de atraso (medido), e escrever por cima dela perdia pagamentos — ver docs/ENCOMENDAS.md §4.

## O que está ligado (11 nov 2026) e o que falta

1. ~~O KV~~ — `ORDERS` com o id no `wrangler.toml` (10 nov 2026).
2. ~~O painel~~ — o mesmo `PAINEL_SEGREDO` nos dois Workers (em `~/Chaves/franjakids/PAINEL_SEGREDO`).
3. ~~O email da loja~~ — `STORE_EMAIL = "franjakids@gmail.com"` (11 nov 2026).
4. ~~O email~~ — pela Cloudflare (Email Sending, binding `EMAIL`, de `encomendas@franjakids.com`); o Resend
   não se usa.
5. **A Stripe** — conta da cliente «Franja Kids», com o Renato como «Developer»:
   - **No modo de teste está tudo e provado**:
     - a marca (ícone, logótipo, bege `#F7EEDF`, castanho `#5A3E33`) e os emails em pt-PT, sem recibos da
       Stripe (os emails são deste Worker);
     - formas de pagamento: cartão (com Apple Pay e Google Pay), Link e MB WAY; Amazon Pay, Klarna,
       Satispay, Bancontact e EPS desligados;
     - a chave restrita «Worker das encomendas (ensaio)» (`rk_test_…`) com escrita nas Checkout Sessions e
       nos Coupons (os cupões, desde 11 nov 2026) e
       leitura nos PaymentIntents e nas Charges and Refunds;
     - o webhook `franjakids-encomendas-ensaio` (versão `2026-08-26.dahlia`, da mesma família da
       `STRIPE_API_VERSION`), com os 5 eventos de `EVENTOS`.
   - **A prova**: o Worker de ensaio (o ambiente `ensaio` deste `wrangler.toml`, com as suas encomendas e o
     catálogo de ensaio num gist) e `~/Websites/_ferramentas/franjakids/stripe-ensaio.mjs` [cartao|mbway]
     [chromium|webkit]. O carrinho, o finalizar, o Checkout com o cartão 4242 e com o MB WAY de teste, a
     volta à «obrigado», a encomenda «paga» com o meio certo (`card`/`mb_way`), os emails à loja e ao
     cliente e, com um reembolso no painel da Stripe, a encomenda «reembolsada». 7/7 em Chromium e WebKit.
   - **Falta a ativação**, que é da dona: «Ativar Payments» na conta (empresa, banco, extras). Os dados
     públicos (nome, site, email de apoio, descritor do extrato) só aparecem depois dela. Depois, em
     produção:
     - as formas de pagamento como no teste (a configuração é por modo);
     - uma chave restrita `rk_live_…` com as mesmas permissões (Checkout Sessions e Coupons: escrita;
       PaymentIntents e Charges and Refunds: leitura) →
       `$WR secret put STRIPE_SECRET_KEY --config $CFG < …`;
     - o webhook `https://franjakids-encomendas.renato-lima-valente-dcb.workers.dev/stripe/webhook`, com os
       5 eventos e a versão dahlia → `$WR secret put STRIPE_WEBHOOK_SECRET --config $CFG < …`. O segredo
       copia-se pelo botão «Copiar», com o clipboard direto para o `wrangler`: as ferramentas de procura
       do browser leem o texto revelado (aconteceu com o de teste, que foi trocado);
     - o `/painel/saude` com `stripe` e `webhook` a `true`, e a gaveta «Pagamento» do painel a dizer
       «Stripe ligado»;
     - por fim, `pagamentos.modo = "online"` no painel (o catálogo leva o modo) e o «Construir» do site com
       `--producao --api=https://franjakids-encomendas.renato-lima-valente-dcb.workers.dev`.
6. ~~O domínio~~ — `SITE_URL`, `LOGO_URL` e `ALLOWED_ORIGINS` no `franjakids.com`; os endereços locais
   passaram para o Worker de ensaio (127.0.0.1:8986).
7. **Os portes** — são do `content/loja.json` (o painel), não do Worker: enquanto o continente não os
   tiver, as encomendas por CTT seguem com «portes por confirmar» em modo «encomenda», e em modo
   «online» essas zonas não se vendem.

## Decisões

O que o contrato não dizia, ou dizia de duas maneiras, decidido pelo lado mais seguro:

- **As frases das recusas.** Onde o finalizar já tem uma frase para o mesmo erro, é essa (o nome, o
  email, o telemóvel, a morada, a localidade, os termos, «Escreve o código postal como 4440-000.»);
  as de `R.conferirEscolha` vão tal e qual, com o `campo` que ela dá (`produto`, `tamanho`, `cor`,
  `opcoes`, `texto`); as do contrato (409, 503, os portes por confirmar em «online») tal e qual. As
  outras são novas: o produto que já não existe, a quantidade, o carrinho vazio ou com mais de 50
  linhas, o NIF com o algarismo de controlo errado, o código postal que é de outra zona («começa por
  1 a 8» / «começa por 9»), o país, a mensagem e as notas compridas de mais.
- **A mensagem do cartão e as notas acima de 240 e de 600 caracteres recusam-se (400), não se
  cortam.** O finalizar não deixa escrever mais, por isso só um pedido feito à mão lá chega — e uma
  mensagem de cartão cortada a meio sem ninguém saber era pior. A mensagem só se grava com
  `oferta: true` (sem oferta não há cartão); `oferta` só é «sim» com `true`.
- **O país só se grava fora de Portugal.** No continente e nas ilhas é Portugal (o §4 tem
  `cliente.pais`, o §2 só o pede no `estrangeiro`). Na entrega em mão a morada ignora-se e não se
  grava. O código postal aceita `4440000` e `4440 000` e grava-se `4440-000` (o site faz o mesmo).
- **A forma das linhas.** `opcoes` guarda as escolhas que vieram do site, só dos grupos que o produto
  tem; um grupo que faltou vale a primeira escolha sem acréscimo (a regra do `regras.mjs`) e aparece
  só em `escolhas`. `tamanho` e `cor` ficam ausentes nos produtos que não os têm; com uma cor só, é
  essa. `texto` é o que o `conferirEscolha` devolve (vazio sem personalização); `personalizar` é o
  que veio do site (a caixa) e `personalizada` é a verdade (há nome ou frase).
- **`avisos`**: `{ <momento>: { em, cliente, loja } }` — `loja` e não `dono` (como a coluna do §6),
  com `'enviado'`, `'falhou'`, `'sem chave'`, `'sem email'`, `'sem destinatário'` (sem `STORE_EMAIL`)
  ou `'não se aplica'`.
- **A pré-visualização só se promete quando há uma linha personalizada** (numa encomenda só de mantas
  era uma promessa que ninguém cumpre), e no «Pagamento recebido» só pela Stripe (o §6 não a põe no
  da marcação no painel: em modo «encomenda» combina-se antes).
- **A livre resolução nos emails ao cliente** (confirmação e seguintes; não nos de anulada,
  reembolso, falha ou expiração): «14 dias» só quando há artigos sem personalização; com tudo
  personalizado, só que não têm troca nem devolução por desistência; sempre com
  `/trocas-e-devolucoes/` e `/termos/`. Escolher a cor ou o tamanho não é personalizar.
- **Os emails à loja também levam HTML** (o §6 diz «Texto e HTML»; a LF mandava só texto à loja).
  Sem a linha «IVA incluído» da LF: o site di-lo nos termos, e o regime de IVA da loja ainda não está
  nos dados.
- **Os nomes das zonas nos emails são os de `R.NOMES_ZONAS`** («Entrega em mão»), não os do catálogo
  («Entrega em mão em Valongo»): a encomenda guarda só o id da zona (o §4 não tem o nome), e os
  emails do webhook e do painel não lêem o catálogo.
- **Um pagamento que chega a uma encomenda já anulada** (a dona anulou e a pessoa pagou na mesma, na
  hora que a página da Stripe dura) não a põe «paga»: fica uma linha no histórico e um email **só à
  loja** («É preciso devolvê-lo na Stripe»); ao cliente não vai «Pagamento recebido». Um «pago»
  atrasado numa encomenda já reembolsada não manda nada.
- **Anular (ou marcar paga) uma encomenda «pendente» fecha a página da Stripe**
  (`POST /checkout/sessions/<id>/expire`), para a pessoa não pagar uma encomenda anulada nem pagar
  duas vezes. Se a Stripe recusar (a pessoa pagou nesse instante), a mudança faz-se na mesma e o
  caminho de cima trata do pagamento.
- **`stripe.metodo` é o meio usado, não o primeiro aceite.** O `payment_method_types` da sessão diz
  os meios que ela aceitava (todos os ligados na conta); com mais de um, o webhook pergunta à cobrança
  (`latest_charge.payment_method_details.type`: `card`, `mb_way`). Se a Stripe não responder, o
  pagamento conta na mesma e o método fica por saber.
- **Sem o Multibanco da LF** (o evento `payment_intent.requires_action` e o email «Falta pagar»): o
  contrato é cartão e MB WAY. Se a dona ligar o Multibanco na Stripe, funciona na mesma: a sessão
  completa sem pagamento fica «pendente» até ao `async_payment_succeeded`, e a referência mostra-a a
  página da Stripe.
- **Para a Stripe vai só o nome e a quantidade de cada produto** (e o preço), o email para o recibo e
  o número da encomenda. Duas linhas do mesmo produto com preços diferentes (com e sem nome bordado)
  aparecem lá com o mesmo nome.
- **O catálogo tem versão.** O Worker lê só a `v: 2`; outra dá 503 nas encomendas e a
  `/painel/saude` diz porquê (`VERSAO_CATALOGO` em `catalogo.js`, a mudar com o `build.mjs`).
- **O corpo do `/checkout` vai até 64 KiB** (16 na LF): 50 linhas com textos de personalização de 200
  caracteres passam dos 16.
- **Os metadados das chaves medem-se em bytes** (a Cloudflare aceita 1 024 bytes, não caracteres; a
  LF media em caracteres, e um carrinho grande com nomes acentuados podia passar o limite e a
  encomenda não se gravava).
- **A data de Lisboa faz-se à mão** (o id `FK-AAAAMMDD-…` e a data dos emails), sem o `Intl`, que custa
  ~10 ms de CPU a frio num Worker; os testes comparam-na com o `Intl` hora a hora de 2025 a 2032.
- **Os textos do cliente limpam-se** dos caracteres de controlo e dos invisíveis (espaços de largura
  zero, marcas de direcção), ficando os juntores dos emojis: um nome só de invisíveis é um nome
  vazio. O texto da personalização é o do `conferirEscolha` (ver a nota abaixo).
- **`termos.pagina`** é `SITE_URL/termos/` (não o `termos` do catálogo, que no build local aponta
  para o `127.0.0.1`).

Fora desta pasta, para o `src/lib/regras.mjs` (não mexi): o `conferirEscolha` junta os espaços do
texto da personalização mas não tira os invisíveis (um «Nome a bordar» só de espaços de largura zero
passa como personalizado, com o acréscimo); e lê `pedidas[g.nome]` sem `Object.hasOwn` (um grupo de
opções chamado «constructor» leria o protótipo).
