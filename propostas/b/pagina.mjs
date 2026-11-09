// Proposta B «Oliva»: papel claro, botões oliva, título em duas cores como o logótipo; M PLUS Rounded 1c + Figtree.
import { cabecaHtml, foto, logotipo, icone, rodape, MENU, OCASIOES, CATEGORIAS, DESTAQUES, PASSOS, INSTAGRAM, IG_URL, SCRIPT } from '../comum.mjs';

const lista = (itens) => itens.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join('');

export default () => `${cabecaHtml('Franja Kids · Proposta B «Oliva»', 'b.css', ['m-plus-rounded-1c-800.woff2', 'figtree-400-700.woff2'])}
<body>
<a class="saltar" href="#conteudo">Saltar para o conteúdo</a>
<header class="topo">
  <div class="contentor topo__barra">
    <div class="topo__esquerda">
      <button class="redondo topo__menu" type="button" data-menu aria-expanded="false" aria-controls="menu-telemovel">${icone('menu')}<span class="so-leitor">Menu</span></button>
      <nav class="topo__nav" aria-label="Loja"><ul>${lista(MENU.slice(0, 3))}</ul></nav>
    </div>
    <a class="topo__marca" href="#" aria-label="Franja Kids, início">${logotipo(108)}</a>
    <div class="topo__direita">
      <nav class="topo__nav" aria-label="Ajuda"><ul>${lista(MENU.slice(3))}</ul></nav>
      <a class="redondo topo__procurar" href="#" aria-label="Procurar">${icone('procurar')}</a>
      <a class="redondo" href="#" aria-label="Carrinho, sem artigos">${icone('saco')}</a>
    </div>
  </div>
  <nav id="menu-telemovel" class="menu-telemovel" aria-label="Principal" hidden>
    <ul class="contentor">${lista(MENU)}<li><a href="#">Procurar</a></li></ul>
  </nav>
</header>

<main id="conteudo">
  <section class="heroi" aria-labelledby="t-heroi">
    <div class="contentor heroi__texto">
      <h1 id="t-heroi">Pequenos detalhes, <em>grandes histórias.</em></h1>
      <p>Bodies, t-shirts e presentes personalizados para anunciar, convidar e celebrar.</p>
      <a class="botao botao--cheio" href="#">Explorar a loja ${icone('seta', 'icone icone--pequeno')}</a>
    </div>
    <div class="contentor mosaico">
      ${foto('vais-ser-avo', { sizes: '(min-width: 1024px) 330px, 45vw', classe: 'mosaico__a', prioridade: false })}
      ${foto('familia-colinho', { sizes: '(min-width: 1024px) 470px, calc(100vw - 40px)', classe: 'mosaico__b', prioridade: true })}
      ${foto('cat-conjuntos', { sizes: '(min-width: 1024px) 330px, 45vw', classe: 'mosaico__c' })}
      ${foto('prod-dad-mini', { sizes: '(min-width: 1024px) 330px, 45vw', classe: 'mosaico__d' })}
    </div>
  </section>

  <section id="ocasioes" class="seccao" aria-labelledby="t-ocasioes">
    <div class="contentor seccao__topo"><h2 id="t-ocasioes">Encontra pela ocasião</h2></div>
    <ul class="fila pilulas">
      ${OCASIOES.map(([n, f]) => `<li><a href="#">${foto(f, { sizes: '40px', alt: '', classe: 'pilulas__foto' })}${n}</a></li>`).join('')}
    </ul>
  </section>

  <section class="seccao" aria-labelledby="t-loja">
    <div class="contentor seccao__topo">
      <h2 id="t-loja">A loja</h2>
      <a class="ligacao" href="#">Ver tudo ${icone('seta', 'icone icone--pequeno')}</a>
    </div>
    <ul class="contentor categorias">
      ${CATEGORIAS.map(([n, f, i]) => `<li><a href="#">${foto(f, { sizes: '(min-width: 1024px) 380px, 45vw', alt: '', classe: 'categorias__foto' })}<span class="categorias__rotulo"><span><strong>${n}</strong><small>${i}</small></span>${icone('seta', 'icone icone--pequeno')}</span></a></li>`).join('')}
    </ul>
  </section>

  <section class="seccao" aria-labelledby="t-destaques">
    <div class="contentor seccao__topo"><h2 id="t-destaques">Os mais pedidos</h2></div>
    <ul class="contentor produtos">
      ${DESTAQUES.map(([n, f, i]) => `<li><a href="#"><div class="produtos__foto">${foto(f, { sizes: '(min-width: 1024px) 280px, 45vw', alt: '' })}</div><p class="produtos__tipo">Personalizável</p><h3>${n}</h3><p>${i}</p></a></li>`).join('')}
    </ul>
  </section>

  <section id="como-funciona" class="seccao" aria-labelledby="t-como">
    <div class="contentor painel">
      <h2 id="t-como">Como funciona</h2>
      <ol class="passos">
        ${PASSOS.map(([t, d], k) => `<li><span class="passos__n" aria-hidden="true">0${k + 1}</span><h3>${t}</h3><p>${d}</p></li>`).join('')}
      </ol>
    </div>
  </section>

  <section class="seccao" aria-labelledby="t-sobre">
    <div class="contentor sobre">
      ${foto('donas', { sizes: '120px', classe: 'sobre__foto' })}
      <h2 id="t-sobre" class="so-leitor">Quem somos</h2>
      <blockquote>
        <p>«Vocês escolheram-nos para os personalizados... e nós decidimos aceitar esse caminho.»</p>
      </blockquote>
      <p class="sobre__quem">As duas amigas da Franja Kids, desde setembro de 2025</p>
      <a class="ligacao" href="#">A nossa história ${icone('seta', 'icone icone--pequeno')}</a>
    </div>
  </section>

  <section class="seccao" aria-labelledby="t-insta">
    <div class="contentor seccao__topo">
      <h2 id="t-insta">@franjakids</h2>
      <a class="botao botao--linha" href="${IG_URL}">${icone('instagram', 'icone icone--pequeno')} Seguir</a>
    </div>
    <ul class="fila insta">
      ${INSTAGRAM.map((f) => `<li><a href="${IG_URL}">${foto(f, { sizes: '(min-width: 1024px) 190px, 40vw' })}</a></li>`).join('')}
    </ul>
  </section>
</main>
${rodape()}
${SCRIPT}
</body>
</html>
`;
