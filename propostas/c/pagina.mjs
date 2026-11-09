// Proposta C «Areia»: fundo areia, cartões claros, o pêssego e o oliva dos bonecos nas ocasiões; Varela Round + Figtree.
import { cabecaHtml, foto, logotipo, icone, rodape, MENU, OCASIOES, DESTAQUES, PASSOS, INSTAGRAM, IG_URL, SOBRE, SCRIPT } from '../comum.mjs';

const lista = (itens) => itens.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join('');
const LINHAS = [
  ['Personalizados', 'cat-bodies', ['Bodies', 'T-shirts', 'Camisolas', 'Babetes']],
  ['Bebé', 'cat-conjuntos', ['Conjuntos', 'Babygrows', 'Primeira roupinha']],
  ['Presentes', 'cat-box', ['Box Franja', 'Mantas', 'Toalhas com nome']],
];

export default () => `${cabecaHtml('Franja Kids · Proposta C «Areia»', 'c.css', ['varela-round-400.woff2', 'figtree-400-700.woff2'])}
<body>
<a class="saltar" href="#conteudo">Saltar para o conteúdo</a>
<header class="topo">
  <div class="contentor topo__barra">
    <a class="topo__marca" href="#" aria-label="Franja Kids, início">${logotipo(92)}</a>
    <nav class="topo__nav" aria-label="Principal"><ul>${lista(MENU)}</ul></nav>
    <div class="topo__accoes">
      <a class="topo__procura" href="#">${icone('procurar', 'icone icone--pequeno')}<span>Procurar</span></a>
      <a class="redondo topo__procurar" href="#" aria-label="Procurar">${icone('procurar')}</a>
      <a class="redondo" href="#" aria-label="Carrinho, sem artigos">${icone('saco')}</a>
      <button class="redondo topo__menu" type="button" data-menu aria-expanded="false" aria-controls="menu-telemovel">${icone('menu')}<span class="so-leitor">Menu</span></button>
    </div>
  </div>
  <nav id="menu-telemovel" class="menu-telemovel" aria-label="Principal" hidden>
    <ul class="contentor">${lista(MENU)}</ul>
  </nav>
</header>

<main id="conteudo">
  <section class="contentor heroi" aria-labelledby="t-heroi">
    <div class="heroi__texto">
      <h1 id="t-heroi">Tu imaginas, nós personalizamos.</h1>
      <p>Roupa e presentes com nome, feitos por encomenda para bebés, crianças e família.</p>
      <div class="heroi__botoes">
        <a class="botao botao--cheio" href="#">Começar a personalizar</a>
        <a class="ligacao" href="#ocasioes">Ver ocasiões ${icone('seta', 'icone icone--pequeno')}</a>
      </div>
    </div>
    <div class="heroi__imagem">
      ${foto('vais-ser-avo', { sizes: '(min-width: 1024px) 460px, calc(100vw - 72px)', prioridade: true, classe: 'heroi__foto' })}
      <svg class="selo" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <defs><path id="selo-circulo" d="M60 60m-43 0a43 43 0 1 1 86 0a43 43 0 1 1-86 0"/></defs>
        <circle cx="60" cy="60" r="58"/>
        <text><textPath href="#selo-circulo" textLength="266" lengthAdjust="spacing">FEITO POR ENCOMENDA · COM AMOR ·</textPath></text>
        <path class="selo__coracao" d="M60 72s-11-6.8-11-15.2A6.1 6.1 0 0 1 60 53a6.1 6.1 0 0 1 11 3.8C71 65.2 60 72 60 72z"/>
      </svg>
    </div>
  </section>

  <section id="ocasioes" class="seccao" aria-labelledby="t-ocasioes">
    <div class="contentor seccao__topo"><h2 id="t-ocasioes">Para quem é?</h2></div>
    <ul class="contentor ocasioes">
      ${OCASIOES.map(([n, f]) => `<li><a href="#"><span class="ocasioes__nome">${n}</span>${foto(f, { sizes: '84px', alt: '', classe: 'ocasioes__foto' })}${icone('seta', 'icone icone--pequeno ocasioes__seta')}</a></li>`).join('')}
    </ul>
  </section>

  <section class="seccao" aria-labelledby="t-loja">
    <div class="contentor seccao__topo"><h2 id="t-loja">O que fazemos</h2></div>
    <ul class="contentor linhas">
      ${LINHAS.map(([n, f, subs]) => `<li class="linhas__cartao">${foto(f, { sizes: '(min-width: 1024px) 380px, calc(100vw - 40px)', alt: '', classe: 'linhas__foto' })}<h3><a href="#">${n}</a></h3><ul class="linhas__subs">${subs.map((s) => `<li><a href="#">${s}</a></li>`).join('')}</ul></li>`).join('')}
    </ul>
  </section>

  <section class="seccao" aria-labelledby="t-destaques">
    <div class="contentor seccao__topo">
      <h2 id="t-destaques">Mais pedidos</h2>
      <a class="ligacao" href="#">Ver tudo ${icone('seta', 'icone icone--pequeno')}</a>
    </div>
    <ul class="fila produtos">
      ${DESTAQUES.map(([n, f, i]) => `<li><a href="#"><div class="produtos__foto">${foto(f, { sizes: '(min-width: 1024px) 270px, 66vw', alt: '' })}</div><h3>${n}</h3><p>${i}</p></a></li>`).join('')}
    </ul>
  </section>

  <section id="como-funciona" class="seccao" aria-labelledby="t-como">
    <div class="contentor seccao__topo"><h2 id="t-como">Como funciona</h2></div>
    <ol class="contentor passos">
      ${PASSOS.map(([t, d, i]) => `<li><span class="passos__icone">${icone(i)}</span><h3>${t}</h3><p>${d}</p></li>`).join('')}
    </ol>
  </section>

  <section class="seccao" aria-labelledby="t-sobre">
    <div class="contentor sobre">
      ${foto('mercadinho', { sizes: '(min-width: 1024px) 520px, calc(100vw - 72px)', classe: 'sobre__foto' })}
      <div class="sobre__texto">
        <h2 id="t-sobre">Duas amigas, uma ideia</h2>
        <p>${SOBRE}</p>
        <a class="botao botao--linha" href="#">A nossa história</a>
      </div>
    </div>
  </section>

  <section class="seccao" aria-labelledby="t-insta">
    <div class="contentor seccao__topo">
      <h2 id="t-insta">Do nosso Instagram</h2>
      <a class="ligacao" href="${IG_URL}">@franjakids ${icone('seta', 'icone icone--pequeno')}</a>
    </div>
    <ul class="contentor insta">
      ${INSTAGRAM.map((f) => `<li><a href="${IG_URL}">${foto(f, { sizes: '(min-width: 1024px) 190px, 31vw' })}</a></li>`).join('')}
    </ul>
  </section>
</main>
${rodape()}
${SCRIPT}
</body>
</html>
`;
