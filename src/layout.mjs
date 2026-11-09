// O esqueleto de todas as páginas: cabeça, topo, rodapé e a gaveta do carrinho.
import { livroReclamacoes } from '../legal-comum/index.mjs';
import { url, absoluto, esc, icone, logotipo, PRODUCAO } from './util.mjs';

export const MENU = [
  ['Personalizados', '/personalizados/'],
  ['Bebé', '/bebe/'],
  ['Presentes', '/presentes/'],
  ['Como funciona', '/como-funciona/'],
  ['Sobre nós', '/sobre/'],
];

export function pagina({ loja, versao, caminho, titulo, descricao, corpo, imagem, jsonld = [], semRodape = false }) {
  const tituloCompleto = caminho === '/' ? `${loja.nome} · Roupa e presentes personalizados` : `${titulo} · ${loja.nome}`;
  const og = imagem ? absoluto(`/assets/fotos/${imagem}-720.jpg`) : absoluto('/assets/marca/logotipo-640.png');
  const lista = (classe) => MENU.map(([t, h]) => `<li><a href="${url(h)}"${caminho.startsWith(h) ? ' aria-current="page"' : ''}>${t}</a></li>`).join('');
  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(tituloCompleto)}</title>
<meta name="description" content="${esc(descricao || loja.descricao)}">
${PRODUCAO ? '' : '<meta name="robots" content="noindex, nofollow">\n'}<link rel="canonical" href="${absoluto(caminho)}">
<meta name="theme-color" content="#F7EEDF">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_PT">
<meta property="og:site_name" content="${esc(loja.nome)}">
<meta property="og:title" content="${esc(tituloCompleto)}">
<meta property="og:description" content="${esc(descricao || loja.descricao)}">
<meta property="og:url" content="${absoluto(caminho)}">
<meta property="og:image" content="${og}">
<link rel="icon" href="${url('/assets/marca/icone-32.png')}" sizes="32x32">
<link rel="apple-touch-icon" href="${url('/assets/marca/icone-180.png')}">
<link rel="preload" href="${url('/assets/fontes/varela-round-400.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${url('/assets/fontes/figtree-400-700.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${url('/assets/fontes/fontes.css')}">
<link rel="stylesheet" href="${url('/assets/css/site.css')}?v=${versao}">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body data-base="${BASE_ATTR()}">
<a class="saltar" href="#conteudo">Saltar para o conteúdo</a>
<header class="topo">
  <div class="contentor topo__barra">
    <a class="topo__marca" href="${url('/')}" aria-label="Franja Kids, início">${logotipo(92)}</a>
    <nav class="topo__nav" aria-label="Principal"><ul>${lista()}</ul></nav>
    <div class="topo__accoes">
      <a class="topo__procura" href="${url('/procurar/')}">${icone('procurar', 'icone icone--pequeno')}<span>Procurar</span></a>
      <a class="redondo topo__procurar" href="${url('/procurar/')}" aria-label="Procurar">${icone('procurar')}</a>
      <a class="redondo topo__saco" href="${url('/carrinho/')}" aria-label="Carrinho" data-carrinho-ligacao>${icone('saco')}<span class="topo__conta" data-carrinho-conta hidden></span></a>
      <button class="redondo topo__menu" type="button" data-menu aria-expanded="false" aria-controls="menu-telemovel">${icone('menu')}<span class="so-leitor">Menu</span></button>
    </div>
  </div>
  <nav id="menu-telemovel" class="menu-telemovel" aria-label="Principal" hidden>
    <ul class="contentor">${lista()}</ul>
  </nav>
</header>

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
