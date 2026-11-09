// Proposta A «Creme»: o creme do logótipo, botões coral, o oliva em pormenores; Varela Round + Nunito.
import { cabecaHtml, foto, logotipo, icone, rodape, MENU, OCASIOES, CATEGORIAS, DESTAQUES, PASSOS, CONFIANCA, INSTAGRAM, IG_URL, SOBRE, SCRIPT } from '../comum.mjs';

const menu = MENU.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join('');

export default () => `${cabecaHtml('Franja Kids · Proposta A «Creme»', 'a.css', ['varela-round-400.woff2', 'nunito-400-800.woff2'])}
<body>
<a class="saltar" href="#conteudo">Saltar para o conteúdo</a>
<header class="topo">
  <div class="contentor topo__barra">
    <button class="redondo topo__menu" type="button" data-menu aria-expanded="false" aria-controls="menu-telemovel">${icone('menu')}<span class="so-leitor">Menu</span></button>
    <a class="topo__marca" href="#" aria-label="Franja Kids, início">${logotipo(104)}</a>
    <nav class="topo__nav" aria-label="Principal"><ul>${menu}</ul></nav>
    <div class="topo__accoes">
      <a class="redondo topo__procurar" href="#" aria-label="Procurar">${icone('procurar')}</a>
      <a class="redondo" href="#" aria-label="Carrinho, sem artigos">${icone('saco')}</a>
    </div>
  </div>
  <nav id="menu-telemovel" class="menu-telemovel" aria-label="Principal" hidden>
    <ul class="contentor">${menu}<li><a href="#">Procurar</a></li></ul>
  </nav>
</header>

<main id="conteudo">
  <section class="heroi" aria-labelledby="t-heroi">
    <div class="contentor heroi__grelha">
      <div class="heroi__texto">
        <h1 id="t-heroi">Personalizamos momentos especiais.</h1>
        <p>Roupa e presentes para bebés, crianças e família, com o nome ou a frase que escolheres.</p>
        <div class="heroi__botoes">
          <a class="botao botao--cheio" href="#">Ver personalizados</a>
          <a class="botao botao--linha" href="#como-funciona">Como funciona</a>
        </div>
      </div>
      <div class="heroi__imagem">
        ${foto('colinho', { sizes: '(min-width: 1024px) 540px, calc(100vw - 40px)', prioridade: true, classe: 'heroi__foto' })}
        <p class="heroi__selo">${icone('coracao')}<span>Feito por encomenda, peça a peça</span></p>
      </div>
    </div>
    <ul class="contentor confianca">
      ${CONFIANCA.map(([i, t]) => `<li><span class="confianca__icone">${icone(i)}</span>${t}</li>`).join('')}
    </ul>
  </section>

  <section id="ocasioes" class="seccao" aria-labelledby="t-ocasioes">
    <div class="contentor seccao__topo"><h2 id="t-ocasioes">Para cada momento</h2></div>
    <ul class="fila ocasioes">
      ${OCASIOES.map(([n, f]) => `<li><a href="#">${foto(f, { sizes: '96px', alt: '', classe: 'ocasioes__foto' })}<span>${n}</span></a></li>`).join('')}
    </ul>
  </section>

  <section class="seccao" aria-labelledby="t-loja">
    <div class="contentor seccao__topo">
      <h2 id="t-loja">Explorar a loja</h2>
      <a class="ligacao" href="#">Ver tudo ${icone('seta', 'icone icone--pequeno')}</a>
    </div>
    <ul class="contentor categorias">
      ${CATEGORIAS.map(([n, f, i]) => `<li><a href="#">${foto(f, { sizes: '(min-width: 1024px) 380px, (min-width: 768px) 30vw, 45vw', alt: '', classe: 'categorias__foto' })}<h3>${n}</h3><p>${i}</p></a></li>`).join('')}
    </ul>
  </section>

  <section class="seccao" aria-labelledby="t-destaques">
    <div class="contentor seccao__topo"><h2 id="t-destaques">Mais pedidos</h2></div>
    <ul class="contentor produtos">
      ${DESTAQUES.map(([n, f, i]) => `<li><a href="#"><div class="produtos__foto">${foto(f, { sizes: '(min-width: 1024px) 280px, 45vw', alt: '' })}<span class="etiqueta">Personalizável</span></div><h3>${n}</h3><p>${i}</p></a></li>`).join('')}
    </ul>
  </section>

  <section id="como-funciona" class="seccao" aria-labelledby="t-como">
    <div class="contentor seccao__topo"><h2 id="t-como">Como funciona</h2></div>
    <ol class="contentor passos">
      ${PASSOS.map(([t, d], k) => `<li><span class="passos__n" aria-hidden="true">${k + 1}</span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('')}
    </ol>
  </section>

  <section class="seccao" aria-labelledby="t-sobre">
    <div class="contentor sobre">
      ${foto('donas', { sizes: '(min-width: 1024px) 440px, calc(100vw - 40px)', classe: 'sobre__foto' })}
      <div class="sobre__texto">
        <h2 id="t-sobre">Feito por duas amigas</h2>
        <p>${SOBRE}</p>
        <a class="botao botao--linha" href="#">Conhecer a Franja</a>
      </div>
    </div>
  </section>

  <section class="seccao" aria-labelledby="t-insta">
    <div class="contentor seccao__topo">
      <h2 id="t-insta">No Instagram</h2>
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
