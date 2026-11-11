# Boas práticas a aplicar na loja da Franja Kids

Pesquisa de 9 nov 2026. As fontes são a Baymard, o W3C (WCAG 2.2), o web.dev, a Google Search Central e a Stripe.
✓ = já aplicado nas propostas da página inicial.

## Loja
- Menu com as categorias no primeiro nível, e a secção onde se está assinalada. Filtros (idade/tamanho, cor) em vez de mais categorias.
- Cartões de produto num só formato (4:5) com foto, nome, «desde X €» e a etiqueta «Personalizável». Nada de «adicionar rápido»: um personalizado precisa de tamanho e texto. (✓ formato e etiqueta; faltam os preços)
- Ficha do produto:
  - miniaturas na galeria, não pontinhos;
  - tamanhos em botões à vista, com a ligação ao guia de tamanhos ao lado;
  - cores em amostras com o nome escrito;
  - o que esgotou fica riscado e escrito «esgotado», nunca escondido.
- Campo da personalização antes do botão:
  - etiqueta visível e uma pista (caracteres permitidos, máximo);
  - contador que deixa passar do limite e só então avisa;
  - `spellcheck="false"`;
  - «+3,00 €» à vista e o total actualizado junto do botão.
- Repetir o texto tal e qual («Vamos personalizar: «Maria Inês»») no carrinho e no email, com «Alterar». Dizer antes de pagar que os personalizados não têm devolução.
- Portes e o limiar dos portes grátis junto do botão e no carrinho («Faltam 12,10 € para portes grátis»). Prazo como intervalo de datas que já conta a produção.
- Carrinho em gaveta (`<dialog>`) e também uma página /carrinho; quantidade com −/+.
- Checkout:
  - sem conta obrigatória e com cerca de 8 campos;
  - envio e entrega em mão (Valongo) lado a lado;
  - Stripe com `locale: "pt"`: MB WAY, Multibanco, cartão, Apple Pay e Google Pay (e nada mais);
  - códigos de desconto com `allow_promotion_codes`, sem caixa de cupão em destaque.
- Encomenda confirmada pelo webhook `checkout.session.completed`, que tem de aguentar correr duas vezes para a mesma encomenda. O email de confirmação sai daí.

## Acessibilidade (WCAG 2.2 AA)
- Opções em `<fieldset>`/`<legend>` com `radio`; o escolhido escrito («Cor: Rosa»); anel de seleção ≥ 3:1.
- Alvos de toque ≥ 24 px, e 44 px em amostras, −/+ e fechar. (✓ 44 px nos botões redondos)
- O cabeçalho fixo nunca tapa o foco (`scroll-padding-top`); `:focus-visible` com 2 px. (✓)
- Ajuda (mensagem, email) sempre no mesmo sítio; não pedir duas vezes a mesma informação.
- Carrosséis sem andar sozinhos e com botões; menus em divulgação (`aria-expanded`), nunca `role="menu"`. (✓ menu do telemóvel)
- Erros:
  - um resumo que recebe o foco, com «Erro:» no `<title>`;
  - em cada campo, a mensagem ligada por `aria-describedby`;
  - os `autocomplete` certos.
- Contrastes medidos por conta: texto ≥ 4,5:1 e contornos ≥ 3:1. O coral e o oliva do logótipo só enfeitam. (✓)

## Desempenho
- A imagem principal é um `<img>` com `fetchpriority="high"`, nunca preguiçosa; as outras `loading="lazy"`; `width`/`height` sempre. (✓)
- `<picture>` com AVIF, WebP e JPEG em várias larguras, com `sizes` certo. (✓ 360/720/1080/1440)
- Letras:
  - no máximo 2 famílias, WOFF2 alojado no próprio site e só o subconjunto latino;
  - pré-carregar só as do primeiro ecrã;
  - `font-display: swap`.

  (✓ sem pedidos à Google, o que também resolve o RGPD)
- Menos de 50 KB de JavaScript; nada de `unload`; ao voltar atrás (`pageshow` com `persisted`), redesenhar o carrinho.
- Instagram sem o script de incorporação (pesado e com cookies): uma grelha estática de fotografias alojadas no site. (✓)

## CSS moderno que já se pode usar
- Já seguros: `clamp()`, `color-mix()`, `:has()`, consultas de contentor, `<dialog>`, `inert`, `dvh`, `scroll-snap`, propriedades lógicas.
- Com alternativa: `text-wrap: balance`, a API popover, as transições de vista (só com `prefers-reduced-motion: no-preference`).

## SEO
- `ProductGroup`/`Product` com variantes (tamanho, cor), `offers` com o preço e a disponibilidade, `shippingDetails` e `hasMerchantReturnPolicy` (os personalizados com `MerchantReturnNotPermitted`).
- `OnlineStore`/`Organization` na página inicial, migalhas, canónicas, mapa do site, `og:*`, e `hreflang` se houver EN.
- Listagens grátis no Google Merchant Center. A roupa precisa de `age_group`, `gender`, `color` e `size`.

## Lei (para ver no fim, com os dados da empresa)
- Personalizados sem direito de livre resolução (DL 24/2014, art. 17.º), dito antes da compra. Os não personalizados mantêm os 14 dias.
- A Diretiva (UE) 2023/2673 obriga, desde 19 jun 2026, a um botão «Desistir do contrato» online para o que tem livre resolução. Confirmar se Portugal já a transpôs.
- O RGPD aplica-se ao nome da criança: guardá-lo só na encomenda, fora dos URL e da analítica.
- Ficha do produto com os dados que o Regulamento (UE) 2023/988, art. 19.º, pede, quando existam: fabricante, contacto e avisos.
