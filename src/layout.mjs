// O esqueleto de todas as páginas: cabeça, topo, rodapé e a gaveta do carrinho.
import { livroReclamacoes } from '../legal-comum/index.mjs';
import { url, absoluto, esc, icone, logotipo, fotoJpg, PRODUCAO, FOTOS } from './util.mjs';
import { TITULO_INICIO } from './seo.mjs';

/* O que diz aos motores de busca: na pré-visualização (sem --producao), nada entra (noindex, nofollow, e o
   robots.txt fecha tudo); em produção entra tudo menos as páginas com `indexar: false` (noindex, follow: o
   Google segue as ligações delas, e elas ficam fora do sitemap). */
const robots = (indexar) => (!PRODUCAO ? '<meta name="robots" content="noindex, nofollow">\n' : indexar ? '' : '<meta name="robots" content="noindex, follow">\n');

/* O cartão de partilha: a fotografia da página em JPEG (o WhatsApp não lê AVIF), com as medidas e a descrição. */
function imagemDePartilha(imagem) {
  const f = imagem && FOTOS[imagem];
  if (!f) return `<meta property="og:image" content="${absoluto('/assets/marca/logotipo-640.png')}">\n<meta property="og:image:alt" content="Franja Kids">`;
  return `<meta property="og:image" content="${fotoJpg(imagem)}">
<meta property="og:image:width" content="${f.jpg}">
<meta property="og:image:height" content="${Math.round((f.jpg * f.altura) / f.largura)}">
<meta property="og:image:alt" content="${esc(f.alt)}">`;
}

/* JSON-LD dentro de um <script>: um «</script>» num nome fechava-o antes do tempo. */
const ld = (j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`;

export const MENU = [
  ['Personalizados', '/personalizados/'],
  ['Bebé', '/bebe/'],
  ['Presentes', '/presentes/'],
  ['Como funciona', '/como-funciona/'],
  ['Sobre nós', '/sobre/'],
];

export function pagina({ loja, versao, api = '', caminho, titulo, tituloSeo, descricao, corpo, imagem, jsonld = [], semRodape = false, indexar = true }) {
  // um nome comprido (os produtos têm os nomes que a dona escreve) vai sem « · Franja Kids»: o Google corta
  // o título a ~60 caracteres e já mostra o nome do site por cima do resultado
  const base = tituloSeo || titulo;
  const tituloCompleto = caminho === '/' ? `${loja.nome} · ${TITULO_INICIO}` : `${base} · ${loja.nome}`.length > 65 ? base : `${base} · ${loja.nome}`;
  const lista = (classe) => MENU.map(([t, h]) => `<li><a href="${url(h)}"${caminho.startsWith(h) ? ' aria-current="page"' : ''}>${t}</a></li>`).join('');
  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script>document.documentElement.classList.add('js')</script>
<style>@media (prefers-reduced-motion: no-preference) { @view-transition { navigation: auto; } }</style>
<title>${esc(tituloCompleto)}</title>
<meta name="description" content="${esc(descricao || loja.descricao)}">
${robots(indexar)}<link rel="canonical" href="${absoluto(caminho)}">
<meta name="theme-color" content="#F7EEDF">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_PT">
<meta property="og:site_name" content="${esc(loja.nome)}">
<meta property="og:title" content="${esc(tituloCompleto)}">
<meta property="og:description" content="${esc(descricao || loja.descricao)}">
<meta property="og:url" content="${absoluto(caminho)}">
${imagemDePartilha(imagem)}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${url('/assets/marca/icone-32.png')}" sizes="32x32">
<link rel="apple-touch-icon" href="${url('/assets/marca/icone-180.png')}">
<link rel="preload" href="${url('/assets/fontes/varela-round-400.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${url('/assets/fontes/figtree-400-700.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${url('/assets/fontes/fontes.css')}">
<link rel="stylesheet" href="${url('/assets/css/site.css')}?v=${versao}">
${jsonld.map(ld).join('\n')}
</head>
<body data-base="${BASE_ATTR()}" data-api="${esc(api)}">
<a class="saltar" href="#conteudo">Saltar para o conteúdo</a>
<header class="topo">
  <div class="contentor topo__barra">
    <a class="topo__marca" href="${url('/')}" aria-label="Franja Kids, início">${logotipo(92)}</a>
    <nav class="topo__nav" aria-label="Principal"><ul>${lista()}</ul></nav>
    <div class="topo__accoes">
      <a class="topo__procura" href="${url('/procurar/')}">${icone('procurar', 'icone icone--pequeno')}<span>Procurar</span></a>
      <a class="redondo topo__procurar" href="${url('/procurar/')}" aria-label="Procurar">${icone('procurar')}</a>
      <a class="redondo topo__saco" href="${url('/carrinho/')}" aria-label="Carrinho" data-carrinho-ligacao>${icone('saco')}<span class="topo__conta" data-carrinho-conta hidden></span></a>
      <button class="redondo topo__menu" type="button" data-menu aria-expanded="false" aria-controls="menu-telemovel">${icone('menu', 'icone icone--abrir')}${icone('fechar', 'icone icone--fechar')}<span class="so-leitor">Menu</span></button>
    </div>
  </div>
</header>
<nav id="menu-telemovel" class="menu-telemovel" aria-label="Principal" hidden>
  <ul class="contentor">${MENU.map(([t, h]) => `<li><a href="${url(h)}"${caminho.startsWith(h) ? ' aria-current="page"' : ''}>${t}${icone('seta', 'icone')}</a></li>`).join('')}</ul>
  <div class="contentor menu-telemovel__fim"><a href="https://www.instagram.com/${loja.instagram}/">${icone('instagram', 'icone icone--pequeno')}@${loja.instagram}</a><a href="${url('/contactos/')}">Contactos</a></div>
</nav>
<script>/* o número do carrinho já no primeiro desenho (a passagem entre páginas não pisca); o site.js mantém-no. A chave é a do site.js (CHAVE). */try{const n=(JSON.parse(localStorage.getItem('franja:carrinho:v2'))||[]).reduce((s,i)=>s+(i.qtd||0),0);if(n>0){const b=document.querySelector('[data-carrinho-conta]');b.textContent=n;b.hidden=false}}catch(e){}</script>

<main id="conteudo">
${corpo}
</main>
${semRodape ? '' : rodape(loja)}
<dialog class="gaveta" id="gaveta" aria-labelledby="gaveta-titulo">
  <div class="gaveta__topo"><h2 id="gaveta-titulo">Juntámos ao carrinho</h2><button class="redondo" type="button" data-fechar aria-label="Fechar">${icone('fechar')}</button></div>
  <div class="gaveta__corpo" data-gaveta-corpo></div>
  <div class="gaveta__fim">
    <p class="progresso" data-progresso></p>
    <a class="botao botao--cheio" href="${url('/carrinho/')}">Ver o carrinho</a>
    <button class="botao botao--linha" type="button" data-fechar>Continuar a ver</button>
  </div>
</dialog>
<p class="so-leitor" aria-live="polite" data-anuncio></p>
<script src="${url('/assets/js/site.js')}?v=${versao}" defer></script>
</body>
</html>
`;
}

// O BASE vai no body para o JavaScript montar caminhos (fotografias e ligações do carrinho).
const BASE_ATTR = () => esc(url(''));

export function rodape(loja) {
  return `<footer class="rodape">
  <div class="contentor rodape__grelha">
    <div class="rodape__marca">
      <a href="${url('/')}" aria-label="Franja Kids, início">${logotipo(140, 'logotipo logotipo--rodape')}</a>
      <p>${esc(loja.slogan)}</p>
      <div class="rodape__redes">
        <a class="redondo" href="https://www.instagram.com/${loja.instagram}/" aria-label="Instagram da Franja Kids">${icone('instagram')}</a>
        <a class="redondo" href="https://ig.me/m/${loja.instagram}" aria-label="Enviar uma mensagem">${icone('mensagem')}</a>
      </div>
    </div>
    <nav class="rodape__coluna" aria-labelledby="rodape-loja">
      <h2 id="rodape-loja">Loja</h2>
      <ul><li><a href="${url('/personalizados/')}">Personalizados</a></li><li><a href="${url('/bebe/')}">Bebé</a></li><li><a href="${url('/presentes/')}">Presentes</a></li><li><a href="${url('/procurar/')}">Procurar</a></li></ul>
    </nav>
    <nav class="rodape__coluna" aria-labelledby="rodape-ajuda">
      <h2 id="rodape-ajuda">Ajuda</h2>
      <ul><li><a href="${url('/como-funciona/')}">Como encomendar</a></li><li><a href="${url('/envios/')}">Envios e prazos</a></li><li><a href="${url('/trocas-e-devolucoes/')}">Trocas e devoluções</a></li><li><a href="${url('/contactos/')}">Contactos</a></li></ul>
    </nav>
  </div>
  <div class="contentor rodape__legal">
    <p>© 2026 ${esc(loja.nome)}</p>
    <ul>
      <li><a href="${url('/termos/')}">Termos e condições</a></li>
      <li><a href="${url('/privacidade/')}">Política de privacidade</a></li>
      <li>${livroReclamacoes()}</li>
    </ul>
  </div>
</footer>`;
}
