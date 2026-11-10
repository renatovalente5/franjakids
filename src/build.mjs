// Gera o site em _site/:  node src/build.mjs [--base=/franjakids] [--site=https://…] [--producao] [--api=https://…]
// (ou as variáveis BASE, SITE_URL, PRODUCAO=1 e API_URL). Antes: python3 scripts/imagens.py (as fotografias).
//
// O conteúdo é o que o painel edita (content/ e media/fotos/) e as regras são as de src/lib/regras.mjs:
// um problema que «bloqueia» pára a publicação (com as razões em anotações ::error, que o painel lê);
// um que «neutraliza» esconde só aquele produto; os avisos não param nada.
import { mkdirSync, rmSync, writeFileSync, cpSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { procurarFrasesProibidas } from '../legal-comum/index.mjs';
import * as R from './lib/regras.mjs';
import { RAIZ, BASE, SITE_URL, PRODUCAO, lerTexto, absoluto, url, carregarFotos, FOTOS, fotoPequena } from './util.mjs';
import { pagina } from './layout.mjs';
import { inicio, linha, listagensComProdutos, produto, carrinho, finalizar, obrigado, procurar, sobre, naoEncontrada } from './paginas.mjs';
import { paginasDeTexto } from './textos.mjs';

const SAIDA = RAIZ + '_site/';
/* O Worker das encomendas (docs/ENCOMENDAS.md). Sem ele (a pré-visualização, enquanto o Worker não está no
   ar), o finalizar confere tudo e acaba no aviso «Quase a abrir», sem enviar nada. Quando estiver:
   --api=https://franjakids-encomendas.renato-lima-valente-dcb.workers.dev */
const API = (process.argv.find((a) => a.startsWith('--api='))?.slice(6) ?? process.env.API_URL ?? '').replace(/\/$/, '');

// ── O conteúdo, tal e qual está nos ficheiros ──
const jsons = (pasta) => readdirSync(RAIZ + pasta).filter((f) => f.endsWith('.json')).sort();
const dados = {
  loja: lerTexto(R.FICHEIROS.loja),
  catalogo: lerTexto(R.FICHEIROS.catalogo),
  fotos: lerTexto(R.FICHEIROS.fotos),
  artigos: Object.fromEntries(jsons(R.PASTAS.artigos).map((f) => [f.slice(0, -5), lerTexto(`${R.PASTAS.artigos}/${f}`)])),
  ficheirosFotos: readdirSync(RAIZ + R.PASTAS.fotos).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)),
};

// ── As regras ──
// No GitHub Actions, cada problema que conta vai também como anotação: é o que o painel lê para dizer
// porque é que a publicação parou (o título é o ecrã onde se corrige).
const NO_CI = process.env.GITHUB_ACTIONS === 'true';
const dadosDe = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const anotar = (nivel, p) => { if (NO_CI) console.log(`::${nivel} title=${dadosDe(p.ecra || 'Site').replace(/:/g, '%3A').replace(/,/g, '%2C')}::${dadosDe(p.mensagem)}`); };
const problemas = R.problemas(dados, { producao: PRODUCAO });
const bloqueia = problemas.filter((p) => p.classe === 'bloqueia');
for (const p of bloqueia.slice(0, 10)) anotar('error', p);
for (const p of problemas.filter((p) => p.classe === 'neutraliza' || (p.classe === 'avisa' && !p.lembrete)).slice(0, 10)) anotar('warning', p);
if (bloqueia.length) {
  console.error(`A publicação parou (${bloqueia.length}):\n- ${bloqueia.map((p) => `${p.ecra}: ${p.mensagem}`).join('\n- ')}`);
  process.exit(1);
}

const loja = JSON.parse(dados.loja);
const catalogo = JSON.parse(dados.catalogo);
const cat = R.catalogoDe(catalogo);
const indiceFotos = JSON.parse(dados.fotos);
carregarFotos(indiceFotos);
const { artigos, efeitos } = R.neutralizar(dados, problemas);
for (const e of efeitos) console.warn(`aviso: ${e.nome} fica ${R.descreverEfeitos(e)}`);

// Os produtos no site (pela «ordem», e depois pelo nome), cada um com o que as páginas precisam.
const produtos = Object.entries(artigos)
  .filter(([, a]) => R.noSite(a))
  .map(([slug, a]) => ({
    ...a, slug,
    ocasioes: Array.isArray(a.ocasioes) ? a.ocasioes.filter((o) => cat.ocasioes.includes(o)) : [],
    detalhes: Array.isArray(a.detalhes) ? a.detalhes.filter((d) => typeof d === 'string' && d.trim()) : [],
    _linha: R.linhaDaCategoria(catalogo, a.categoria),
    _tamanhos: R.tamanhosDe(a, cat),
    _cores: R.coresDe(a),
    _opcoes: R.opcoesDe(a),
    _pers: R.personalizacaoDe(a),
    _ordem: Number.isInteger(a.ordem) ? a.ordem : R.POR_OMISSAO.ordem,
  }))
  .sort((a, b) => a._ordem - b._ordem || a.nome.localeCompare(b.nome, 'pt'));
for (const p of produtos) for (const f of p.fotos) if (!FOTOS[f]) { console.error(`falta a versão web de «${f}»: correr python3 scripts/imagens.py`); process.exit(1); }

const ctx = { loja, catalogo, cat, produtos, api: API };

// ── Páginas ──
const lista = [
  inicio(ctx),
  ...catalogo.linhas.map((l) => linha(ctx, l)),
  ...listagensComProdutos(ctx),
  ...produtos.map((p) => produto(ctx, p)),
  carrinho(ctx),
  finalizar({ ...ctx, termosUrl: '/termos/' }),
  obrigado(ctx),
  procurar(ctx),
  sobre(ctx),
  ...paginasDeTexto(loja),
  naoEncontrada(),
];

const versao = createHash('sha1').update(readFileSync(RAIZ + 'assets/css/site.css')).update(readFileSync(RAIZ + 'assets/js/site.js')).digest('hex').slice(0, 8);
rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(SAIDA, { recursive: true });
const html = {};
const erros = [];
for (const pg of lista) {
  const ficheiro = pg.caminho.endsWith('.html') ? pg.caminho : pg.caminho + 'index.html';
  html[ficheiro] = pagina({ loja, versao, api: API, ...pg });
  mkdirSync(SAIDA + ficheiro.slice(0, ficheiro.lastIndexOf('/')), { recursive: true });
  writeFileSync(SAIDA + ficheiro, html[ficheiro]);
}

// Ligações internas: cada página tem de existir, e nenhuma ligação leva «?» (as categorias e as ocasiões são
// páginas: um filtro com «?» o Google não lê, e já não há nenhum).
const caminhos = new Set(lista.map((p) => p.caminho));
if (caminhos.size !== lista.length) erros.push('há duas páginas com o mesmo endereço: ' + lista.map((p) => p.caminho).filter((c, i, t) => t.indexOf(c) !== i).join(', '));
for (const [f, h] of Object.entries(html)) {
  for (const [, alvo] of h.matchAll(/href="([^"]+)"/g)) {
    if (!alvo.startsWith(BASE + '/') || alvo.startsWith(BASE + '/assets/')) continue;
    const resto = alvo.slice(BASE.length);
    const caminho = resto.split(/[?#]/)[0];
    if (!caminhos.has(caminho)) erros.push(`${f}: ligação para uma página que não existe: ${caminho}`);
    if (resto.includes('?')) erros.push(`${f}: ligação com «?»: ${resto}`);
  }
  for (const r of procurarFrasesProibidas(h.replace(/<[^>]+>/g, ' '))) erros.push(`${f}: frase proibida «${r.frase}»`);
}
if (erros.length) {
  console.error('A construção parou:\n- ' + erros.join('\n- '));
  process.exit(1);
}

// ── Recursos ──
for (const d of ['fontes', 'marca', 'css', 'js']) cpSync(RAIZ + 'assets/' + d, SAIDA + 'assets/' + d, { recursive: true });
// as fotografias: só as versões das que existem (e as duas que o painel mostra)
mkdirSync(SAIDA + 'assets/img', { recursive: true });
const manifesto = JSON.parse(readFileSync(RAIZ + '.cache/imagens/manifesto.json', 'utf8')).fotos;
for (const [nome, f] of Object.entries(manifesto)) {
  const ficheiros = [...f.larguras.flatMap((w) => f.formatos.map((fmt) => `${nome}-${f.resumo}-${w}.${fmt}`)), `${nome}-${f.resumo}-${f.jpg}.jpg`, ...f.painel];
  for (const x of ficheiros) copyFileSync(RAIZ + '.cache/imagens/' + x, SAIDA + 'assets/img/' + x);
}

/* O CATÁLOGO PUBLICADO (assets/catalogo.json): o que o carrinho usa para recalcular os preços e o que
   o Worker das encomendas lê para refazer as contas (docs/ENCOMENDAS.md, §2). Só os produtos que se
   compram (publicados e com preço). Cada entrada tem a forma que R.conferirEscolha() espera. */
const zonas = loja.entrega.zonas.map((z) => ({ id: z.id, nome: z.nome, portes: typeof z.portes === 'number' ? z.portes : null, morada: R.zonaComMorada(z.id) }));
const paraCarrinho = {
  v: 2,
  modo: loja.pagamentos?.modo === 'online' ? 'online' : 'encomenda',
  api: API,
  zonas,
  gratisAPartirDe: typeof loja.entrega.gratisAPartirDe === 'number' ? loja.entrega.gratisAPartirDe : null,
  termos: absoluto('/termos/'),
  obrigado: absoluto('/obrigado/'),
  finalizar: absoluto('/finalizar/'),
  produtos: Object.fromEntries(produtos.filter(R.compravel).map((p) => [p.slug, {
    nome: p.nome, url: url(`/produtos/${p.slug}/`), foto: fotoPequena(p.fotos[0]), preco: p.preco,
    tamanhos: p._tamanhos, cores: p._cores, opcoes: p._opcoes, personalizacao: p._pers,
  }])),
};
writeFileSync(SAIDA + 'assets/catalogo.json', JSON.stringify(paraCarrinho));
/* O robots.txt deixa sempre ler: na pré-visualização, o que a fecha é o noindex de cada página. Um «Disallow: /»
   escondia o noindex ao Google, e um endereço que ele encontrasse noutro sítio podia aparecer nos resultados sem
   conteúdo («Indexada, embora bloqueada pelo robots.txt»). Em produção, também diz onde está o sitemap. */
writeFileSync(SAIDA + 'robots.txt', PRODUCAO ? `User-agent: *\nAllow: /\nSitemap: ${absoluto('/sitemap.xml')}\n` : 'User-agent: *\nAllow: /\n');
/* O SITEMAP: só as páginas que entram no Google (as de `indexar: false` ficam fora, e levam noindex), cada uma com
   a data do último commit que mudou o que ela mostra (memória sitemap-lastmod-e-indexnow): o código das páginas
   (src/), o rodapé legal (legal-comum/), os dados da loja e o catálogo, que entram em todas, e os produtos e as
   fotografias que ESTA página mostra (`fontes`, com o content/fotos.json, onde estão as descrições delas). A data do build mentia («mudou
   hoje» a cada publicação). Sem a história do git (uma cópia sem .git, como a do ensaio do painel, ou um checkout
   raso: o CI faz o seu com fetch-depth: 0), não há data, em vez de uma data falsa. */
const COMUNS = ['src', 'legal-comum', R.FICHEIROS.loja, R.FICHEIROS.catalogo];
const comGit = (() => {
  try { return execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'false'; } catch { return false; }
})();
const dataDe = (fontes) => {
  if (!comGit) return null;
  try { return execFileSync('git', ['log', '-1', '--format=%cI', '--', ...COMUNS, ...fontes], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { return null; }
};
if (!comGit) console.warn('aviso: sem a história do git, o sitemap vai sem <lastmod>');
const noSitemap = lista.filter((p) => p.indexar !== false && !p.caminho.endsWith('.html'));
writeFileSync(SAIDA + 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${noSitemap.map((p) => { const d = dataDe(p.fontes || []); return `<url><loc>${absoluto(p.caminho)}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`; }).join('\n')}\n</urlset>\n`);
writeFileSync(SAIDA + '.nojekyll', '');

const lembretes = problemas.filter((p) => p.lembrete).length;
console.log(`${lista.length} páginas em _site/ (${produtos.length} produtos, ${Object.keys(paraCarrinho.produtos).length} à venda, ${efeitos.length} escondidos, ${lembretes} lembretes) · BASE «${BASE}» · ${SITE_URL} · ${PRODUCAO ? 'produção' : 'pré-visualização (noindex)'} · modo ${paraCarrinho.modo}`);
