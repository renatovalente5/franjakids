#!/usr/bin/env node
// Testes do gerador (Node, sem browser). Correm no CI antes de cada publicação.
//
//   PYTHON=python3 node scripts/testar.mjs      (um python com o Pillow, para as imagens de ensaio)
//
// Cada guarda prova-se nos dois sentidos: o site normal passa, e uma cópia estragada de propósito pára
// com a mensagem certa. As cópias fazem-se numa pasta temporária (nunca se mexe no repositório).
// Os testes do Worker das encomendas são dele (worker/encomendas/test/); os do painel são do painel.
//
// O CONTEÚDO DE ENSAIO: os testes usam scripts/testes/conteudo (uma cópia congelada do conteúdo a 9 nov
// 2026, com cinco produtos) e fotografias de cor lisa feitas aqui, NUNCA o content/ do commit. O
// content/ é da dona, que o muda no painel: preencher o NIF, ligar a Stripe ou esconder um produto não
// pode parar a publicação neste passo (memória testes-do-site-com-conteudo-de-ensaio). Um problema no
// conteúdo verdadeiro pára no passo seguinte, o do gerador, que escreve as razões para o painel (::error).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as R from '../src/lib/regras.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = process.env.PYTHON || 'python3';
let feitos = 0;
const teste = (nome, fn) => {
  try {
    fn();
    feitos++;
    console.log(`  ✓ ${nome}`);
  } catch (e) {
    console.error(`  ✗ ${nome}\n${e.stack}`);
    process.exitCode = 1;
  }
};
const ENSAIO = path.join(RAIZ, 'scripts/testes/conteudo');
const lerEnsaio = (rel) => JSON.parse(fs.readFileSync(path.join(ENSAIO, rel), 'utf8'));
const catalogo = lerEnsaio('catalogo.json');
const cat = R.catalogoDe(catalogo);
const produto = (slug) => lerEnsaio(`produtos/${slug}.json`);

// ---------------------------------------------------------------- regras (as mesmas do painel e do Worker)
console.log('regras');
teste('conferirEscolha: o tamanho e a cor são precisos; o preço soma os acréscimos e a personalização', () => {
  const bg = produto('babygrow-com-nome');
  assert.equal(R.conferirEscolha(bg, { cor: 'Rosa' }, cat).campo, 'tamanho');
  assert.equal(R.conferirEscolha(bg, { tamanho: '2 anos', cor: 'Rosa' }, cat).campo, 'tamanho');
  assert.equal(R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Verde' }, cat).campo, 'cor');
  const sem = R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Rosa' }, cat);
  assert.deepEqual([sem.ok, sem.unidade_cents, sem.personalizada], [true, 1690, false]);
  const com = R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Rosa', personalizar: true, texto: '  Clara  ' }, cat);
  assert.deepEqual([com.unidade_cents, com.texto, com.personalizada], [1990, 'Clara', true]);
  assert.ok(com.escolhas.includes('Nome a bordar: Clara'));
  assert.equal(R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Rosa', personalizar: true, texto: '' }, cat).campo, 'texto');
  assert.equal(R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Rosa', personalizar: true, texto: 'x'.repeat(16) }, cat).campo, 'texto');
  // o texto escrito sem marcar a caixa não se cobra nem se guarda
  assert.equal(R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Rosa', texto: 'Clara' }, cat).unidade_cents, 1690);
});
teste('conferirEscolha: uma escolha que falta vale a primeira sem acréscimo; uma que não existe recusa', () => {
  const b = produto('body-dad-mini');
  const base = R.conferirEscolha(b, { tamanho: '0-3 meses' }, cat);
  assert.equal(base.unidade_cents, 1490);
  assert.ok(base.escolhas.includes('Peças: Só o body'));
  assert.equal(R.conferirEscolha(b, { tamanho: '0-3 meses', opcoes: { Peças: 'Body e t-shirt Dad' } }, cat).unidade_cents, 2990);
  assert.equal(R.conferirEscolha(b, { tamanho: '0-3 meses', opcoes: { Peças: 'Três bodies' } }, cat).campo, 'opcoes');
});
teste('conferirEscolha: sem preço ou escondido não se compra; a entrada do catálogo publicado serve', () => {
  assert.equal(R.conferirEscolha(produto('body-preparem-o-colinho'), {}, cat).campo, 'produto');
  assert.equal(R.conferirEscolha({ ...produto('manta-remalhada'), publicado: false }, { cor: 'Areia' }, cat).campo, 'produto');
  const entrada = { nome: 'X', preco: 10, tamanhos: ['S', 'M'], cores: [{ nome: 'Rosa' }], opcoes: [], personalizacao: null };
  assert.equal(R.conferirEscolha(entrada, { tamanho: 'M' }).unidade_cents, 1000);  // uma só cor escolhe-se sozinha
});
teste('portesDe: grátis só no continente a partir do valor; zona sem portes fica por confirmar', () => {
  assert.equal(R.portesDe({ id: 'continente', portes: 3.5 }, 4999, 50), 350);
  assert.equal(R.portesDe({ id: 'continente', portes: 3.5 }, 5000, 50), 0);
  assert.equal(R.portesDe({ id: 'ilhas', portes: 6 }, 9000, 50), 600);
  assert.equal(R.portesDe({ id: 'ilhas', portes: null }, 9000, 50), null);
  assert.equal(R.portesDe({ id: 'mao', portes: 0 }, 100, 50), 0);
  assert.equal(R.portesDe({ id: 'continente', portes: 3.5 }, 9000, null), 350);
});
teste('temSuplementos: «desde» com acréscimos nas escolhas ou na personalização opcional', () => {
  assert.ok(R.temSuplementos(produto('babygrow-com-nome')));
  assert.ok(R.temSuplementos(produto('body-dad-mini')));
  assert.ok(!R.temSuplementos(produto('manta-remalhada')));
});
teste('mudancasBloqueadas: a marca, o concelho, as zonas e a estrutura do catálogo não mudam', () => {
  const loja = lerEnsaio('loja.json');
  assert.deepEqual(R.mudancasBloqueadas(loja, structuredClone(loja), 'loja'), []);
  assert.deepEqual(R.mudancasBloqueadas(loja, { ...loja, nome: 'Outra' }, 'loja').map((x) => x.caminho), ['nome']);
  const z = structuredClone(loja); z.entrega.zonas.reverse();
  assert.ok(R.mudancasBloqueadas(loja, z, 'loja').some((x) => x.caminho === 'entrega.zonas'));
  const p = structuredClone(loja); p.entrega.zonas[0].portes = 3.5; p.empresa.nif = '123456789';
  assert.deepEqual(R.mudancasBloqueadas(loja, p, 'loja'), []);
  const c = structuredClone(catalogo); c.categorias.bodies = 'Bodies de bebé'; c.ocasioes.push({ id: 'batizado', nome: 'Batizado', foto: null });
  assert.deepEqual(R.mudancasBloqueadas(catalogo, c, 'catalogo'), []);
  const d = structuredClone(catalogo); d.linhas[0].categorias.pop();
  assert.ok(R.mudancasBloqueadas(catalogo, d, 'catalogo').length);
  assert.deepEqual(R.mudancasBloqueadas({ nome: 'a' }, { nome: 'b', segredo: 1 }, 'artigo').map((x) => x.caminho), ['segredo']);
});
teste('fotosEmUso: as dos produtos, das cores, das linhas, das ocasiões e as das páginas', () => {
  const usadas = R.fotosEmUso({ catalogo, artigos: { bg: produto('babygrow-com-nome') } });
  for (const f of [...R.FOTOS_FIXAS, 'cat-bodies', 'ocasiao-avos', 'babygrow-com-nome-1']) assert.ok(usadas.has(f), f);
});
teste('problemas: o conteúdo de ensaio não pára a pré-visualização; em produção param os dados legais', () => {
  const dados = { loja: lerEnsaio('loja.json'), catalogo, fotos: lerEnsaio('fotos.json'), artigos: Object.fromEntries(['babygrow-com-nome', 'body-preparem-o-colinho'].map((s) => [s, produto(s)])) };
  assert.equal(R.problemas(dados).filter((p) => p.classe === 'bloqueia').length, 0);
  const prod = R.problemas(dados, { producao: true });
  assert.deepEqual(new Set(prod.filter((p) => p.classe === 'bloqueia').map((p) => p.chave)), new Set(['loja:empresa.nome:producao', 'loja:empresa.morada:producao', 'loja:empresa.nif:producao', 'loja:empresa.email:producao', 'loja:entrega.zonas.0.portes:producao']));
  const n = R.neutralizar(dados, prod);
  assert.equal(n.artigos['body-preparem-o-colinho'].publicado, false);
  assert.notEqual(n.artigos['babygrow-com-nome'].publicado, false);
  // uma chave tem sempre a mesma classe (o Worker do painel compara chaves)
  const classes = new Map();
  for (const p of [...R.problemas(dados), ...prod]) { assert.ok(!classes.has(p.chave) || classes.get(p.chave) === p.classe, p.chave); classes.set(p.chave, p.classe); }
});
teste('problemas do produto: escolha sem valor de base, personalização opcional e obrigatória, cor de outra fotografia', () => {
  const chaves = (a) => R.problemasDoArtigo(a, { nome: 'x', catalogo: cat }).map((p) => p.chave);
  const b = produto('body-dad-mini');
  b.opcoes[1].valores = b.opcoes[1].valores.map((v) => ({ ...v, suplemento: 5 }));
  assert.ok(chaves(b).includes('artigo:x:opcoes.1:sem-base'));
  assert.ok(chaves({ ...produto('box-franja'), personalizacao: { rotulo: 'Nome', max: 20, opcional: 'Com nome', obrigatoria: true } }).includes('artigo:x:personalizacao:opcional-e-obrigatoria'));
  assert.ok(chaves({ ...produto('manta-remalhada'), personalizacao: { rotulo: 'Nome', max: 20, suplemento: 2 } }).includes('artigo:x:personalizacao.suplemento:sem-caixa'));
  assert.ok(chaves({ ...produto('manta-remalhada'), cores: [{ nome: 'Areia', foto: 'outra-foto' }] }).includes('artigo:x:cores.0.foto'));
  assert.ok(chaves({ ...produto('manta-remalhada'), tamanhos: 'nao-existe' }).includes('artigo:x:tamanhos'));
});

// ---------------------------------------------------------------- construções de ensaio, numa cópia
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'franjakids-testes-'));
const COPIA = path.join(tmp, 'site');
for (const d of ['src', 'assets', 'scripts', 'legal-comum']) fs.cpSync(path.join(RAIZ, d), path.join(COPIA, d), { recursive: true });
fs.cpSync(ENSAIO, path.join(COPIA, 'content'), { recursive: true });
fs.mkdirSync(path.join(COPIA, 'media/fotos'), { recursive: true });
// as fotografias de ensaio: cor lisa, 600×800, uma por descrição
const fotosEnsaio = Object.keys(lerEnsaio('fotos.json'));
const py = spawnSync(PYTHON, ['-c', `
import sys
from PIL import Image
for i, n in enumerate(sys.argv[2:]):
    Image.new('RGB', (600, 800), (200 - i * 5 % 120, 160, 140 + i * 3 % 100)).save(f'{sys.argv[1]}/{n}.jpg', 'JPEG', quality=80)
`, path.join(COPIA, 'media/fotos'), ...fotosEnsaio], { encoding: 'utf8' });
if (py.status !== 0) { console.error(`as fotografias de ensaio não se fizeram (PYTHON=${PYTHON}):\n${py.stderr}`); process.exit(1); }
const imagens = (args = []) => spawnSync(PYTHON, ['scripts/imagens.py', ...args], { cwd: COPIA, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true' } });
const im = imagens();
if (im.status !== 0) { console.error(`scripts/imagens.py falhou:\n${im.stderr}`); process.exit(1); }

const CONTEUDO = path.join(COPIA, 'content');
const guardado = fs.mkdtempSync(path.join(tmp, 'conteudo-'));
fs.cpSync(CONTEUDO, guardado, { recursive: true });
const repor = () => { fs.rmSync(CONTEUDO, { recursive: true, force: true }); fs.cpSync(guardado, CONTEUDO, { recursive: true }); };
const mexer = (rel, fn) => { const f = path.join(CONTEUDO, rel); const o = JSON.parse(fs.readFileSync(f, 'utf8')); fn(o); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };
const construir = (args = []) => spawnSync(process.execPath, ['src/build.mjs', ...args], { cwd: COPIA, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true', BASE: '', SITE_URL: '', PRODUCAO: '' } });
const SAIDA = path.join(COPIA, '_site');
const pagina = (rel) => fs.readFileSync(path.join(SAIDA, rel), 'utf8');
const paginas = () => fs.readdirSync(SAIDA, { recursive: true }).filter((f) => f.endsWith('.html')).map((f) => [f, pagina(f)]);
const legal = (o) => { o.empresa = { nome: 'Franja Kids, Lda.', nif: '123456789', morada: 'Rua de Ensaio, 1, 4440-000 Valongo', email: 'ola@franjakids.com', telefone: null }; o.entrega.zonas[0].portes = 3.5; };

console.log('construções');
teste('pré-visualização: constrói, noindex em todas as páginas, robots fechado, sem lixo nas páginas', () => {
  repor();
  const r = construir(['--base=/franjakids', '--site=https://renatovalente5.github.io']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(SAIDA, 'robots.txt'), 'utf8'), /Disallow: \//);
  for (const [f, h] of paginas()) {
    assert.match(h, /name="robots" content="noindex/, f);
    assert.doesNotMatch(h, /undefined|NaN|\[object Object\]/, f);
  }
});
teste('pré-visualização: cada imagem e ligação a recursos que as páginas pedem existe no _site', () => {
  for (const [f, h] of paginas()) {
    for (const [, u] of h.matchAll(/(?:src|href)="(\/franjakids\/assets\/[^"?]+)/g)) assert.ok(fs.existsSync(path.join(SAIDA, u.slice('/franjakids'.length))), `${f}: ${u}`);
    for (const [, set] of h.matchAll(/srcset="([^"]+)"/g)) for (const parte of set.split(',')) { const u = parte.trim().split(' ')[0]; assert.ok(fs.existsSync(path.join(SAIDA, u.slice('/franjakids'.length))), `${f}: ${u}`); }
  }
});
teste('pré-visualização: o catálogo publicado tem as zonas, o modo e só os produtos que se compram', () => {
  const c = JSON.parse(pagina('assets/catalogo.json'));
  assert.equal(c.v, 2);
  assert.equal(c.modo, 'encomenda');
  assert.deepEqual(c.zonas.map((z) => z.id), R.ZONAS);
  assert.deepEqual(Object.keys(c.produtos).sort(), ['babygrow-com-nome', 'body-dad-mini', 'box-franja', 'manta-remalhada']);
  const bg = c.produtos['babygrow-com-nome'];
  assert.deepEqual(bg.tamanhos, ['0 meses', '1 mês', '3 meses']);
  assert.equal(R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Azul', personalizar: true, texto: 'Asher' }).unidade_cents, 1990);
  assert.ok(fs.existsSync(path.join(SAIDA, bg.foto.slice('/franjakids'.length))));
});
teste('pré-visualização: a ficha com escolhas, a sem preço pede por mensagem, o finalizar em modo encomenda', () => {
  const bg = pagina('produtos/babygrow-com-nome/index.html');
  assert.match(bg, /data-campo="tamanho"/);
  assert.match(bg, /data-campo="cor"/);
  assert.match(bg, /data-personalizar data-suplemento="3"/);
  assert.match(bg, /desde 16,90 €|16,90 €/);
  const sem = pagina('produtos/body-preparem-o-colinho/index.html');
  assert.match(sem, /Preço por confirmar/);
  assert.match(sem, /Pedir por mensagem/);
  assert.doesNotMatch(sem, /Adicionar ao carrinho/);
  const fin = pagina('finalizar/index.html');
  assert.match(fin, />Enviar encomenda</);
  assert.match(fin, /value="ilhas"/);
  assert.ok(fs.existsSync(path.join(SAIDA, 'obrigado/index.html')));
  assert.match(pagina('termos/index.html'), /\[por confirmar: NIF\]/);
});
teste('produção sem os dados legais: pára, com as razões em anotações para o painel', () => {
  repor();
  const r = construir(['--producao']);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /::error title=Dados da loja › Dados legais::Falta o NIF/);
  assert.match(r.stdout, /::error title=Dados da loja › Entregas e portes::Faltam os portes/);
});
teste('produção com os dados legais: aberta ao Google, sem marcadores, o produto sem preço escondido', () => {
  repor();
  mexer('loja.json', legal);
  const r = construir(['--producao', '--site=https://franjakids.com']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(fs.readFileSync(path.join(SAIDA, 'robots.txt'), 'utf8'), /Allow: \//);
  assert.ok(!fs.existsSync(path.join(SAIDA, 'produtos/body-preparem-o-colinho')));
  assert.doesNotMatch(fs.readFileSync(path.join(SAIDA, 'sitemap.xml'), 'utf8'), /body-preparem-o-colinho/);
  for (const [f, h] of paginas()) {
    assert.doesNotMatch(h, /name="robots" content="noindex/, f);
    assert.doesNotMatch(h, /\[por confirmar/, f);
    assert.doesNotMatch(h, /body-preparem-o-colinho/, f);
  }
  assert.match(pagina('envios/index.html'), /Portugal continental: 3,50 €/);
});
teste('modo online: o botão é «Encomendar e pagar» e as entregas sem portes não aparecem', () => {
  repor();
  mexer('loja.json', (o) => { legal(o); o.pagamentos.modo = 'online'; });
  const r = construir(['--producao']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const fin = pagina('finalizar/index.html');
  assert.match(fin, />Encomendar e pagar</);
  assert.doesNotMatch(fin, /value="ilhas"/);
  assert.match(fin, /value="mao"/);
  assert.equal(JSON.parse(pagina('assets/catalogo.json')).modo, 'online');
  assert.match(pagina('privacidade/index.html'), /Stripe/);
});
teste('neutraliza: categoria que não existe esconde o produto; fotografia em falta só sai da ficha', () => {
  repor();
  mexer('produtos/manta-remalhada.json', (o) => { o.categoria = 'nao-existe'; });
  mexer('produtos/box-franja.json', (o) => { o.fotos.push('nao-ha-esta'); });
  const r = construir();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(!fs.existsSync(path.join(SAIDA, 'produtos/manta-remalhada')));
  assert.match(r.stdout, /::warning title=Produtos › Manta remalhada::A categoria não é nenhuma/);
  assert.doesNotMatch(pagina('produtos/box-franja/index.html'), /nao-ha-esta/);
});
teste('bloqueia: um produto que não se lê e as zonas mexidas param a publicação', () => {
  repor();
  fs.writeFileSync(path.join(CONTEUDO, 'produtos/box-franja.json'), '{ "nome": "Box" ');
  let r = construir();
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /::error title=Produtos › box-franja::O ficheiro deste produto não se consegue ler/);
  repor();
  mexer('loja.json', (o) => { o.entrega.zonas.pop(); });
  r = construir();
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /::error title=Dados da loja › Entregas e portes::As zonas de entrega/);
});
teste('imagens: uma fotografia sem descrição pára, com a anotação', () => {
  repor();
  fs.copyFileSync(path.join(COPIA, 'media/fotos/donas.jpg'), path.join(COPIA, 'media/fotos/sem-descricao.jpg'));
  const r = imagens(['--verificar']);
  fs.rmSync(path.join(COPIA, 'media/fotos/sem-descricao.jpg'));
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /::error title=Fotografias::a fotografia «sem-descricao» não tem descrição/);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${feitos} testes ${process.exitCode ? 'com falhas' : 'passaram'}`);
