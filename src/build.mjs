// Gera o site em _site/:  node src/build.mjs
// Variáveis: BASE (ex.: /franjakids no GitHub Pages), SITE_URL, PRODUCAO=1 (indexável e sem marcadores por confirmar).
import { mkdirSync, rmSync, writeFileSync, cpSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verificarIdentificacao, procurarFrasesProibidas } from '../legal-comum/index.mjs';
import { RAIZ, BASE, SITE_URL, PRODUCAO, ler, FOTOS, absoluto } from './util.mjs';
import { pagina } from './layout.mjs';
import { inicio, linha, produto, carrinho, finalizar, procurar, sobre, naoEncontrada, sobe } from './paginas.mjs';
import { paginasDeTexto } from './textos.mjs';

const SAIDA = RAIZ + '_site/';
const loja = ler('dados/loja.json');
const catalogo = ler('dados/catalogo.json');
const { produtos, tamanhos, manga } = ler('dados/produtos.json');
for (const p of produtos) p._linha = catalogo.linhas.find((l) => l.categorias.includes(p.categoria))?.id;
const dados = { loja, catalogo, produtos, tamanhos, manga };

// ── Guardas: param a construção antes de publicar um erro ──
const erros = [];
const slugs = new Set();
const ocasioes = new Set(catalogo.ocasioes.map((o) => o.id));
for (const p of produtos) {
  if (slugs.has(p.slug)) erros.push(`produto repetido: ${p.slug}`);
  slugs.add(p.slug);
  if (!catalogo.categorias[p.categoria]) erros.push(`${p.slug}: categoria desconhecida «${p.categoria}»`);
  if (!catalogo.linhas.some((l) => l.categorias.includes(p.categoria))) erros.push(`${p.slug}: a categoria não está em nenhuma linha`);
  for (const o of p.ocasioes) if (!ocasioes.has(o)) erros.push(`${p.slug}: ocasião desconhecida «${o}»`);
  if (p.tamanhos && !tamanhos[p.tamanhos]) erros.push(`${p.slug}: tamanhos desconhecidos «${p.tamanhos}»`);
  p.fotos.forEach((f, i) => { if (!FOTOS[`p-${p.slug}-${i + 1}`]) erros.push(`${p.slug}: falta a fotografia ${i + 1} (correr ferramentas/imagens.py)`); });
  for (const o of p.opcoes || []) {
    // uma escolha obrigatória sem nenhum valor a 0 € faria o preço anunciado impossível de pagar
    if (!o.valores.some(([, s]) => s === 0)) erros.push(`${p.slug}: «${o.nome}» não tem nenhuma escolha sem custo extra; o preço anunciado nunca se pagaria`);
  }
  if (p.preco != null && !(p.preco > 0)) erros.push(`${p.slug}: preço inválido`);
  if (PRODUCAO && p.preco == null) erros.push(`${p.slug}: sem preço (não pode ir para produção assim)`);
}
for (const l of catalogo.linhas) if (!produtos.some((p) => l.categorias.includes(p.categoria))) erros.push(`linha sem produtos: ${l.id}`);
const ident = verificarIdentificacao({ nome: loja.empresa.nome, nif: loja.empresa.nif, morada: loja.empresa.morada, email: loja.empresa.email }, { modo: PRODUCAO ? 'bloquear' : 'avisar', ecra: 'dados/loja.json › empresa' });
if (!PRODUCAO && ident?.avisos?.length) console.warn(`aviso: identificação por confirmar (${ident.avisos.length}); em produção isto pára a publicação`);

// ── Páginas ──
const lista = [
  inicio(dados),
  ...catalogo.linhas.map((l) => linha(dados, l)),
  ...produtos.map((p) => produto(dados, p)),
  carrinho(dados),
  finalizar({ ...dados, termosUrl: '/termos/' }),
  procurar(dados),
  sobre(dados),
  ...paginasDeTexto(loja),
  naoEncontrada(),
];

const versao = createHash('sha1').update(readFileSync(RAIZ + 'assets/css/site.css')).update(readFileSync(RAIZ + 'assets/js/site.js')).digest('hex').slice(0, 8);
rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(SAIDA, { recursive: true });
const html = {};
for (const pg of lista) {
  const ficheiro = pg.caminho.endsWith('.html') ? pg.caminho : pg.caminho + 'index.html';
  html[ficheiro] = pagina({ loja, versao, ...pg });
  mkdirSync(SAIDA + ficheiro.slice(0, ficheiro.lastIndexOf('/')), { recursive: true });
  writeFileSync(SAIDA + ficheiro, html[ficheiro]);
}

// Ligações internas: cada página e cada filtro (?categoria=, ?ocasiao=) têm de existir.
const caminhos = new Set(lista.map((p) => p.caminho));
const filtrosDe = Object.fromEntries(catalogo.linhas.map((l) => [`/${l.id}/`, { categoria: new Set(l.categorias), ocasiao: l.id === 'personalizados' ? ocasioes : new Set() }]));
for (const [f, h] of Object.entries(html)) {
  for (const [, alvo] of h.matchAll(/href="([^"]+)"/g)) {
    if (!alvo.startsWith(BASE + '/') || alvo.startsWith(BASE + '/assets/')) continue;
    const resto = alvo.slice(BASE.length);
    const caminho = resto.split(/[?#]/)[0];
    const q = resto.includes('?') ? resto.split('?')[1].split('#')[0] : '';
    if (!caminhos.has(caminho)) erros.push(`${f}: ligação para uma página que não existe: ${caminho}`);
    if (q) for (const [k, v] of new URLSearchParams(q)) {
      if (!filtrosDe[caminho]?.[k]?.has(v)) erros.push(`${f}: filtro inexistente ${caminho}?${k}=${v}`);
    }
  }
  for (const r of procurarFrasesProibidas(h.replace(/<[^>]+>/g, ' '))) erros.push(`${f}: frase proibida «${r.frase}»`);
}

if (erros.length) {
  console.error('A construção parou:\n- ' + erros.join('\n- '));
  process.exit(1);
}

// ── Recursos ──
for (const d of ['fontes', 'fotos', 'marca', 'css', 'js']) cpSync(RAIZ + 'assets/' + d, SAIDA + 'assets/' + d, { recursive: true, filter: (s) => !s.endsWith('fotos.json') });
// o catálogo que o carrinho usa para recalcular preços (o preço que se mostra é o que se cobra)
const paraCarrinho = Object.fromEntries(produtos.map((p) => [p.slug, {
  nome: p.nome, preco: p.preco, foto: `p-${p.slug}-1`,
  sup: Object.fromEntries((p.opcoes || []).map((o) => [o.nome, Object.fromEntries(o.valores.filter(([, s]) => s).map(([v, s]) => [v, s]))])),
  pers: p.personalizacao ? { rotulo: p.personalizacao.rotulo, suplemento: p.personalizacao.suplemento || 0, opcional: !!p.personalizacao.opcional } : null,
  semDevolucao: !!p.personalizacao && !p.personalizacao.opcional,
}]));
writeFileSync(SAIDA + 'assets/catalogo.json', JSON.stringify(paraCarrinho));
writeFileSync(SAIDA + 'robots.txt', PRODUCAO ? `User-agent: *\nAllow: /\nSitemap: ${absoluto('/sitemap.xml')}\n` : 'User-agent: *\nDisallow: /\n');
const hoje = new Date().toISOString().slice(0, 10);
writeFileSync(SAIDA + 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lista.filter((p) => !p.caminho.endsWith('.html') && !['/carrinho/', '/finalizar/'].includes(p.caminho)).map((p) => `<url><loc>${absoluto(p.caminho)}</loc><lastmod>${hoje}</lastmod></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(SAIDA + '.nojekyll', '');

console.log(`${lista.length} páginas em _site/ (${produtos.length} produtos, ${produtos.filter((p) => p.preco != null).length} com preço, ${produtos.filter(sobe).length} com «desde») · BASE «${BASE}» · ${SITE_URL} · ${PRODUCAO ? 'produção' : 'pré-visualização (noindex)'}`);
