# O menu, as categorias e os pedidos de 20 nov 2026

O pedido da Franja Kids (`_cliente/pedidos/Franja_Kids_Alteracoes_Site_V4.docx`, enviado pelo Samuel no WhatsApp
a 20 nov 2026, e a pergunta do aviso de stock na mesma conversa). Este documento é o contrato entre o site
(`src/lib/regras.mjs`, as páginas), o Worker das encomendas e o painel.

## 1. O catálogo: secções do menu e as suas categorias

`content/catalogo.json` deixa de ter `linhas`, `categorias` e `ocasioes`, e passa a ter `seccoes`:

```json
{
  "seccoes": [
    {
      "id": "bebe", "nome": "Bebé",
      "frase": "Da primeira roupinha aos pequenos detalhes…",
      "foto": "bebe-a6c0b9b1",
      "itens": [
        { "id": "bodies-e-babygrows", "nome": "Bodies e babygrows" },
        { "id": "primeira-roupinha", "nome": "Primeira roupinha", "frase": "…", "foto": "…" }
      ]
    }
  ],
  "tamanhos": { "…": { "nome": "…", "valores": [] } },
  "cores": { "Rosa": "#F2B8C6" }
}
```

- **Secção** = uma entrada do menu principal e uma página (`/<id>/`): Bebé, Personalizados, Criança e Família
  Personalizados, Presentes, Coleções, Promoções. O «Sobre Nós» do menu não é uma secção, mas sim as páginas fixas
  (§4).
- **Item** = uma categoria dentro da secção, e uma página (`/<secção>/<item>/`).
- A dona junta, muda o nome, ordena (arrasta) e tira as secções e os itens no painel. O `id` nasce do nome
  (`R.gerarSlug`) na criação e nunca muda: é o endereço. Uma secção ou um item que algum produto usa não se tira
  (primeiro tira-se dos produtos).
- `frase` (opcional): o texto por baixo do título da página e a descrição para o Google. Sem ela, a da secção.
- `foto` (opcional): na secção, o cartão da página inicial; num item da secção `presentes`, o mosaico «Para quem é?»
  da página inicial.
- Os `id` das secções não podem ser os das páginas fixas (`R.ENDERECOS_RESERVADOS`).

## 2. O produto: em que categorias aparece

`categoria` (uma) e `ocasioes` (várias) dão lugar a **`categorias`**: a lista das chaves `"<secção>/<item>"` onde o
produto aparece, por ordem (a 1.ª é a principal: as migalhas, a etiqueta da ficha, «Também podes gostar»).

```json
{ "nome": "Body «A melhor mãe do mundo»", "categorias": ["personalizados/bodies", "colecoes/dia-da-mae"] }
```

- Sem nenhuma categoria válida, o produto fica escondido (neutraliza).
- Uma chave que já não existe é um lembrete (não aparece lá).
- Uma página de secção mostra os produtos de todos os itens dela, sem repetir; uma secção ou um item sem produtos
  não aparece no menu nem tem página.

## 3. O preço por tamanho

`suplementosTamanho`: `{ "<tamanho>": <acréscimo em €> }`, por exemplo `{ "S": 5, "M": 5, "L": 5, "XL": 5 }`. O preço
do produto é o do tamanho mais barato («desde»). Pelo menos um tamanho fica sem acréscimo (o preço anunciado tem de
se poder pagar). A conta é a de `R.conferirEscolha` (site, carrinho, Worker).

Para t-shirts de criança e de adulto na mesma fotografia: um conjunto de tamanhos com os dois (Categorias › Tamanhos)
e o acréscimo nos tamanhos de adulto.

## 4. O menu principal

Bebé · Personalizados · Criança e Família Personalizados · Presentes · Coleções · Promoções · Sobre Nós. Cada
entrada abre a lista das suas categorias (no computador, por baixo; no telemóvel, no menu de ecrã inteiro).

Sobre Nós: A nossa história (`/sobre/`) · Como funciona (`/como-funciona/`) · Como personalizar
(`/como-personalizar/`) · Envios e entregas (`/envios/`) · Perguntas frequentes (`/perguntas-frequentes/`) ·
Contactos (`/contactos/`).

Rodapé, Ajuda: Como encomendar · Envios e prazos · Trocas e devoluções · Contactos · Informações legais
(`/informacoes-legais/`, nova).

## 5. As entregas

`loja.entrega.zonas`, sempre estas cinco, por esta ordem (`R.ZONAS`):

| id | nome | portes |
|---|---|---|
| `continente` | Portugal continental | 5,50 € (grátis a partir de 60 € em artigos) |
| `ilhas` | Açores e Madeira | 5,50 € |
| `ue` | União Europeia | 8,00 € (o país de uma lista: `R.PAISES_UE`) |
| `estrangeiro` | Restantes países | sob consulta |
| `mao` | Levantamento em mão — Valongo | grátis |

- **Uma zona sem portes (`null`) é «sob consulta»:** aparece no finalizar, mas não se encomenda. O finalizar diz
  que os portes são sob consulta e leva ao Instagram, e o Worker recusa. Isto vale nos dois modos (antes, no modo
  «encomenda», seguia «por confirmar»).
- **O levantamento em mão:** não pede morada. O telemóvel é para combinar o levantamento pelo WhatsApp, quando a
  encomenda estiver pronta.
- `loja.preparacao` (novo): o prazo dos artigos sem personalização («2 a 3 dias úteis»). `loja.producao` continua a
  ser o dos personalizados («1 a 2 semanas»).
- `loja.fotoHistoria` (novo): a fotografia de «A nossa história» na página inicial. A dona escolhe-a no painel.

## 6. O aviso de stock

Na ficha de um produto esgotado (ou com um tamanho, uma cor ou uma escolha esgotados), a cliente deixa o email:
«Avisa-me quando voltar».

- O Worker das encomendas guarda o pedido no objecto durável `Avisos`: o produto, o que está esgotado e o email.
  Cada aviso dura 6 meses.
- No painel, o stock do produto mostra quantas pessoas pediram o aviso. Há um botão «Avisar quem pediu», que manda
  o email só a quem pediu o que já não está esgotado no site publicado, e apaga esses pedidos. Fica um botão (e não
  um envio automático) porque há vezes em que a loja não quer avisar.

Rotas:
- `POST /aviso` `{ produto, variante: { grupo, valor } | null, email }` → `{ ok }`. `grupo` é `"Tamanho"`,
  `"Cor"` ou o nome de uma escolha.
- `GET /painel/avisos` → `{ avisos: { <produto>: [{ grupo, valor, n }] } }`.
- `POST /painel/avisos/<produto>/enviar` → `{ enviados, esperam, falharam }`.

## 7. Os textos pedidos

Página inicial (o «Como funciona» com os 4 passos novos, e «A nossa história» com o texto novo), Como funciona,
Envios e prazos, Sobre nós (o título «Um sonho, muitas mãos e muito amor.»), Informações legais (a partir de
`loja.empresa`), Como personalizar e Perguntas frequentes. Estas duas não vieram no pedido: escrevi-as com os
factos que o site já dizia.
