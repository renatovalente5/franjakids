// Peças comuns do gerador: caminhos, escapes, fotografias, ícones e preços.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RAIZ = fileURLToPath(new URL('..', import.meta.url));
// --base=/franjakids --site=https://… --producao (ou as variáveis BASE, SITE_URL e PRODUCAO=1)
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
export const BASE = (arg('base') ?? process.env.BASE ?? '').replace(/\/$/, '');
export const SITE_URL = (arg('site') ?? process.env.SITE_URL ?? 'http://127.0.0.1:8985').replace(/\/$/, '');
export const PRODUCAO = process.argv.includes('--producao') || process.env.PRODUCAO === '1';

export const lerTexto = (f) => readFileSync(RAIZ + f, 'utf8');
export const ler = (f) => JSON.parse(lerTexto(f));

export const url = (caminho = '/') => BASE + caminho;
export const absoluto = (caminho = '/') => SITE_URL + BASE + caminho;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function euro(n) {
  return n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ── Fotografias ──
// As versões web (scripts/imagens.py → .cache/imagens/manifesto.json) e a descrição e o foco de
// cada uma (content/fotos.json). O build.mjs carrega-as antes de gerar as páginas.
export const MANIFESTO = RAIZ + '.cache/imagens/manifesto.json';
export const FOTOS = {};
export function carregarFotos(indice) {
  if (!existsSync(MANIFESTO)) throw new Error('faltam as imagens: correr python3 scripts/imagens.py');
  const m = JSON.parse(readFileSync(MANIFESTO, 'utf8')).fotos;
  for (const [nome, v] of Object.entries(m)) {
    if (!indice[nome]) continue;
    FOTOS[nome] = { ...v, alt: indice[nome].alt, foco: indice[nome].foco || '50% 50%' };
  }
  return FOTOS;
}
const ficheiroDe = (f, nome, w, fmt) => url(`/assets/img/${nome}-${f.resumo}-${w}.${fmt}`);
// a versão JPEG (o cartão de partilha e o JSON-LD: o WhatsApp não lê AVIF)
export const fotoJpg = (nome) => { const f = FOTOS[nome]; return f ? SITE_URL + ficheiroDe(f, nome, f.jpg, 'jpg') : null; };
// a miniatura do carrinho e da gaveta (a de 360, em WebP)
export const fotoPequena = (nome) => { const f = FOTOS[nome]; return f ? ficheiroDe(f, nome, f.larguras[0], 'webp') : ''; };

export function foto(nome, { sizes = '100vw', classe = '', prioridade = false, lazy = !prioridade, alt } = {}) {
  const f = FOTOS[nome];
  if (!f) throw new Error('fotografia em falta: ' + nome);
  const set = (fmt) => f.larguras.map((w) => `${ficheiroDe(f, nome, w, fmt)} ${w}w`).join(', ');
  const meio = f.larguras[Math.min(1, f.larguras.length - 1)];
  const texto = alt === undefined ? f.alt : alt;
  return `<picture${classe ? ` class="${classe}"` : ''}>`
    + (f.formatos.includes('avif') ? `<source type="image/avif" srcset="${set('avif')}" sizes="${sizes}">` : '')
    + `<img src="${ficheiroDe(f, nome, meio, 'webp')}" srcset="${set('webp')}" sizes="${sizes}" width="${f.largura}" height="${f.altura}" alt="${esc(texto)}"`
    + ` style="object-position:${f.foco}"${prioridade ? ' fetchpriority="high"' : ''}${lazy && !prioridade ? ' loading="lazy"' : ''}>`
    + `</picture>`;
}

export function logotipo(largura = 140, classe = 'logotipo') {
  const m = (f) => url('/assets/marca/' + f);
  return `<picture class="${classe}"><source type="image/webp" srcset="${m('logotipo-320.webp')} 320w, ${m('logotipo-640.webp')} 640w" sizes="${largura}px">`
    + `<img src="${m('logotipo-320.png')}" srcset="${m('logotipo-320.png')} 320w, ${m('logotipo-640.png')} 640w" sizes="${largura}px" width="1185" height="839" alt="Franja Kids"></picture>`;
}

const TRACOS = {
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
  relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  troca: '<path d="M4 9h13l-3.5-3.5M20 15H7l3.5 3.5"/>',
  local: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
};
export function icone(nome, classe = 'icone') {
  return `<svg class="${classe}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TRACOS[nome]}</svg>`;
}

// O que ainda não foi dito (os dados legais, os portes): na pré-visualização, um marcador à vista;
// em produção as regras param a publicação antes de chegar aqui.
export const porConfirmar = (o_que) => `[por confirmar: ${o_que}]`;
