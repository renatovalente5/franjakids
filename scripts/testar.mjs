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
// 2026, com cinco produtos, passada ao modelo do menu a 20 nov pelo scripts/migrar-menu.mjs) e fotografias de
// cor lisa feitas aqui, NUNCA o content/ do commit. O
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
import * as SEO from '../src/seo.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = process.env.PYTHON || 'python3';
let feitos = 0;
// assíncrono para os testes que importam módulos (esses chamam-se com await, e correm pela ordem); os outros correm
// logo, como sempre
const teste = async (nome, fn) => {
  try {
    await fn();
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
  // um nome feito só de invisíveis não é um nome (o trim não os tira)
  assert.equal(R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Rosa', personalizar: true, texto: '\u200B\u2060\uFEFF' }, cat).campo, 'texto');
  // os juntores ficam (a mãe com o biberão é um emoji só, e não dois); um texto só deles não é um nome
  const ZWJ = String.fromCodePoint(0x200d), ZWNJ = String.fromCodePoint(0x200c);
  const mae = `B${String.fromCodePoint(0xe9)}${String.fromCodePoint(0x1f469)}${ZWJ}${String.fromCodePoint(0x1f37c)}`;
  assert.equal(R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Rosa', personalizar: true, texto: mae }, cat).texto, mae);
  assert.equal(R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Rosa', personalizar: true, texto: `${ZWJ}${ZWNJ} ` }, cat).campo, 'texto');
  assert.equal(R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Rosa', personalizar: true, texto: 'Cla\u200Bra' }, cat).texto, 'Clara');
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
teste('zonaSobConsulta: os restantes países sempre, e qualquer zona sem portes (o pedido de 20 nov 2026)', () => {
  assert.equal(R.zonaSobConsulta({ id: 'estrangeiro', portes: 12 }), true);
  assert.equal(R.zonaSobConsulta({ id: 'estrangeiro', portes: null }), true);
  assert.equal(R.zonaSobConsulta({ id: 'ilhas', portes: null }), true);
  assert.equal(R.zonaSobConsulta({ id: 'ilhas', portes: '5,50' }), true);
  assert.equal(R.zonaSobConsulta({ id: 'ue', portes: 8 }), false);
  assert.equal(R.zonaSobConsulta({ id: 'mao', portes: 0 }), false);
  assert.equal(R.zonaSobConsulta(null), true);
  assert.equal(R.PAISES_UE.length, 26);
  assert.ok(!R.PAISES_UE.includes('Portugal'));
});
teste('portesDe: grátis só no continente a partir do valor; zona sem portes fica por confirmar', () => {
  assert.equal(R.portesDe({ id: 'continente', portes: 3.5 }, 4999, 50), 350);
  assert.equal(R.portesDe({ id: 'continente', portes: 3.5 }, 5000, 50), 0);
  assert.equal(R.portesDe({ id: 'ilhas', portes: 6 }, 9000, 50), 600);
  assert.equal(R.portesDe({ id: 'ilhas', portes: null }, 9000, 50), null);
  // acima do valor, o continente é grátis mesmo sem os portes escritos (o carrinho já o dizia); abaixo, por confirmar
  assert.equal(R.portesDe({ id: 'continente', portes: null }, 5000, 50), 0);
  assert.equal(R.portesDe({ id: 'continente', portes: null }, 4999, 50), null);
  assert.equal(R.portesDe({ id: 'mao', portes: 0 }, 100, 50), 0);
  assert.equal(R.portesDe({ id: 'continente', portes: 3.5 }, 9000, null), 350);
});
teste('gerarSlug: até 80 caracteres com o «-2» de um repetido, cortado no fim de uma palavra', () => {
  const nome = 'T-shirt Mãe e Filha «A melhor equipa do mundo» com nome bordado, coração e laço cetim — rosa';
  const um = R.gerarSlug(nome);
  assert.ok(um.length <= 80 && R.slugValido(um), um);
  assert.ok(!um.endsWith('-cet'), um);
  const dois = R.gerarSlug(nome, [um]);
  assert.ok(dois.length <= 80 && dois.endsWith('-2') && R.slugValido(dois), dois);
  assert.ok(R.gerarSlug(nome, [um, dois]).endsWith('-3'));
  assert.equal(R.gerarSlug('Body «Olá mundo»'), 'body-ola-mundo');
  assert.equal(R.gerarSlug('Body «Olá mundo»', ['body-ola-mundo']), 'body-ola-mundo-2');
  assert.equal(R.gerarSlug('🎀'), 'produto');
  assert.equal(R.gerarSlug('🎂🎂', [], 'ocasiao'), 'ocasiao', 'uma ocasião só de emoji não fica com o id «produto»');
  assert.equal(R.gerarSlug('x'.repeat(120)).length, 80, 'uma palavra só, sem onde cortar, corta-se aos 80');
});
teste('catálogo: duas secções, ou duas categorias da mesma secção, com o mesmo nome não passam (eram duas entradas iguais no menu)', () => {
  const c = structuredClone(catalogo);
  assert.deepEqual(R.problemasDoCatalogo(c).filter((p) => /repetid/.test(p.chave)), []);
  c.seccoes.push({ id: 'outra', nome: ` ${c.seccoes[0].nome.toUpperCase()} `, itens: [{ id: 'x', nome: 'X' }] });
  const s1 = R.problemasDoCatalogo(c).find((p) => p.chave.endsWith('.nome:repetido'));
  assert.ok(s1 && s1.classe === 'avisa' && s1.mensagem.includes('Há duas secções com o nome'), JSON.stringify(s1));
  const c2 = structuredClone(catalogo);
  c2.seccoes[0].itens[1].nome = c2.seccoes[0].itens[0].nome;
  const ca = R.problemasDoCatalogo(c2).find((p) => p.chave.endsWith('.nome:repetido'));
  assert.ok(ca && ca.classe === 'avisa' && ca.mensagem.includes('Há duas categorias com o nome'), JSON.stringify(ca));
  // o mesmo nome em secções diferentes pode («Bodies» nos Personalizados e no Bebé)
  const c3 = structuredClone(catalogo);
  c3.seccoes[1].itens[0].nome = c3.seccoes[0].itens[0].nome;
  assert.deepEqual(R.problemasDoCatalogo(c3).filter((p) => /repetid/.test(p.chave)), []);
  // um endereço de uma página fixa, ou repetido, pára (seria a página errada)
  const c4 = structuredClone(catalogo);
  c4.seccoes[0].id = 'sobre';
  assert.ok(R.problemasDoCatalogo(c4).some((p) => p.classe === 'bloqueia' && p.chave === 'catalogo:seccoes.sobre:reservado'));
  const c5 = structuredClone(catalogo);
  c5.seccoes[1].id = c5.seccoes[0].id;
  assert.ok(R.problemasDoCatalogo(c5).some((p) => p.classe === 'bloqueia' && p.chave.endsWith(':repetida')));
});
teste('catalogoDe e categoriasDe: as chaves «secção/categoria», os nomes, e só as que existem pela ordem do produto', () => {
  assert.ok(cat.categorias.includes('personalizados/bodies') && cat.categorias.includes('presentes/papas'));
  assert.equal(cat.nomes.presentes, 'Presentes');
  assert.equal(cat.nomes['presentes/papas'], 'Presentes para papás');
  const a = { categorias: ['presentes/papas', 'nao/existe', 'presentes/papas', 'Mau Nome', 'personalizados/bodies'] };
  assert.deepEqual(R.categoriasDe(a, cat), ['presentes/papas', 'personalizados/bodies']);
  assert.deepEqual(R.categoriasDe(a), ['presentes/papas', 'nao/existe', 'personalizados/bodies']);
  assert.deepEqual(R.categoriasDe({ categoria: 'bodies' }, cat), []);
  const chaves = (x) => R.problemasDoArtigo(x, { nome: 'x', catalogo: cat }).map((p) => `${p.classe}:${p.chave}`);
  assert.ok(chaves({ ...produto('manta-remalhada'), categorias: [] }).includes('neutraliza:artigo:x:categorias'));
  assert.ok(chaves({ ...produto('manta-remalhada'), categorias: ['nao/existe'] }).includes('neutraliza:artigo:x:categorias:nenhuma'));
  assert.ok(chaves({ ...produto('manta-remalhada'), categorias: ['bebe/mantas-e-cobertores', 'nao/existe'] }).includes('avisa:artigo:x:categorias:nao/existe:sem-categoria'));
});
teste('suplementosTamanho: o acréscimo do tamanho entra no preço, no «desde» e nas regras (19 nov: o preço por tamanho)', () => {
  const bg = { ...produto('babygrow-com-nome'), suplementosTamanho: { '3 meses': 2, '1 mês': 0, 'nao-ha': 9 } };
  const tamanhos = R.tamanhosDe(bg, cat);
  assert.deepEqual(R.suplementosTamanhoDe(bg, tamanhos), { '3 meses': 2 });
  assert.equal(R.conferirEscolha(bg, { tamanho: '3 meses', cor: 'Rosa' }, cat).unidade_cents, 1890);
  assert.equal(R.conferirEscolha(bg, { tamanho: '1 mês', cor: 'Rosa' }, cat).unidade_cents, 1690);
  assert.equal(R.conferirEscolha(bg, { tamanho: '3 meses', cor: 'Rosa', personalizar: true, texto: 'Ana' }, cat).unidade_cents, 2190);
  // a entrada do catálogo publicado (os tamanhos já em lista) faz a mesma conta
  const entrada = { nome: 'T', preco: 12, tamanhos: ['4 anos', 'M'], suplementosTamanho: { M: 3 }, cores: [], opcoes: [], personalizacao: null };
  assert.equal(R.conferirEscolha(entrada, { tamanho: 'M' }).unidade_cents, 1500);
  assert.ok(R.temSuplementos(entrada));
  assert.ok(!R.temSuplementos({ ...entrada, suplementosTamanho: {} }));
  const chaves = (x) => R.problemasDoArtigo(x, { nome: 'x', catalogo: cat }).map((p) => p.chave);
  assert.ok(chaves({ ...bg, suplementosTamanho: Object.fromEntries(tamanhos.map((t) => [t, 2])) }).includes('artigo:x:suplementosTamanho:sem-base'), 'sem um tamanho sem acréscimo, o preço anunciado não se paga');
  assert.ok(chaves({ ...bg, suplementosTamanho: { '3 meses': 'dois' } }).some((k) => k.startsWith('artigo:x:suplementosTamanho')));
});
teste('precoMinimo: o preço mais baixo que se pode pagar, com os tamanhos e os valores esgotados de fora', () => {
  const a = { preco: 22, tamanhos: ['4 anos', '6 anos', 'S', 'M'], suplementosTamanho: { S: 6, M: 6 }, tamanhosEsgotados: ['4 anos', '6 anos'] };
  assert.equal(R.precoMinimo(a), 28);
  assert.equal(R.precoMinimo({ ...a, tamanhosEsgotados: ['4 anos'] }), 22);
  assert.equal(R.precoMinimo({ preco: 10, opcoes: [{ nome: 'X', valores: [{ nome: 'a', suplemento: 0, esgotado: true }, { nome: 'b', suplemento: 2.5 }] }] }), 12.5);
  assert.equal(R.precoMinimo(produto('babygrow-com-nome'), R.tamanhosDe(produto('babygrow-com-nome'), cat)), 16.9, 'a personalização opcional não conta');
  assert.equal(R.precoMinimo({ preco: null }), null);
});
teste('temSuplementos: «desde» com acréscimos nas escolhas, na personalização opcional ou num tamanho', () => {
  assert.ok(R.temSuplementos(produto('babygrow-com-nome')));
  assert.ok(R.temSuplementos(produto('body-dad-mini')));
  assert.ok(!R.temSuplementos(produto('manta-remalhada')));
});
teste('chaves: o lembrete dos portes por escrever não é o aviso de um valor mau; o Instagram em branco pára', () => {
  const loja = lerEnsaio('loja.json');
  const chaves = (o) => R.problemasDaLoja(o).map((p) => `${p.classe}:${p.chave}`);
  assert.ok(chaves(loja).includes('avisa:loja:entrega.zonas.0.portes:vazio'));
  const mau = structuredClone(loja); mau.entrega.zonas[0].portes = '3,50 €';
  assert.ok(chaves(mau).includes('avisa:loja:entrega.zonas.0.portes') && !chaves(mau).includes('avisa:loja:entrega.zonas.0.portes:vazio'));
  assert.ok(chaves({ ...loja, instagram: '' }).includes('bloqueia:loja:instagram:vazio'));
  assert.ok(chaves({ ...loja, instagram: '@franjakids' }).includes('avisa:loja:instagram'));
});
teste('mudancasBloqueadas: a marca, o concelho, as zonas e a estrutura do catálogo não mudam', () => {
  const loja = lerEnsaio('loja.json');
  assert.deepEqual(R.mudancasBloqueadas(loja, structuredClone(loja), 'loja'), []);
  assert.deepEqual(R.mudancasBloqueadas(loja, { ...loja, nome: 'Outra' }, 'loja').map((x) => x.caminho), ['nome']);
  const z = structuredClone(loja); z.entrega.zonas.reverse();
  assert.ok(R.mudancasBloqueadas(loja, z, 'loja').some((x) => x.caminho === 'entrega.zonas'));
  const p = structuredClone(loja); p.entrega.zonas[0].portes = 3.5; p.empresa.nif = '123456789';
  assert.deepEqual(R.mudancasBloqueadas(loja, p, 'loja'), []);
  // as secções e as categorias são da dona: mudar o nome, juntar, ordenar e tirar pode; um campo novo não
  const c = structuredClone(catalogo); c.seccoes[0].nome = 'Universo Bebé'; c.seccoes[0].itens.push({ id: 'batizado', nome: 'Batizado' }); c.seccoes.reverse(); c.seccoes.pop();
  assert.deepEqual(R.mudancasBloqueadas(catalogo, c, 'catalogo'), []);
  assert.deepEqual(R.mudancasBloqueadas(catalogo, { ...catalogo, segredo: 1 }, 'catalogo').map((x) => x.caminho), ['segredo']);
  assert.deepEqual(R.mudancasBloqueadas({ nome: 'a' }, { nome: 'b', segredo: 1 }, 'artigo').map((x) => x.caminho), ['segredo']);
});
teste('fotosEmUso: as dos produtos, das cores, das secções, das categorias, a da história e as das páginas', () => {
  const usadas = R.fotosEmUso({ catalogo, artigos: { bg: produto('babygrow-com-nome') } });
  for (const f of [...R.FOTOS_FIXAS, 'cat-bodies', 'ocasiao-avos', 'babygrow-com-nome-1', R.FOTO_HISTORIA]) assert.ok(usadas.has(f), f);
  // a da história é a que a loja escolheu (a de origem pode sair da biblioteca)
  const outra = R.fotosEmUso({ catalogo, loja: { ...lerEnsaio('loja.json'), fotoHistoria: 'donas-2' } });
  assert.ok(outra.has('donas-2') && !outra.has(R.FOTO_HISTORIA));
});
teste('problemas: o conteúdo de ensaio não pára a pré-visualização; em produção param os dados legais', () => {
  const dados = { loja: lerEnsaio('loja.json'), catalogo, fotos: lerEnsaio('fotos.json'), artigos: Object.fromEntries(['babygrow-com-nome', 'body-preparem-o-colinho'].map((s) => [s, produto(s)])) };
  assert.equal(R.problemas(dados).filter((p) => p.classe === 'bloqueia').length, 0);
  const prod = R.problemas(dados, { producao: true });
  assert.deepEqual(new Set(prod.filter((p) => p.classe === 'bloqueia').map((p) => p.chave)), new Set(['loja:empresa.nome:producao', 'loja:empresa.morada:producao', 'loja:empresa.nif:producao', 'loja:empresa.email:producao', 'loja:entrega.zonas.0.portes:vazio:producao']));
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
teste('pré-visualização: constrói, noindex em todas as páginas (o robots.txt deixa lê-lo), sem lixo nas páginas', () => {
  repor();
  const r = construir(['--base=/franjakids', '--site=https://renatovalente5.github.io']);
  assert.equal(r.status, 0, r.stderr);
  // o robots.txt não fecha nada: um «Disallow» escondia o noindex ao Google
  assert.equal(fs.readFileSync(path.join(SAIDA, 'robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\n');
  // a posse do site no Google e no Bing, na página inicial (tirá-las desvalida as propriedades)
  assert.match(pagina('index.html'), /<meta name="google-site-verification" content="jw1EH9YxON3Q3i3G1Ode_bT4Dt04dntD07s0Kyf06yo">/);
  assert.match(pagina('index.html'), /<meta name="msvalidate\.01" content="DE1BA388910A8DC62D873CAEEF7B2BB8">/);
  assert.match(pagina('BingSiteAuth.xml'), /<users>\s*<user>DE1BA388910A8DC62D873CAEEF7B2BB8<\/user>\s*<\/users>/);
  for (const [f, h] of paginas()) {
    assert.match(h, /name="robots" content="noindex/, f);
    assert.doesNotMatch(h, /undefined|NaN|\[object Object\]/, f);
    // a passagem entre páginas: o opt-in em linha e ANTES da primeira folha (numa folha, o Chrome abortava-a às vezes)
    const optIn = h.indexOf('@view-transition { navigation: auto; }');
    assert.ok(optIn > -1 && optIn < h.indexOf('rel="stylesheet"'), `${f}: o @view-transition em linha antes das folhas`);
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
  assert.equal(c.v, 3);
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
  // sem o Worker das encomendas no ar, o finalizar acaba no aviso «Quase a abrir»
  assert.match(fin, /id="pre-visualizacao"/);
  assert.match(pagina('index.html'), /data-api=""/);
  assert.ok(fs.existsSync(path.join(SAIDA, 'obrigado/index.html')));
  assert.match(pagina('termos/index.html'), /\[por confirmar: NIF\]/);
});

teste('pré-visualização: só se promete nos pedidos à medida (21 nov 2026); a pista lembra que fica como se escreve', () => {
  const bg = pagina('produtos/babygrow-com-nome/index.html');
  assert.match(bg, /id="texto-pista">[^<]*Fica exatamente como escreves\.<\/p>/);
  assert.doesNotMatch(bg, /pré-visualiza/);
  for (const pg of ['sobre/index.html', 'trocas-e-devolucoes/index.html']) assert.doesNotMatch(pagina(pg), /pré-visualiza/, pg);
  assert.match(pagina('como-personalizar/index.html'), /Tens outra ideia\?[\s\S]*mandamos-te a pré-visualização antes de produzir/);
  assert.match(pagina('termos/index.html'), /Nos pedidos à medida, combinados por mensagem, enviamos a pré-visualização/);
});
teste('pré-visualização: secções e categorias com produtos são páginas, ligadas pelas pastilhas; as vazias não existem', () => {
  const B = '/franjakids';
  for (const c of ['personalizados', 'personalizados/bodies', 'personalizados/babygrows', 'bebe', 'bebe/bodies-e-babygrows', 'bebe/mantas-e-cobertores', 'presentes', 'presentes/papas', 'presentes/anunciar-gravidez', 'presentes/caixas-presente', 'colecoes', 'colecoes/dia-do-pai']) assert.ok(fs.existsSync(path.join(SAIDA, c, 'index.html')), c);
  // sem produtos: nem página nem entrada no menu (e as antigas, das linhas e das ocasiões, já não existem)
  for (const c of ['crianca-e-familia', 'promocoes', 'personalizados/gorros', 'presentes/irmaos', 'bebe/babygrows', 'presentes/box-franja', 'ocasioes']) assert.ok(!fs.existsSync(path.join(SAIDA, c)), c);
  const l = pagina('personalizados/index.html');
  assert.match(l, new RegExp(`<a class="pastilha" href="${B}/personalizados/" aria-current="page">Tudo</a>`));
  assert.match(l, new RegExp(`<a class="pastilha" href="${B}/personalizados/bodies/">Bodies</a>`));
  assert.doesNotMatch(l, /gorros\//);
  const b = pagina('personalizados/bodies/index.html');
  assert.match(b, /href="\/franjakids\/personalizados\/bodies\/" aria-current="page">Bodies</);
  assert.match(b, /<h1 id="t-linha">Bodies<\/h1>/);
  assert.match(b, new RegExp(`<ol class="migalhas"><li><a href="${B}/">Início</a></li><li><a href="${B}/personalizados/">Personalizados</a></li><li aria-current="page">Bodies</li></ol>`));
  assert.equal((b.match(/<a class="cartao"/g) || []).length, 2);
  // um produto aparece em todas as suas categorias: a secção junta-os sem repetir (o body e a Box Franja)
  assert.equal((pagina('presentes/anunciar-gravidez/index.html').match(/<a class="cartao"/g) || []).length, 2);
  assert.equal((pagina('presentes/index.html').match(/<a class="cartao"/g) || []).length, 3);
  // a ficha aponta para a 1.ª categoria do produto, e nenhuma página tem um filtro com «?»
  assert.match(pagina('produtos/body-dad-mini/index.html'), new RegExp(`<ol class="migalhas"><li><a href="${B}/">Início</a></li><li><a href="${B}/personalizados/">Personalizados</a></li><li><a href="${B}/personalizados/bodies/">Bodies</a></li></ol>`));
  assert.match(pagina('produtos/body-dad-mini/index.html'), /<p class="ficha__etiqueta">Bodies · Personalizável<\/p>/);
  for (const [f, h] of paginas()) assert.doesNotMatch(h, /\?(categoria|ocasiao)=/, f);
});
teste('pré-visualização: o menu (as secções com produtos e o «Sobre Nós»), as listas que abrem, e o rodapé', () => {
  const h = pagina('presentes/papas/index.html');
  const menu = h.match(/<ul class="contentor menu" data-menu-principal>([\s\S]*?)<\/ul><\/nav>/)[1];
  assert.deepEqual([...menu.matchAll(/class="menu__ligacao" href="[^"]+"[^>]*>([^<]+)</g)].map((m) => m[1]), ['Bebé', 'Personalizados', 'Presentes', 'Coleções', 'Sobre Nós']);
  // a secção da página está marcada, e a categoria dentro da lista dela também
  assert.match(menu, /class="menu__ligacao" href="\/franjakids\/presentes\/" aria-current="page">Presentes</);
  assert.match(menu, /<a href="\/franjakids\/presentes\/papas\/" aria-current="page">Presentes para papás<\/a>/);
  assert.match(menu, /<li class="menu__tudo"><a href="\/franjakids\/presentes\/">Tudo em Presentes<\/a><\/li>/);
  assert.match(menu, /<button class="menu__abrir" type="button" aria-expanded="false" aria-controls="sub-2">/);
  for (const [t, c] of [['A nossa história', 'sobre'], ['Como funciona', 'como-funciona'], ['Como personalizar', 'como-personalizar'], ['Envios e entregas', 'envios'], ['Perguntas frequentes', 'perguntas-frequentes'], ['Contactos', 'contactos']]) {
    assert.ok(menu.includes(`<a href="/franjakids/${c}/">${t}</a>`), t);
    assert.ok(fs.existsSync(path.join(SAIDA, c, 'index.html')), c);
  }
  // no telemóvel, as secções abrem as suas categorias (a da página onde se está, já aberta)
  assert.match(h, /<li><details open><summary>Presentes/);
  assert.match(h, /<li><details><summary>Bebé/);
  // o rodapé: as secções na «Loja», e as «Informações legais» na «Ajuda»
  const rod = h.match(/<footer class="rodape">([\s\S]*?)<\/footer>/)[1];
  assert.deepEqual([...rod.match(/aria-labelledby="rodape-loja">[\s\S]*?<\/ul>/)[0].matchAll(/>([^<>]+)<\/a>/g)].map((m) => m[1]), ['Bebé', 'Personalizados', 'Presentes', 'Coleções', 'Procurar']);
  assert.deepEqual([...rod.match(/aria-labelledby="rodape-ajuda">[\s\S]*?<\/ul>/)[0].matchAll(/>([^<>]+)<\/a>/g)].map((m) => m[1]), ['Como encomendar', 'Envios e prazos', 'Trocas e devoluções', 'Contactos', 'Informações legais']);
});
teste('pré-visualização: a página inicial — «Para quem é?», a montra das secções, o «Como funciona» e «A nossa história»', () => {
  const h = pagina('index.html');
  // «Para quem é?»: as categorias dos Presentes com fotografia e produtos, com o nome curto
  assert.deepEqual([...h.matchAll(/<span class="ocasioes__nome">([^<]+)<\/span>/g)].map((m) => m[1]), ['Anunciar uma gravidez', 'Papás']);
  assert.match(h, /<a href="\/franjakids\/presentes\/papas\/"><span class="ocasioes__nome">Papás/);
  assert.deepEqual([...h.matchAll(/<span class="montra__nome">([^<]+)</g)].map((m) => m[1]), ['Bebé', 'Personalizados', 'Presentes', 'Coleções']);
  assert.match(h, /<ul class="fila montra" style="--n:4">/);
  // o «Como funciona» da loja: o 3.º passo com o cartão
  assert.deepEqual([...h.match(/<ol class="contentor passos">[\s\S]*?<\/ol>/)[0].matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]), ['Escolhe o teu favorito', 'Personaliza ao teu gosto', 'Finaliza a encomenda', 'Recebe com carinho']);
  assert.match(h, /<rect x="3" y="6" width="18" height="12" rx="2\.5"\/>[^]*?<h3>Finaliza a encomenda<\/h3>/);
  assert.match(h, /<h2 id="t-historia">A nossa história<\/h2>\s*<p class="sobre__abertura">Uma marca que nasceu do amor de uma família e cresceu com a força da amizade\.<\/p>/);
  assert.match(h, /da junção de Fran \+ Ja, que nasceu a Franja Kids, no dia 10 de setembro de 2025/);
  assert.match(h, /<p class="sobre__fecho">Bem-vindos à nossa família\. Bem-vindos à Franja Kids!<\/p>/);
  assert.doesNotMatch(h, /Duas amigas, uma ideia/);
  assert.match(pagina('sobre/index.html'), /<h1 id="t-sobre" class="pagina__titulo">Um sonho, muitas mãos e muito amor\.<\/h1>/);
});
teste('pré-visualização: o finalizar tem as cinco entregas; os restantes países sob consulta; o país da UE de uma lista', () => {
  const f = pagina('finalizar/index.html');
  assert.deepEqual([...f.matchAll(/name="envio" value="([a-z]+)"/g)].map((m) => m[1]), R.ZONAS);
  assert.match(f, /value="estrangeiro" data-preco="" data-sob-consulta>/);
  assert.match(f, /value="ue" data-preco="8">/);
  assert.match(f, /value="mao" data-preco="0">[^]*?<b data-preco-zona="mao">Grátis<\/b>/);
  assert.match(f, /data-sob-consulta-aviso hidden>/);
  assert.match(f, /data-pista-mao hidden>Para combinarmos o levantamento pelo WhatsApp\.</);
  const paises = [...f.match(/<select id="pais"[^]*?<\/select>/)[0].matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(paises, R.PAISES_UE);
  // o catálogo publicado diz quais são sob consulta (o carrinho e o Worker não cobram o que não se sabe)
  const c = JSON.parse(pagina('assets/catalogo.json'));
  assert.deepEqual(c.zonas.filter((z) => z.sobConsulta).map((z) => z.id), ['continente', 'ilhas', 'estrangeiro']);
  assert.ok(c.zonas.filter((z) => z.sobConsulta).every((z) => z.portes === null));
});
teste('com o Worker das encomendas (--api): o finalizar envia, sem o aviso, e o catálogo leva a morada', () => {
  repor();
  const r = construir(['--api=https://franjakids-encomendas.exemplo.workers.dev/']);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(pagina('finalizar/index.html'), /id="pre-visualizacao"/);
  assert.match(pagina('index.html'), /data-api="https:\/\/franjakids-encomendas\.exemplo\.workers\.dev"/);
  assert.equal(JSON.parse(pagina('assets/catalogo.json')).api, 'https://franjakids-encomendas.exemplo.workers.dev');
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
    assert.doesNotMatch(h, /\[por confirmar/, f);
    assert.doesNotMatch(h, /body-preparem-o-colinho/, f);
  }
  assert.match(pagina('envios/index.html'), /Portugal continental: 3,50 €/);
});
teste('produção: fora do Google só as páginas de serviço, as legais e as listagens de um produto; o sitemap é o resto', () => {
  // (a construção do teste anterior: produção com os dados legais)
  assert.match(fs.readFileSync(path.join(SAIDA, 'robots.txt'), 'utf8'), /^User-agent: \*\nAllow: \/\nSitemap: https:\/\/franjakids\.com\/sitemap\.xml\n$/);
  // as legais e as de políticas (termos, privacidade, envios, trocas, informações legais) e as listas de um produto
  const FORA = ['carrinho/', 'finalizar/', 'obrigado/', 'procurar/', 'termos/', 'privacidade/', 'envios/', 'trocas-e-devolucoes/', 'informacoes-legais/', '404.html', 'presentes/papas/', 'presentes/caixas-presente/', 'colecoes/'];
  const mapa = fs.readFileSync(path.join(SAIDA, 'sitemap.xml'), 'utf8');
  const noMapa = new Set([...mapa.matchAll(/<loc>https:\/\/franjakids\.com\/([^<]*)<\/loc>/g)].map(([, c]) => c));
  const titulos = new Set();
  for (const [f, h] of paginas()) {
    const c = f.replace(/index\.html$/, '');
    const fora = /<meta name="robots" content="noindex, follow">/.test(h);
    if (FORA.includes(c)) assert.ok(fora, `${f}: devia ter noindex, follow`);
    assert.doesNotMatch(h, /noindex, nofollow/, f);
    assert.equal(noMapa.has(c), !fora && c !== '404.html', `${f}: no sitemap ${noMapa.has(c)}, noindex ${fora}`);
    if (fora) continue;
    // o que entra no Google: um título que cabe e não se repete, e uma descrição com tamanho de descrição
    const t = h.match(/<title>([^<]*)<\/title>/)[1];
    const d = h.match(/<meta name="description" content="([^"]*)"/)[1];
    assert.ok(t.length <= 65 && !titulos.has(t), `${f}: o título «${t}»`);
    titulos.add(t);
    assert.ok(d.length >= 50 && d.length <= 160, `${f}: a descrição tem ${d.length}: ${d}`);
  }
  assert.ok(noMapa.has('') && noMapa.has('produtos/box-franja/') && noMapa.has('como-funciona/') && noMapa.has('perguntas-frequentes/') && noMapa.has('presentes/'));
});
teste('produção: os dados estruturados da loja, do site e dos produtos (para as fichas de comerciante do Google)', () => {
  const lds = (h) => [...h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(([, j]) => JSON.parse(j));
  const inicio = lds(pagina('index.html'));
  assert.ok(inicio.some((j) => j['@type'] === 'WebSite' && j.name === 'Franja Kids'));
  const loja = inicio.find((j) => j['@type'] === 'OnlineStore');
  assert.equal(loja.legalName, 'Franja Kids, Lda.');
  assert.equal(loja.vatID, 'PT123456789');
  assert.equal(loja.hasMerchantReturnPolicy.merchantReturnDays, 14);
  const box = lds(pagina('produtos/box-franja/index.html'));
  const prod = box.find((j) => j['@type'] === 'Product');
  assert.equal(prod.offers.price, '30.00');
  assert.equal(prod.offers.priceCurrency, 'EUR');
  assert.equal(prod.offers.availability, 'https://schema.org/InStock');
  assert.equal(prod.offers.itemCondition, 'https://schema.org/NewCondition');
  assert.ok(prod.image.length >= 1 && prod.image.every((u) => /^https:\/\/franjakids\.com\/assets\/img\/.+\.jpg$/.test(u)));
  assert.deepEqual(box.find((j) => j['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.name), ['Início', 'Presentes', 'Caixas presente', 'Box Franja']);
  assert.equal(prod.category, 'Caixas presente');
  // todos os JSON-LD se lêem, e nenhum diz MadeToOrder (que o Google não aceita)
  for (const [f, h] of paginas()) { assert.doesNotMatch(h, /MadeToOrder/, f); lds(h); }
  // a privacidade diz quem guarda o quê: a Cloudflare (alojamento, DNS, encomendas, avisos de stock, emails) e não o
  // GitHub nem a Resend; o WhatsApp do levantamento em mão; e os avisos de stock (o email, uma vez, 6 meses)
  const priv = pagina('privacidade/index.html');
  assert.match(priv, /Cloudflare, Inc\.<\/strong> \(EUA\) — alojamento e entrega do site[^<]*DNS do domínio; guardar as encomendas feitas no site e os avisos de stock, e passá-los para nós; envio dos emails das encomendas e dos avisos/);
  assert.match(priv, /conversas pelo WhatsApp/);
  assert.match(priv, /<strong>Avisos de stock:<\/strong>[^<]*avisarmos uma vez[^<]*6 meses/);
  assert.doesNotMatch(priv, /GitHub|Resend|por indicar/);
});
teste('SEO: os títulos e as descrições escritos à mão cabem, e são de secções e categorias que existem', () => {
  for (const [id, v] of Object.entries(SEO.SECCOES)) {
    assert.ok(cat.seccoes.some((x) => x.id === id), `a secção ${id} não existe`);
    assert.ok(`${v.titulo} · Franja Kids`.length <= 65, `${id}: o título passa de 65`);
    if (v.descricao) assert.ok(v.descricao.length >= 50 && v.descricao.length <= 160, `${id}: a descrição tem ${v.descricao.length}`);
  }
  for (const [k, t] of Object.entries(SEO.TITULOS)) {
    assert.ok(cat.categorias.includes(k), `a categoria ${k} não existe`);
    assert.ok(`${t} · Franja Kids`.length <= 65, `${k}: o título passa de 65`);
  }
  assert.ok(`Franja Kids · ${SEO.TITULO_INICIO}`.length <= 65);
  assert.equal(SEO.resumir('a '.repeat(100), 20), 'a a a a a a a a a…');
});
teste('modo online: o botão é «Encomendar e pagar»; as entregas sem portes aparecem sob consulta', () => {
  repor();
  mexer('loja.json', (o) => { legal(o); o.pagamentos.modo = 'online'; });
  const r = construir(['--producao']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const fin = pagina('finalizar/index.html');
  assert.match(fin, />Encomendar e pagar</);
  assert.match(fin, /value="ilhas" data-preco="" data-sob-consulta>/);
  assert.match(fin, /value="continente" data-preco="3\.5" checked>/);
  assert.match(fin, /value="mao" data-preco="0">/);
  // o «Como funciona» e a página inicial dizem que se paga no site (em modo «encomenda», que se combina depois)
  assert.match(pagina('como-funciona/index.html'), /Podes realizar o pagamento diretamente no nosso site, através dos métodos disponíveis no momento da compra\./);
  assert.match(pagina('index.html'), /Confirma os teus dados e paga de forma simples e segura\./);
  assert.equal(JSON.parse(pagina('assets/catalogo.json')).modo, 'online');
  assert.match(pagina('privacidade/index.html'), /Stripe/);
  // os meios de pagamento (11 nov 2026): só os cinco ligados na Stripe, iguais no carrinho, no finalizar e nos termos
  const meios = (h) => [...(h.match(/<p class="pagamentos">([\s\S]*?)<\/p>/)?.[1] ?? '').matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(meios(fin), ['MB WAY', 'Multibanco', 'Cartão', 'Apple Pay', 'Google Pay', 'Pagamento seguro pela Stripe']);
  assert.deepEqual(meios(pagina('carrinho/index.html')).slice(0, 5), ['MB WAY', 'Multibanco', 'Cartão', 'Apple Pay', 'Google Pay']);
  const termos = pagina('termos/index.html');
  assert.match(termos, /Paga-se por MB WAY, Multibanco, cartão, Apple Pay ou Google Pay, através da Stripe, no fim da encomenda\. Com Multibanco, a encomenda só avança depois de a referência ser paga/);
  assert.doesNotMatch(termos + fin, /MB WAY ou cartão/);
});
teste('neutraliza: categoria que não existe esconde o produto; fotografia em falta só sai da ficha', () => {
  repor();
  mexer('produtos/manta-remalhada.json', (o) => { o.categorias = ['nao/existe']; });
  mexer('produtos/box-franja.json', (o) => { o.fotos.push('nao-ha-esta'); });
  const r = construir();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(!fs.existsSync(path.join(SAIDA, 'produtos/manta-remalhada')));
  assert.match(r.stdout, /::warning title=Produtos › Manta remalhada::Nenhuma das categorias do produto existe no site/);
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

teste('sitemap: a data de cada página é a do último commit que mudou o que ela mostra; sem o git, não há data', () => {
  repor();
  let r = construir(['--site=https://franjakids.com']);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(fs.readFileSync(path.join(SAIDA, 'sitemap.xml'), 'utf8'), /<lastmod>/);
  const git = (args, data) => spawnSync('git', ['-c', 'user.name=Ensaio', '-c', 'user.email=ensaio@exemplo.pt', '-c', 'commit.gpgsign=false', ...args], { cwd: COPIA, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: data, GIT_COMMITTER_DATE: data } });
  assert.equal(git(['init', '-q']).status, 0);
  git(['add', '-A']);
  assert.equal(git(['commit', '-qm', 'tudo'], '2026-01-02T10:00:00Z').status, 0);
  mexer('produtos/manta-remalhada.json', (o) => { o.resumo = 'Outro resumo, só para mudar a data desta manta.'; });
  git(['add', '-A']);
  assert.equal(git(['commit', '-qm', 'a manta'], '2026-03-04T10:00:00Z').status, 0);
  r = construir(['--site=https://franjakids.com']);
  assert.equal(r.status, 0, r.stderr);
  const mapa = fs.readFileSync(path.join(SAIDA, 'sitemap.xml'), 'utf8');
  const data = (c) => mapa.match(new RegExp(`<loc>https://franjakids\\.com${c}</loc><lastmod>([^<]+)</lastmod>`))?.[1] ?? '';
  assert.match(data('/produtos/manta-remalhada/'), /^2026-03-04T10:00:00/);
  assert.match(data('/bebe/'), /^2026-03-04T10:00:00/, 'a linha mostra a manta');
  assert.match(data('/produtos/box-franja/'), /^2026-01-02T10:00:00/);
  assert.match(data('/como-funciona/'), /^2026-01-02T10:00:00/);
  fs.rmSync(path.join(COPIA, '.git'), { recursive: true, force: true });
});

// ---------------------------------------------------------------- o site.js e o Worker do site (11 nov 2026)
console.log('site.js e worker/www.js');
const SITE_JS = fs.readFileSync(path.join(RAIZ, 'assets/js/site.js'), 'utf8');
const SITE_JS2 = () => fs.readFileSync(path.join(RAIZ, 'assets/js/site.js'), 'utf8');
const CONTAS_JS = fs.readFileSync(path.join(RAIZ, 'worker/encomendas/contas.js'), 'utf8');
// um bocado do site.js, tirado pelo nome e posto a correr aqui (o site.js é um script sem módulos)
const pedaco = (re, de = SITE_JS) => { const m = de.match(re); assert.ok(m, `não encontrei ${re}`); return m[1]; };
await teste('finalizar: as regras dos campos são as do Worker (o que passa no site não é recusado depois do envio)', async () => {
  const C = await import('../worker/encomendas/contas.js');
  assert.ok(SITE_JS.includes(`const RE_EMAIL = /${R.RE_EMAIL.source}/;`), 'o RE_EMAIL do site.js é o de regras.mjs');
  assert.ok(SITE_JS.includes(`const MAX_EMAIL = ${R.TAMANHOS.email};`));
  assert.ok(SITE_JS.includes(`const MAX_CP_ESTRANGEIRO = ${C.MAX_CP_ESTRANGEIRO};`));
  assert.equal(pedaco(/const RE_CP = (\/.+?\/);/), pedaco(/const RE_CP = (\/.+?\/);/, CONTAS_JS));
  for (const k of ['CP_E_DAS_ILHAS', 'CP_E_DO_CONTINENTE']) assert.equal(pedaco(new RegExp(`const ${k} = ('[^']+');`)), pedaco(new RegExp(`const ${k} = ('[^']+');`), CONTAS_JS), k);
  const nif = new Function('nif', pedaco(/const nifValido = \(nif\) => \{([\s\S]*?)\n {4}\};/));
  for (const n of ['123456789', '123456780', '023456789', '501964843', '501964842', '999999990', '12345678', '1234567890', '', 'abcdefghi']) assert.equal(nif(n), R.nifValido(n), `NIF ${n}`);
  // o telemóvel: de 9 a 15 algarismos, como o telefoneValido do Worker
  const tel = new Function('v', `return (${pedaco(/telemovel: (\(v\) => \{[^\n]*?\}),\n/)})(v) === ''`);
  for (const t of ['912345678', '+351 912 345 678', '(+351) 912.345-678', '1234567890123456', '91234567', 'visita evil.example 912345678']) assert.equal(tel(t), C.telefoneValido(t), t);
});
teste('carrinho guardado: uma linha estragada não parte o site; a quantidade é sempre um inteiro de 1 a 20', () => {
  const limpa = new Function('MAX_QTD', `return ${pedaco(/const linhaLimpa = (\(i\) => \{[\s\S]*?\n {2}\});/)}`)(20);
  assert.equal(limpa(null), null);
  assert.equal(limpa('x'), null);
  assert.equal(limpa({ qtd: 2 }), null);
  const q = (qtd) => limpa({ slug: 'a', qtd }).qtd;
  assert.deepEqual([q('2'), q(-5), q(1000), q(1.5), q(undefined), q(0), q(Infinity), q('abc')], [2, 1, 20, 1, 1, 1, 20, 1]);
  assert.deepEqual(limpa({ slug: 'a', qtd: 1, opcoes: ['x'], texto: 7, personalizar: 'sim', tamanho: 3 }), { slug: 'a', opcoes: {}, texto: '', personalizar: false, qtd: 1 });
  assert.deepEqual(limpa({ slug: 'a', qtd: 1, opcoes: { Desenho: 'Menina', Mau: 3 }, cor: 'Rosa' }).opcoes, { Desenho: 'Menina' });
});
await teste('o número do carrinho no <head> conta como o site.js, mesmo com o guardado estragado', async () => {
  const vm = await import('node:vm');
  repor();
  assert.equal(construir().status, 0);
  const script = pedaco(/<script>(\/\* o número do carrinho[\s\S]*?)<\/script>/, pagina('index.html'));
  const conta = (guardado) => {
    const b = { textContent: '', hidden: true };
    vm.runInNewContext(script, { localStorage: { getItem: () => guardado }, document: { querySelector: () => b } });
    return b.textContent;
  };
  assert.equal(conta('[null,{"slug":"a","qtd":"2"},{"slug":"b","qtd":-5},{"qtd":4}]'), 3);
  assert.equal(conta('{}'), '');
  assert.equal(conta('lixo'), '');
});
await teste('o cartão de partilha diz a altura da fotografia que o imagens.py escreve (o round do Python)', async () => {
  const { alturaReduzida } = await import('../src/layout.mjs');
  const casos = [[2, 1, 1], [2, 3, 1], [1528, 1000, 1080], [6000, 9000, 1080], [2000, 1307, 1080]];
  for (let i = 0; i < 200; i++) casos.push([400 + ((i * 7919) % 5000), 300 + ((i * 104729) % 5000), 360 + ((i * 31) % 1080)]);
  const py = spawnSync(PYTHON, ['-c', 'import sys, json\nprint(json.dumps([round(a * w / l) for l, a, w in json.loads(sys.argv[1])]))', JSON.stringify(casos)], { encoding: 'utf8' });
  assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(casos.map(([l, a, w]) => alturaReduzida(l, a, w)), JSON.parse(py.stdout));
});
teste('a página 404 não tem morada própria; o favicon.ico existe; o .nojekyll já não', () => {
  assert.doesNotMatch(pagina('404.html'), /rel="canonical"|og:url/);
  assert.ok(fs.existsSync(path.join(SAIDA, 'favicon.ico')));
  assert.ok(!fs.existsSync(path.join(SAIDA, '.nojekyll')));
  // o logótipo como cartão de partilha leva as medidas (a fotografia já levava)
  // sem fotografia própria, o cartão com o logótipo (1200×630; o SEO de 22 nov 2026)
  assert.match(pagina('carrinho/index.html'), /og:image" content="[^"]+\/franjakids-[0-9a-f]{10}-partilha\.jpg">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">/);
});
teste('listagens: o 1.º cartão carrega com prioridade, os 4 primeiros sem esperar; a contagem é o h2', () => {
  const h = pagina('bebe/index.html');
  const imgs = [...h.matchAll(/<a class="cartao"[\s\S]*?<img ([^>]+)>/g)].map((m) => m[1]);
  assert.ok(imgs.length >= 2, 'há cartões');
  assert.match(imgs[0], /fetchpriority="high"/);
  assert.doesNotMatch(imgs.slice(0, 4).join('\n'), /loading="lazy"/);
  assert.ok(imgs.slice(4).every((i) => /loading="lazy"/.test(i)));
  assert.match(h, /<h2 class="contagem">\d+ artigos?<\/h2>/);
  assert.match(pagina('finalizar/index.html'), /<input type="checkbox" id="termos" name="termos"/);
});
await teste('worker/www.js: segurança em todas as respostas; um ano de cache só no que tem o resumo no nome', async () => {
  const { cacheDe, comCabecalhos } = await import('../worker/www.js');
  const u = (c) => new URL('https://franjakids.com' + c);
  const ANO = 'public, max-age=31536000, immutable';
  assert.equal(cacheDe(u('/assets/img/babetes-promovidos-1-8e1f37fbad-1080.avif')), ANO);
  assert.equal(cacheDe(u('/assets/img/grande-babetes-promovidos-1.webp')), null, 'as do painel têm o nome fixo');
  assert.equal(cacheDe(u('/assets/css/site.css?v=1a2b3c4d')), ANO);
  assert.equal(cacheDe(u('/assets/css/site.css')), null);
  assert.equal(cacheDe(u('/assets/catalogo.json')), null);
  assert.equal(cacheDe(u('/produtos/manta-remalhada/')), null);
  assert.match(cacheDe(u('/assets/fontes/figtree-400-700.woff2')), /max-age=2592000/);
  const r = comCabecalhos(new Response('ola', { status: 200, headers: { 'Content-Type': 'text/html' } }), u('/assets/img/x-0123456789-360.webp'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Cache-Control'), ANO);
  assert.equal(r.headers.get('Content-Type'), 'text/html');
  for (const k of ['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']) assert.ok(r.headers.get(k), k);
  assert.match(r.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  // a 404 servida pelo nome responde 404, e um 304 não ganha cache nova
  assert.equal(comCabecalhos(new Response('x'), u('/404'), 404).status, 404);
  assert.equal(comCabecalhos(new Response(null, { status: 304 }), u('/assets/img/x-0123456789-360.webp')).headers.get('Cache-Control'), null);
});

// ---------------------------------------------------------------- o stock (11 nov 2026)
console.log('stock');
await teste('stock: um produto esgotado fica no site com «Esgotado» e sem compra; um tamanho ou uma cor esgotada não se escolhe; o catálogo e as regras recusam', () => {
  repor();
  mexer('produtos/manta-remalhada.json', (o) => { o.esgotado = true; });
  mexer('produtos/babygrow-com-nome.json', (o) => { o.tamanhosEsgotados = ['1 mês']; o.cores[0].esgotado = true; });
  const r = construir();
  assert.equal(r.status, 0, r.stderr);
  const manta = pagina('produtos/manta-remalhada/index.html');
  assert.match(manta, /data-esgotado/);
  assert.doesNotMatch(manta, /Adicionar ao carrinho/);
  assert.match(manta, /class="ficha__esgotado">Esgotado/);
  assert.match(manta, /"availability":"https:\/\/schema\.org\/OutOfStock"/);
  assert.match(pagina('bebe/index.html'), /cartao__selo--esgotado">Esgotado/);
  const bg = pagina('produtos/babygrow-com-nome/index.html');
  assert.match(bg, /value="1 mês"[^>]*disabled/);
  assert.doesNotMatch(bg, /value="3 meses"[^>]*disabled/);
  assert.match(bg, /value="Rosa"[^>]*disabled/);
  assert.match(bg, /value="Azul"[^>]*checked/, 'marcada à partida: a primeira cor que não está esgotada');
  assert.match(bg, /"availability":"https:\/\/schema\.org\/InStock"/, 'esgotados só um tamanho e uma cor: o produto continua à venda');
  const c = JSON.parse(pagina('assets/catalogo.json'));
  assert.equal(c.produtos['manta-remalhada'].esgotado, true);
  assert.deepEqual(c.produtos['babygrow-com-nome'].tamanhosEsgotados, ['1 mês']);
  assert.equal(c.produtos['babygrow-com-nome'].cores[0].esgotado, true);
  assert.equal(c.produtos['babygrow-com-nome'].esgotado, undefined);
  const bgc = c.produtos['babygrow-com-nome'];
  assert.equal(R.conferirEscolha(c.produtos['manta-remalhada'], { cor: 'Areia' }).campo, 'produto');
  assert.equal(R.conferirEscolha(bgc, { tamanho: '1 mês', cor: 'Azul' }).campo, 'tamanho');
  assert.equal(R.conferirEscolha(bgc, { tamanho: '3 meses', cor: 'Rosa' }).campo, 'cor');
  assert.equal(R.conferirEscolha(bgc, { tamanho: '3 meses', cor: 'Azul' }).ok, true);
  // todas as cores esgotadas: o produto inteiro está esgotado
  assert.equal(R.esgotadoDe({ ...bgc, cores: bgc.cores.map((x) => ({ ...x, esgotado: true })) }), true);
  repor();
});
await teste('stock: as regras do painel — «esgotado» é sim ou não; os tamanhos esgotados, uma lista', () => {
  const bg = produto('babygrow-com-nome');
  const chaves = (a) => R.problemasDoArtigo(a, { nome: 'babygrow-com-nome.json', catalogo: cat }).map((p) => p.chave);
  assert.ok(!chaves({ ...bg, esgotado: true, tamanhosEsgotados: ['1 mês'] }).some((k) => /esgotad/i.test(k)));
  assert.ok(chaves({ ...bg, esgotado: 'sim' }).some((k) => k.endsWith(':esgotado')));
  assert.ok(chaves({ ...bg, tamanhosEsgotados: '1 mês' }).some((k) => k.endsWith(':tamanhosEsgotados')));
});

await teste('aviso de stock: com o Worker, o produto esgotado pede o email; numa escolha esgotada, a abrir, com a lista do que acabou', () => {
  repor();
  mexer('produtos/manta-remalhada.json', (o) => { o.esgotado = true; });
  mexer('produtos/babygrow-com-nome.json', (o) => { o.tamanhosEsgotados = ['1 mês']; o.cores[0].esgotado = true; });
  let r = construir();
  assert.equal(r.status, 0, r.stderr);
  // sem o Worker (a pré-visualização) não há para onde mandar o pedido: fica a mensagem
  assert.doesNotMatch(pagina('produtos/manta-remalhada/index.html'), /data-aviso-stock/);
  assert.match(pagina('produtos/manta-remalhada/index.html'), /Perguntar por mensagem/);
  r = construir(['--api=https://franjakids-encomendas.exemplo.workers.dev']);
  assert.equal(r.status, 0, r.stderr);
  const manta = pagina('produtos/manta-remalhada/index.html');
  assert.match(manta, /<section class="aviso-stock" aria-labelledby="t-aviso" data-esgotado><h2 id="t-aviso">Esgotado: avisa-me quando voltar<\/h2>/);
  assert.doesNotMatch(manta, /<p class="aviso" data-esgotado>/, 'o aviso de stock já diz que está esgotado');
  assert.match(manta, /data-aviso-stock data-aviso-produto="manta-remalhada"/);
  assert.doesNotMatch(manta, /id="aviso-variante"|Perguntar por mensagem/);
  assert.match(manta, /<input id="aviso-email" name="email" type="email" autocomplete="email" required/);
  assert.match(manta, /depois apagamo-lo \(e ao fim de 6 meses, se não voltar\)/);
  const bg = pagina('produtos/babygrow-com-nome/index.html');
  assert.match(bg, /<details class="aviso-stock"><summary>Esgotado o que procuras\? <span>Avisamos-te quando voltar\.<\/span><\/summary>/);
  const opcoes = [...bg.match(/<select id="aviso-variante"[^]*?<\/select>/)[0].matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [JSON.parse(m[1].replace(/&quot;/g, '"')), m[2]]);
  assert.deepEqual(opcoes, [[{ grupo: 'Tamanho', valor: '1 mês' }, 'Tamanho 1 mês'], [{ grupo: 'Cor', valor: 'Rosa' }, 'Cor Rosa']]);
  // o aviso fica fora do formulário da compra (um formulário não pode estar dentro de outro)
  assert.ok(bg.indexOf('data-aviso-stock') > bg.indexOf('</form>'));
  assert.doesNotMatch(pagina('produtos/box-franja/index.html'), /aviso-stock/);
  repor();
});
await teste('preço por tamanho: a ficha mostra o acréscimo, o catálogo publicado leva-o, e o carrinho faz a conta das regras', () => {
  repor();
  const tb = cat.tamanhos[produto('body-dad-mini').tamanhos];
  const ultimo = tb[tb.length - 1];
  mexer('produtos/body-dad-mini.json', (o) => { o.suplementosTamanho = { [ultimo]: 2.5 }; });
  const r = construir();
  assert.equal(r.status, 0, r.stderr);
  assert.match(pagina('produtos/body-dad-mini/index.html'), new RegExp(`value="${ultimo}" data-suplemento="2\\.5"><span>${ultimo} <small>\\+2,50 €</small>`));
  const c = JSON.parse(pagina('assets/catalogo.json'));
  assert.deepEqual(c.produtos['body-dad-mini'].suplementosTamanho, { [ultimo]: 2.5 });
  assert.equal(c.produtos['manta-remalhada'].suplementosTamanho, undefined);
  // o carrinho do site (site.js, unidade) e o Worker (R.conferirEscolha) cobram o mesmo em todos os tamanhos
  const unidade = new Function('cents', `return ${pedaco(/const unidade = (\(i, cat\) => \{[\s\S]*?\n {2}\});/, SITE_JS2())}`)((v) => Math.round(v * 100));
  const pub = { produtos: { 'body-dad-mini': c.produtos['body-dad-mini'] } };
  for (const t of tb) assert.equal(unidade({ slug: 'body-dad-mini', tamanho: t, opcoes: {} }, pub), R.conferirEscolha(c.produtos['body-dad-mini'], { tamanho: t }).unidade_cents, t);
  assert.equal(unidade({ slug: 'body-dad-mini', tamanho: ultimo, opcoes: {} }, pub), 1490 + 250);
  // com os tamanhos sem acréscimo esgotados, o preço anunciado é o mais baixo que se paga: no cartão, na ficha, no
  // total da ficha e no Google (a revisão de 20 nov 2026: anunciava-se 14,90 € que já não se podia pagar)
  repor();
  mexer('produtos/body-dad-mini.json', (o) => { o.suplementosTamanho = Object.fromEntries(tb.slice(1).map((t) => [t, 2.5])); o.tamanhosEsgotados = [tb[0]]; });
  assert.equal(construir(['--producao', '--site=https://franjakids.com']).status, 1, 'sem os dados legais, a produção pára (a pré-visualização chega)');
  assert.equal(construir().status, 0);
  const f2 = pagina('produtos/body-dad-mini/index.html');
  assert.match(f2, /<p class="ficha__preco">17,40 €<\/p>/);
  assert.match(f2, /Total: <strong data-total>17,40 €<\/strong>/);
  assert.match(f2, /"price":"17\.40"/);
  assert.match(pagina('personalizados/bodies/index.html'), /<h3>Body[^<]*<\/h3><p class="cartao__preco">desde 17,40 €<\/p>/);
  repor();
});
await teste('textos da loja: o «Como funciona», os «Envios e prazos», as «Informações legais» e as páginas novas do «Sobre Nós»', () => {
  repor();
  assert.equal(construir().status, 0);
  const cf = pagina('como-funciona/index.html');
  for (const t of ['1. Escolhe o teu favorito', '2. Personaliza ao teu gosto', '3. Finaliza a tua encomenda', '4. Recebe com carinho']) assert.ok(cf.includes(`<h2>${t}</h2>`), t);
  assert.match(cf, /<h2>Precisas da tua encomenda para uma data especial\? <span class="coracao" aria-hidden="true">♡<\/span><\/h2>/);
  assert.match(cf, /o prazo habitual de produção e entrega é de 1 a 2 semanas\./);
  assert.match(cf, /<a class="botao botao--cheio" href="https:\/\/ig\.me\/m\/franjakids">Fala connosco no Instagram <span class="coracao" aria-hidden="true">♡<\/span><\/a>/);
  assert.match(cf, /A encomenda fica feita quando carregas em «Enviar encomenda»/, 'em modo «encomenda», o pagamento combina-se depois');
  const env = pagina('envios/index.html');
  assert.match(env, /Na Franja Kids, cada encomenda é preparada com todo o cuidado e carinho, para que chegue até ti da melhor forma possível\. <span class="coracao" aria-hidden="true">♡<\/span>/);
  assert.match(env, /Os artigos não personalizados são preparados para envio em 2 a 3 dias úteis\./);
  assert.match(env, /<h2>Levantamento em mão em Valongo<\/h2>/);
  assert.match(env, /<li>União Europeia: 8,00 €\.<\/li>/);
  assert.match(env, /<li>Restantes países: sob consulta\.<\/li>/);
  assert.match(env, /<li>Levantamento em mão em Valongo: gratuito\.<\/li><li>Restantes países: sob consulta\.<\/li>/, 'a lista da loja: o levantamento antes dos restantes países');
  assert.match(env, /Os prazos de transporte acrescem aos prazos de produção ou preparação\./);
  assert.match(env, /Envios para o resto do mundo/);
  assert.match(env, /taxas alfandegárias/);
  const il = pagina('informacoes-legais/index.html');
  assert.match(il, /<dt>Nome comercial<\/dt><dd>Franja Kids<\/dd>/);
  assert.match(il, /<dt>Titular da atividade<\/dt><dd>\[por confirmar: nome do titular\]<\/dd>/);
  for (const t of ['NIF', 'Morada', 'Email']) assert.ok(il.includes(`<dt>${t}</dt>`), t);
  assert.match(pagina('como-personalizar/index.html'), /<h1 id="t-pagina">Como personalizar<\/h1>/);
  const pf = pagina('perguntas-frequentes/index.html');
  assert.match(pf, /<h2>Posso levantar a minha encomenda em mão\?<\/h2>/);
  assert.match(pf, /Enviamos para países da União Europeia, com portes de 8,00 €\./);
  // os termos dizem os prazos e o que é sob consulta
  const t = pagina('termos/index.html');
  assert.match(t, /os outros artigos são preparados para envio em 2 a 3 dias úteis\. A página de cada artigo diz o prazo dele, e os prazos de transporte acrescem a estes\./);
  assert.match(t, /Para os Açores e a Madeira, e para os restantes países, os portes e o prazo são sob consulta, e a encomenda não se faz no site\./);
  // (a revisão de 20 nov 2026) o pagamento combinado por «você»; a confirmação diz o que o email leva; o telefone com o custo
  assert.match(t, /O pagamento é combinado consigo depois de confirmarmos a encomenda/);
  assert.match(t, /até ao fim do próprio dia e sempre antes da entrega, a confirmação da encomenda por email, com o resumo/);
  assert.doesNotMatch(t, /em anexo|até no próprio dia|combinamos contigo/);
  // a ficha diz o prazo da peça: a personalizada, o de produção; a sem personalização, o de preparação
  assert.match(pagina('produtos/manta-remalhada/index.html'), /Sai em 2 a 3 dias úteis\. Depois, até /);
  assert.match(pagina('produtos/body-dad-mini/index.html'), /Fazemos por encomenda em 1 a 2 semanas\. Depois, até [^.]+ por CTT no continente, ou levantamento em mão em Valongo, sem portes\./);
  assert.match(pagina('produtos/box-franja/index.html'), /Sem personalização, sai em 2 a 3 dias úteis; com personalização, em 1 a 2 semanas\./);
  // o Google: a manta não se faz por encomenda; o body sim
  assert.match(pagina('produtos/manta-remalhada/index.html'), /<meta name="description" content="[^"]*Da Franja Kids, com envio para todo o país\.">/);
  // o formulário de livre resolução sem o marcador (os dados da loja entram quando os há), e sem o «feito à mão» que nenhuma ficha descreve
  const tr = pagina('trocas-e-devolucoes/index.html');
  assert.doesNotMatch(tr, /descrevem-se na ficha/);
});

await teste('o texto da loja de 21 nov 2026: as perguntas frequentes e os contactos, com os prazos, os portes e os contactos dos dados', () => {
  repor();
  mexer('loja.json', (o) => { legal(o); o.empresa.telefone = '+351 910 000 000'; o.entrega.zonas[1].portes = 5.5; });
  let r = construir();
  assert.equal(r.status, 0, r.stderr);
  let pf = pagina('perguntas-frequentes/index.html');
  assert.match(pf, /<p>Encontra aqui as respostas às dúvidas mais comuns sobre encomendas, personalizações, pagamentos e envios\. Se precisares de ajuda, estamos sempre por perto! <span class="coracao" aria-hidden="true">♡<\/span><\/p>/);
  // os portes pela ordem da loja, o continente numa linha só com os portes grátis
  assert.match(pf, /<ul><li>Portugal continental: 3,50 € — grátis em compras a partir de 50 €\.<\/li><li>Açores e Madeira: 5,50 €\.<\/li><li>União Europeia: 8,00 €\.<\/li><li>Restantes países: sob consulta\.<\/li><li>Levantamento em mão em Valongo: gratuito\.<\/li><\/ul>/);
  // o limiar dos portes grátis como a loja o escreve: «60 €», sem os cêntimos (nos envios e no finalizar também)
  assert.match(pagina('envios/index.html'), /portes grátis em compras iguais ou superiores a 50 €\./);
  assert.match(pagina('finalizar/index.html'), /Grátis a partir de 50 €/);
  assert.match(pf, /Artigos personalizados: o prazo de preparação é, geralmente, de 1 a 2 semanas\.<\/li>\s*<li>Artigos sem personalização: o prazo de preparação é de 2 a 3 dias úteis\./);
  assert.match(pf, /Após o envio, a entrega em Portugal continental demora habitualmente até 2 dias úteis\./);
  assert.match(pf, /Basta selecionares a opção «Levantamento em mão — Valongo» ao finalizar a compra\./);
  assert.match(pf, /Podes indicar a data pretendida nas notas da encomenda/);
  assert.match(pagina('finalizar/index.html'), /<textarea id="notas" name="notas"/, 'as notas da encomenda existem');
  // em modo «encomenda» o pagamento combina-se depois: as opções do checkout só com os pagamentos ligados
  assert.match(pf, /combinamos contigo o pagamento, por MB WAY ou transferência/);
  assert.doesNotMatch(pf, /checkout/);
  assert.match(pf, /<a href="\/contactos\/">canais de atendimento<\/a>/);
  assert.match(pf, /<a class="botao botao--cheio" href="https:\/\/ig\.me\/m\/franjakids">/, 'o botão do Instagram fica');
  const ct = pagina('contactos/index.html');
  assert.match(ct, /<p>Estamos aqui para ajudar! <span class="coracao" aria-hidden="true">♡<\/span><\/p>/);
  assert.match(ct, /Tens alguma dúvida sobre os nossos artigos, personalizações ou encomendas\? Entra em contacto connosco\. Teremos todo o gosto em ajudar!/);
  assert.match(ct, /<h2>Email<\/h2><p><a href="mailto:ola@franjakids\.com">ola@franjakids\.com<\/a><\/p>/);
  assert.match(ct, /<h2>WhatsApp<\/h2><p><a href="https:\/\/wa\.me\/351910000000">\+351 910 000 000<\/a><\/p>/);
  assert.match(ct, /<h2>Instagram<\/h2><p><a href="https:\/\/ig\.me\/m\/franjakids">@franjakids<\/a><\/p>/);
  assert.match(ct, /Respondemos a todas as mensagens com a maior brevidade possível\./);
  assert.match(ct, /<p class="contactos__fecho">Franja Kids — Feito com amor, pensado para os mais pequenos\. <span class="coracao"/);
  assert.doesNotMatch(ct, /123456789|Rua de Ensaio/, 'o NIF e a morada ficam nas Informações legais');
  assert.match(ct, /<meta name="description" content="Os contactos da Franja Kids: email, WhatsApp e Instagram/);
  // um telefone fixo não tem WhatsApp; com os pagamentos ligados, o texto da loja sobre as opções do checkout
  mexer('loja.json', (o) => { o.empresa.telefone = '+351 220 000 000'; o.pagamentos.modo = 'online'; });
  r = construir(['--api=https://franjakids-encomendas.exemplo.workers.dev']);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(pagina('contactos/index.html'), /wa\.me|WhatsApp<\/h2>/);
  pf = pagina('perguntas-frequentes/index.html');
  assert.match(pf, /Podes consultar os métodos de pagamento disponíveis ao finalizar a tua encomenda\.<\/p>\s*<p>O pagamento é realizado através das opções apresentadas no checkout, de forma simples e segura\./);
});

await teste('SEO de 22 nov 2026: o cartão de partilha com o logótipo, os títulos das fichas, os portes no Offer, o nome colado e a chave do IndexNow', () => {
  // os títulos das fichas, com produtos de faz-de-conta: a 1.ª forma que cabe nos 65 caracteres
  const t = (nome, categorias, pers = true) => SEO.tituloDoProduto({ nome, _categorias: categorias, _pers: pers ? { rotulo: 'Nome' } : null });
  assert.equal(t('Body «Preparem o colinho»', ['personalizados/bodies']), 'Body «Preparem o colinho» · Bodies personalizados para bebé');
  assert.equal(t('Babygrow', ['bebe/bodies-e-babygrows', 'personalizados/babygrows']), 'Babygrow · Babygrows personalizados com nome', 'num artigo personalizável, a categoria dos Personalizados passa à frente');
  assert.equal(t('Body «Aceitas ser meu padrinho?»', ['personalizados/bodies']), 'Body personalizado «Aceitas ser meu padrinho?»', 'sem espaço para a categoria, o tipo de peça com «personalizado»');
  assert.equal(t('T-shirt «Eu posso ser tudo o que eu quiser»', ['crianca-e-familia/t-shirts-de-crianca']), 'T-shirt personalizada «Eu posso ser tudo o que eu quiser»', 'no feminino');
  assert.equal(t('Manta remalhada com um nome muito comprido para caber', ['bebe/mantas-e-cobertores'], false), 'Manta remalhada com um nome muito comprido para caber', 'sem personalização não se diz «personalizada»');
  assert.equal(t('Caixa surpresa personalizada', ['presentes/caixas-presente']), 'Caixa surpresa personalizada', 'o nome que já o diz fica como está');
  assert.equal(t('Body «Sou a prova de que o meu pai não joga padel o tempo todo»', ['personalizados/bodies']), 'Body «Sou a prova de que o meu pai não joga padel o tempo todo»', 'nada cabe: o nome');
  assert.equal(t('Lenço', ['bebe/outros']), 'Lenço', 'uma categoria sem título não acrescenta nada');

  repor();
  mexer('loja.json', (o) => { legal(o); });
  const r = construir(['--producao']);
  assert.equal(r.status, 0, r.stderr);
  const og = (h) => ({ img: h.match(/<meta property="og:image" content="([^"]*)"/)[1], w: h.match(/og:image:width" content="(\d+)"/)[1], h: h.match(/og:image:height" content="(\d+)"/)[1] });
  const noSite = (u) => path.join(SAIDA, u.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, ''));
  // o início e as páginas gerais partilham o logótipo num cartão 1200×630 (a regra do Renato, 16 nov 2026)
  for (const rel of ['index.html', 'sobre/index.html', 'contactos/index.html', 'perguntas-frequentes/index.html', 'como-funciona/index.html']) {
    const o = og(pagina(rel));
    assert.match(o.img, /\/assets\/marca\/franjakids-[0-9a-f]{10}-partilha\.jpg$/, `${rel}: o cartão com o logótipo`);
    assert.deepEqual([o.w, o.h], ['1200', '630'], rel);
    assert.ok(fs.existsSync(noSite(o.img)), `${rel}: o cartão existe no site`);
  }
  // as fichas partilham a fotografia delas, e o Offer leva os portes do continente (grátis acima do limiar)
  const lojaEnsaio = JSON.parse(fs.readFileSync(path.join(CONTEUDO, 'loja.json'), 'utf8'));
  let comOferta = 0;
  for (const slug of fs.readdirSync(path.join(SAIDA, 'produtos'))) {
    const h = pagina(`produtos/${slug}/index.html`);
    const o = og(h);
    assert.match(o.img, /\/assets\/img\/.+\.jpg$/, `${slug}: a fotografia`);
    assert.ok(fs.existsSync(noSite(o.img)), `${slug}: a fotografia existe`);
    const produto = [...h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((j) => j['@type'] === 'Product');
    if (!produto) continue;
    comOferta += 1;
    const portes = Number(produto.offers.price) >= lojaEnsaio.entrega.gratisAPartirDe ? 0 : lojaEnsaio.entrega.zonas.find((z) => z.id === 'continente').portes;
    assert.deepEqual(produto.offers.shippingDetails, { '@type': 'OfferShippingDetails', shippingRate: { '@type': 'MonetaryAmount', value: portes.toFixed(2), currency: 'EUR' }, shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'PT' } }, slug);
    const titulo = h.match(/<title>(.*?)<\/title>/s)[1];
    assert.ok(titulo.length <= 65 + 20, `${slug}: o título (com as entidades) não cresceu sem conta`);
  }
  assert.ok(comOferta > 0, 'há fichas com Offer no ensaio');
  // o nome do site também colado (como no Instagram e no domínio)
  const site = [...pagina('index.html').matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((j) => j['@type'] === 'WebSite');
  assert.equal(site.alternateName, 'FranjaKids');
  // a chave do IndexNow, na raiz, com ela própria lá dentro
  assert.match(SEO.INDEXNOW, /^[0-9a-f]{32}$/);
  assert.equal(fs.readFileSync(path.join(SAIDA, `${SEO.INDEXNOW}.txt`), 'utf8'), SEO.INDEXNOW);
});

// ---------------------------------------------------------------- os cupões (11 nov 2026)
console.log('cupões');
await teste('cupões: o campo «Tenho um cupão» só com o Worker das encomendas; o catálogo leva as categorias de cada produto e os nomes', () => {
  repor();
  let r = construir();
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(pagina('finalizar/index.html'), /data-cupao/, 'a pré-visualização sem o Worker não tem cupões');
  r = construir(['--api=https://franjakids-encomendas.exemplo.workers.dev']);
  assert.equal(r.status, 0, r.stderr);
  const f = pagina('finalizar/index.html');
  assert.match(f, /<details data-cupao-abrir><summary>Tenho um cupão<\/summary>/);
  assert.match(f, /<dt data-desconto-rotulo hidden>Cupão<\/dt><dd data-desconto hidden><\/dd>/);
  const c = JSON.parse(pagina('assets/catalogo.json'));
  assert.deepEqual(c.produtos['babygrow-com-nome'].categorias, produto('babygrow-com-nome').categorias);
  // os nomes das secções e das categorias (a frase de um cupão «só em Bodies», «só nos Presentes»)
  assert.equal(c.categorias['personalizados/babygrows'], 'Babygrows');
  assert.equal(c.categorias.presentes, 'Presentes');
  // a conta do desconto do finalizar é a do Worker (cupoes.js, descontoDoCupao)
  const doWorker = fs.readFileSync(path.join(RAIZ, 'worker/encomendas/cupoes.js'), 'utf8');
  const corpo = (de, re) => pedaco(re, de).replace(/\s+/g, ' ').replace(/regra/g, 'r');
  assert.equal(corpo(SITE_JS2(), /const descontoDe = \(r, linhas\) => \{([\s\S]*?)\n {4}\};/), corpo(doWorker, /export function descontoDoCupao\(regra, linhas\) \{([\s\S]*?)\n\}/));
  repor();
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${feitos} testes ${process.exitCode ? 'com falhas' : 'passaram'}`);
