// Conteúdo e peças comuns às três propostas da página inicial (9 nov 2026).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
export const FOTOS = JSON.parse(readFileSync(RAIZ + 'assets/fotos/fotos.json', 'utf8'));
const A = '../../assets';

export function foto(nome, { sizes = '100vw', classe = '', prioridade = false, alt } = {}) {
  const f = FOTOS[nome];
  if (!f) throw new Error('fotografia em falta: ' + nome);
  const set = (ext) => f.larguras.map((w) => `${A}/fotos/${nome}-${w}.${ext} ${w}w`).join(', ');
  const meio = f.larguras[Math.min(1, f.larguras.length - 1)];
  const texto = alt === undefined ? f.alt : alt;
  return `<picture${classe ? ` class="${classe}"` : ''}>`
    + `<source type="image/avif" srcset="${set('avif')}" sizes="${sizes}">`
    + `<source type="image/webp" srcset="${set('webp')}" sizes="${sizes}">`
    + `<img src="${A}/fotos/${nome}-${meio}.jpg" srcset="${set('jpg')}" sizes="${sizes}" width="${f.w}" height="${f.h}" alt="${texto}"`
    + ` style="object-position:${f.foco}"${prioridade ? ' fetchpriority="high"' : ' loading="lazy"'}>`
    + `</picture>`;
}

export function logotipo(largura = 140, classe = 'logotipo') {
  return `<picture class="${classe}"><source type="image/webp" srcset="${A}/marca/logotipo-320.webp 320w, ${A}/marca/logotipo-640.webp 640w" sizes="${largura}px">`
    + `<img src="${A}/marca/logotipo-320.png" srcset="${A}/marca/logotipo-320.png 320w, ${A}/marca/logotipo-640.png 640w" sizes="${largura}px" width="1185" height="839" alt="Franja Kids"></picture>`;
}

const tracos = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  procurar: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  saco: '<path d="M5.5 8.5h13l-1 11.5h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>',
  mensagem: '<path d="M4.5 5.5h15v10h-9l-4.5 3.5v-3.5h-1.5z"/>',
  certo: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  carrinha: '<path d="M3 7h11v9H3zM14 10h3.5l3 3v3H14"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>',
  cartao: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10h18M7 14.5h3"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  coracao: '<path d="M12 19.5s-7-4.3-7-9.7A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7 2.4c0 5.4-7 9.7-7 9.7z"/>',
  lapis: '<path d="m4.5 19.5 1-4L16 5l3 3L8.5 18.5z"/><path d="m13.5 7.5 3 3"/>',
  olho: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  presente: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3.5-6-3.5-5 0m5 0c1.5-3.5 6-3.5 5 0"/>',
  livro: '<path d="M5 4.5h11.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11.5"/>',
  tesoura: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.6 8.4 20 17M8.6 15.6 20 7"/>',
};
export function icone(nome, classe = 'icone') {
  return `<svg class="${classe}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${tracos[nome]}</svg>`;
}

export const MENU = [
  ['Personalizados', '#'],
  ['Bebé', '#'],
  ['Presentes', '#'],
  ['Ocasiões', '#ocasioes'],
  ['Como funciona', '#como-funciona'],
];

export const OCASIOES = [
  ['Bebé a caminho', 'ocasiao-gravidez'],
  ['Avós', 'ocasiao-avos'],
  ['Padrinhos', 'ocasiao-padrinhos'],
  ['Papá', 'ocasiao-papa'],
  ['Mamã', 'ocasiao-mama'],
  ['Irmãos', 'ocasiao-irmaos'],
  ['Entre países', 'ocasiao-entre-paises'],
  ['Natal', 'ocasiao-natal'],
];

export const CATEGORIAS = [
  ['Bodies', 'cat-bodies', '0 a 24 meses'],
  ['T-shirts', 'cat-tshirts', '2 a 14 anos'],
  ['Camisolas', 'cat-camisolas', 'Criança e adulto'],
  ['Conjuntos', 'cat-conjuntos', 'Malhas e algodão'],
  ['Box Franja', 'cat-box', 'Presentes com nome'],
  ['Mantas', 'cat-mantas', 'Para o berço e o colo'],
];

export const DESTAQUES = [
  ['Body «Preparem o colinho»', 'colinho', '0 a 24 meses'],
  ['Body «Aceitas ser minha madrinha?»', 'prod-madrinha', '0 a 24 meses'],
  ['T-shirt «Fui promovido a irmão mais velho»', 'prod-irmao', '2 a 14 anos'],
  ['Box Franja', 'prod-box-rosa', 'Escova e placa com nome'],
];

export const PASSOS = [
  ['Escolhe a peça', 'O tamanho, a cor e a ocasião.', 'saco'],
  ['Diz-nos o nome ou a frase', 'Também mudamos a cor, a letra ou o desenho.', 'lapis'],
  ['Aprovas a pré-visualização', 'Só produzimos depois do teu sim.', 'olho'],
  ['Recebes em casa', 'Pronto em 1 a 2 semanas e enviado por CTT.', 'carrinha'],
];

export const CONFIANCA = [
  ['olho', 'Pré-visualização antes de produzir'],
  ['carrinha', 'Portes grátis a partir de 50 €'],
  ['cartao', 'MB WAY ou cartão'],
];

export const INSTAGRAM = ['ig-forro-fado', 'ig-sonho', 'ig-mapa', 'vais-ser-avo', 'ig-maior-sonho', 'ig-coracao'];
export const IG_URL = 'https://www.instagram.com/franjakids/';
export const IG_MENSAGEM = 'https://ig.me/m/franjakids';

export const SOBRE = 'A Franja Kids nasceu em setembro de 2025. Começámos pela roupa de bebé e foram vocês que nos levaram para os personalizados: hoje cada peça sai das nossas mãos com um nome e uma história.';

export function cabecaHtml(titulo, css, letras) {
  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<meta name="robots" content="noindex">
<meta name="description" content="Roupa e presentes personalizados para bebés, crianças e família. Bodies, t-shirts, camisolas e a Box Franja, com o nome ou a frase que escolheres.">
<meta name="theme-color" content="#FFF7E4">
${letras.map((l) => `<link rel="preload" href="${A}/fontes/${l}" as="font" type="font/woff2" crossorigin>`).join('\n')}
<link rel="stylesheet" href="${A}/fontes/fontes.css">
<link rel="stylesheet" href="../base.css">
<link rel="stylesheet" href="${css}">
</head>`;
}

export const SCRIPT = `<script>
(() => {
  const botao = document.querySelector('[data-menu]');
  const painel = document.getElementById('menu-telemovel');
  if (!botao || !painel) return;
  const fechar = () => { botao.setAttribute('aria-expanded', 'false'); painel.hidden = true; };
  botao.addEventListener('click', () => {
    const aberto = botao.getAttribute('aria-expanded') === 'true';
    botao.setAttribute('aria-expanded', String(!aberto));
    painel.hidden = aberto;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !painel.hidden) { fechar(); botao.focus(); } });
  matchMedia('(min-width: 1024px)').addEventListener('change', (m) => { if (m.matches) fechar(); });
})();
</script>`;

export function rodape(classe = 'rodape') {
  return `<footer class="${classe}">
  <div class="contentor rodape__grelha">
    <div class="rodape__marca">
      <a href="#" aria-label="Franja Kids, início">${logotipo(150, 'logotipo logotipo--rodape')}</a>
      <p>Personalizamos momentos especiais.</p>
      <div class="rodape__redes">
        <a class="redondo" href="${IG_URL}" aria-label="Instagram da Franja Kids">${icone('instagram')}</a>
        <a class="redondo" href="${IG_MENSAGEM}" aria-label="Enviar uma mensagem">${icone('mensagem')}</a>
      </div>
    </div>
    <nav class="rodape__coluna" aria-labelledby="rodape-loja">
      <h2 id="rodape-loja">Loja</h2>
      <ul><li><a href="#">Personalizados</a></li><li><a href="#">Bebé</a></li><li><a href="#">Presentes</a></li><li><a href="#ocasioes">Ocasiões</a></li></ul>
    </nav>
    <nav class="rodape__coluna" aria-labelledby="rodape-ajuda">
      <h2 id="rodape-ajuda">Ajuda</h2>
      <ul><li><a href="#como-funciona">Como encomendar</a></li><li><a href="#">Envios e prazos</a></li><li><a href="#">Trocas e devoluções</a></li><li><a href="#">Contactos</a></li></ul>
    </nav>
  </div>
  <div class="contentor rodape__legal">
    <p>© 2026 Franja Kids</p>
    <ul>
      <li><a href="#">Termos e condições</a></li>
      <li><a href="#">Política de privacidade</a></li>
      <li><a class="lr-discreto" href="https://www.livroreclamacoes.pt/Inicio/" rel="noopener">${icone('livro', 'icone icone--pequeno')}Livro de Reclamações</a></li>
    </ul>
  </div>
</footer>`;
}
