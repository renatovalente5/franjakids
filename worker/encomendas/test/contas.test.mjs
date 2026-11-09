/* As contas e as validações (contas.js): o que, se estiver errado, cobra mal ou aceita o que não
   devia. Sem rede: só o catálogo. As contas de cada linha são as de R.conferirEscolha e as dos
   portes as de R.portesDe (src/lib/regras.mjs): estes testes provam que o Worker as usa como o
   site, e que as frases chegam ao site tal e qual. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contas, validarPedido, validarCliente, validarExtras, ErroDoPedido, limpar, cortar, hojeLisboa, horaDeLisboa, telefoneValido } from '../contas.js';
import { catalogoBase, catalogoDeEnsaio, pedidoValido, pedidoPorCorreio, clienteValido, moradaValida, clone } from './ajuda.mjs';

const cat = catalogoDeEnsaio();
const zona = (id, c = cat) => c.zonas.find((z) => z.id === id);
const MAO = zona('mao'), CONT = zona('continente'), ILHAS = zona('ilhas'), FORA = zona('estrangeiro');
const recusa = (fn, mensagem, campo) => {
  let e = null;
  try { fn(); } catch (x) { e = x; }
  assert.ok(e instanceof ErroDoPedido, `devia ter recusado${e ? ` (lançou ${e.message})` : ''}`);
  assert.equal(e.status, 400);
  if (mensagem) assert.match(e.message, mensagem);
  if (campo !== undefined) assert.equal(e.campo, campo);
  return e;
};
const babygrow = (sobre = {}) => ({ produto: 'babygrow-com-nome', tamanho: '1 mês', cor: 'Rosa', opcoes: {}, personalizar: true, texto: 'Clara', qtd: 1, ...sobre });
const ZWSP = String.fromCodePoint(0x200b), RLO = String.fromCodePoint(0x202e), BOM = String.fromCodePoint(0xfeff), ZWJ = String.fromCodePoint(0x200d), SHY = String.fromCodePoint(0xad);

test('a linha do contrato: um babygrow de 1 mês, rosa, com «Clara» bordado — 16,90 € + 3 €, e a forma da linha no KV', () => {
  const c = contas(cat, [babygrow()], MAO);
  assert.deepEqual(c.linhas, [{
    produto: 'babygrow-com-nome', nome: 'Babygrow', qtd: 1,
    tamanho: '1 mês', cor: 'Rosa', opcoes: {}, personalizar: true, texto: 'Clara',
    escolhas: ['Tamanho: 1 mês', 'Cor: Rosa', 'Nome a bordar: Clara'], personalizada: true,
    unidade_cents: 1990, total_cents: 1990,
  }]);
  assert.deepEqual({ ...c, linhas: null }, { linhas: null, artigos_cents: 1990, portes_cents: 0, portes_por_confirmar: false, total_cents: 1990 });
});

test('a personalização opcional: sem a caixa não há acréscimo nem texto; com a caixa o texto é obrigatório e tem tecto', () => {
  const sem = contas(cat, [babygrow({ personalizar: false })], MAO).linhas[0];
  assert.equal(sem.unidade_cents, 1690);
  assert.equal(sem.texto, '', 'o texto sem a caixa marcada não conta');
  assert.equal(sem.personalizada, false);
  assert.deepEqual(sem.escolhas, ['Tamanho: 1 mês', 'Cor: Rosa']);
  assert.equal(contas(cat, [babygrow({ texto: '  Maria   Clara ' })], MAO).linhas[0].texto, 'Maria Clara', 'os espaços juntam-se, como no site');
  recusa(() => contas(cat, [babygrow({ texto: '' })], MAO), /^Escreve «Nome a bordar» de «Babygrow», ou tira a personalização\.$/, 'texto');
  recusa(() => contas(cat, [babygrow({ texto: 'Maria Clarinha da Silva' })], MAO), /«Nome a bordar» de «Babygrow» tem mais de 15 caracteres/, 'texto');
  recusa(() => contas(cat, [babygrow({ texto: 'Ana</script>' })], MAO), /caracteres que não se podem usar/, 'texto');
});

test('a personalização obrigatória (sem caixa) e a que é só um campo opcional: sem acréscimo, «personalizada» quando há texto', () => {
  const adulto = { produto: 't-shirt-adulto', tamanho: 'M', cor: 'Preto', opcoes: {}, personalizar: false, qtd: 1 };
  recusa(() => contas(cat, [{ ...adulto, texto: '' }], MAO), /^Escreve «Frase ou nome» de «T-shirt de adulto personalizada»\.$/, 'texto');
  const comFrase = contas(cat, [{ ...adulto, texto: 'Melhor pai do mundo' }], MAO).linhas[0];
  assert.equal(comFrase.unidade_cents, 1500);
  assert.equal(comFrase.personalizada, true);
  assert.equal(comFrase.personalizar, false, '«personalizar» é o que veio do site (a caixa); a verdade é «personalizada»');
  const irmao = { produto: 't-shirt-promovido-a-irmao', tamanho: '4 anos', opcoes: { Texto: 'Irmã mais velha' }, qtd: 1 };
  const semNada = contas(cat, [{ ...irmao, texto: '' }], MAO).linhas[0];
  assert.equal(semNada.personalizada, false);
  assert.equal('cor' in semNada, false, 'um produto sem cores não leva cor');
  const comData = contas(cat, [{ ...irmao, texto: 'Maio 2026' }], MAO).linhas[0];
  assert.equal(comData.personalizada, true);
  assert.equal(comData.unidade_cents, 1200);
  assert.deepEqual(comData.escolhas, ['Tamanho: 4 anos', 'Texto: Irmã mais velha', 'Data ou nome: Maio 2026']);
  const manta = contas(cat, [{ produto: 'manta-remalhada', cor: 'Areia', qtd: 1 }], MAO).linhas[0];
  assert.equal('tamanho' in manta, false, 'um produto sem tamanhos não leva tamanho');
  assert.deepEqual(manta.escolhas, ['Cor: Areia']);
  assert.equal(manta.personalizada, false);
});

test('os acréscimos das escolhas: cada opção soma o seu, a personalização também, e a que falta vale a primeira SEM acréscimo', () => {
  const tudo = { produto: 'conjunto-de-ensaio', tamanho: '3 meses', opcoes: { Peças: 'Body, calças e babete', Embrulho: 'Caixa' }, personalizar: true, texto: 'Rui', qtd: 2 };
  const l = contas(cat, [tudo], MAO).linhas[0];
  assert.equal(l.unidade_cents, 2450 + 650 + 200 + 425);
  assert.equal(l.total_cents, 2 * 3725);
  assert.equal(l.cor, 'Branco', 'com uma cor só, o site pode não a mandar');
  assert.deepEqual(l.escolhas, ['Tamanho: 3 meses', 'Cor: Branco', 'Peças: Body, calças e babete', 'Embrulho: Caixa', 'Nome: Rui']);
  const falta = contas(cat, [{ ...tudo, opcoes: { Peças: 'Body e calças' }, personalizar: false, texto: '' }], MAO).linhas[0];
  assert.equal(falta.unidade_cents, 2450, '«Embrulho» falta: vale o «Saco», o primeiro sem acréscimo, e não a «Caixa» (+2 €)');
  assert.deepEqual(falta.escolhas, ['Tamanho: 3 meses', 'Cor: Branco', 'Peças: Body e calças', 'Embrulho: Saco']);
  assert.deepEqual(falta.opcoes, { Peças: 'Body e calças' }, 'em `opcoes` fica só o que veio do site');
  const lixo = contas(cat, [{ ...tudo, opcoes: { Peças: 'Body e calças', Inventado: 'x', constructor: 'y' } }], MAO).linhas[0];
  assert.deepEqual(lixo.opcoes, { Peças: 'Body e calças' }, 'os grupos que o produto não tem não se gravam');
  recusa(() => contas(cat, [{ ...tudo, opcoes: { Peças: 'Body sozinho' } }], MAO), /^«Body sozinho» já não é uma escolha de «Conjunto de ensaio»\. Escolhe outra vez\.$/, 'opcoes');
});

test('cada produto que o site vende hoje encomenda-se no Worker, com o preço da conta do carrinho (1 a 20 unidades)', () => {
  // O catálogo lido (o gerado, ou a cópia), sem os produtos de ensaio: com as escolhas que a ficha
  // marca à partida, o preço é o do produto mais os acréscimos dessas escolhas — a conta do
  // carrinho (site.js, unidade), feita aqui à parte.
  const base = catalogoBase();
  const c2 = catalogoDeEnsaio();
  c2.produtos = base.produtos;
  const ids = Object.keys(base.produtos);
  assert.ok(ids.length > 0, 'o catálogo tem produtos à venda');
  for (const id of ids) {
    const p = base.produtos[id];
    const ps = p.personalizacao;
    const linha = { produto: id, opcoes: {}, personalizar: false, texto: ps && ps.obrigatoria ? 'Ana' : '' };
    if (p.tamanhos.length) linha.tamanho = p.tamanhos[0];
    if (p.cores.length) linha.cor = p.cores[0].nome;
    let esperado = Math.round(p.preco * 100);
    for (const g of p.opcoes) esperado += Math.round(((g.valores.find((v) => !v.suplemento) || g.valores[0]).suplemento || 0) * 100);
    for (let qtd = 1; qtd <= 20; qtd++) {
      const r = contas(c2, [{ ...linha, qtd }], MAO);
      assert.equal(r.total_cents, esperado * qtd, `${id} × ${qtd}`);
    }
  }
});

test('os portes: os da zona; grátis no continente a partir de 50 € em artigos (no limiar também), nunca fora dele; zero em mão; null por confirmar', () => {
  const manta = (qtd) => [{ produto: 'manta-remalhada', cor: 'Areia', qtd }];
  const doisMantas = contas(cat, manta(2), CONT);
  assert.equal(doisMantas.artigos_cents, 4380);
  assert.equal(doisMantas.portes_cents, 390);
  assert.equal(doisMantas.total_cents, 4770);
  const tres = contas(cat, manta(3), CONT);
  assert.equal(tres.portes_cents, 0, '65,70 € em artigos: grátis');
  assert.equal(tres.total_cents, 6570);
  const limiar = catalogoDeEnsaio({ gratisAPartirDe: 43.8 });
  assert.equal(contas(limiar, manta(2), zona('continente', limiar)).portes_cents, 0, 'exactamente no limiar é grátis');
  const ilhas = catalogoDeEnsaio({ portes: { ilhas: 7.5, estrangeiro: 12 } });
  assert.equal(contas(ilhas, manta(3), zona('ilhas', ilhas)).portes_cents, 750, 'os portes grátis são só do continente');
  assert.equal(contas(ilhas, manta(3), zona('estrangeiro', ilhas)).portes_cents, 1200);
  assert.equal(contas(cat, manta(3), MAO).portes_cents, 0);
  const semGratis = catalogoDeEnsaio({ gratisAPartirDe: null });
  assert.equal(contas(semGratis, manta(3), zona('continente', semGratis)).portes_cents, 390, 'sem limiar, nunca grátis');
  const porConfirmar = contas(cat, manta(1), ILHAS);
  assert.equal(porConfirmar.portes_por_confirmar, true);
  assert.equal(porConfirmar.portes_cents, 0);
  assert.equal(porConfirmar.total_cents, 2190, 'por confirmar, o total é só os artigos, como no site');
});

test('portes por confirmar (null): em modo «encomenda» segue; em modo «online» recusa com a frase do contrato', () => {
  const semPortes = catalogoDeEnsaio({ portes: { continente: null } });
  const pedido = pedidoPorCorreio({ total_cents: 1990 });
  const ok = validarPedido(pedido, semPortes, 'encomenda');
  assert.equal(ok.contas.portes_por_confirmar, true);
  assert.equal(ok.contas.total_cents, 1990);
  recusa(() => validarPedido(pedido, semPortes, 'online'), /^Para esta entrega confirmamos os portes antes do pagamento: manda-nos mensagem no Instagram\.$/, 'entrega');
  assert.equal(validarPedido(pedidoValido(), semPortes, 'online').contas.portes_cents, 0, 'em mão segue em modo «online»');
});

test('recusa as linhas: produto que não existe ou não se compra, tamanho ou cor que falta, quantidade fora de 1–20, carrinho vazio ou enorme', () => {
  // O protótipo não é um produto: a frase é a do produto que não existe (com `in`, o «__proto__»
  // passava a ser um produto sem nome e sem preço, recusado por outra razão).
  for (const produto of ['nao-existe', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    recusa(() => contas(cat, [{ produto, qtd: 1 }], MAO), /^Um produto do carrinho já não se vende no site\. Tira-o do carrinho para continuar\.$/, 'produto');
  }
  const semPreco = clone(cat);
  semPreco.produtos['manta-remalhada'].preco = null;
  recusa(() => contas(semPreco, [{ produto: 'manta-remalhada', cor: 'Areia', qtd: 1 }], MAO), /^«Manta remalhada» já não se vende no site\.$/, 'produto');
  recusa(() => contas(cat, [babygrow({ tamanho: undefined })], MAO), /^Escolhe o tamanho de «Babygrow»\.$/, 'tamanho');
  recusa(() => contas(cat, [babygrow({ tamanho: '9 meses' })], MAO), /tamanho/, 'tamanho');
  recusa(() => contas(cat, [babygrow({ cor: 'Verde' })], MAO), /^Escolhe a cor de «Babygrow»\.$/, 'cor');
  for (const qtd of [0, 21, 1.5, '1', null]) recusa(() => contas(cat, [babygrow({ qtd })], MAO), /^A quantidade de cada produto vai de 1 a 20\.$/);
  recusa(() => contas(cat, [], MAO), /^O carrinho está vazio\.$/);
  recusa(() => contas(cat, 'babygrow-com-nome', MAO), /vazio/);
  recusa(() => contas(cat, Array.from({ length: 51 }, () => babygrow()), MAO), /produtos a mais/);
  recusa(() => contas(cat, ['babygrow-com-nome'], MAO), /não se reconhece/);
  assert.equal(contas(cat, Array.from({ length: 50 }, () => babygrow()), MAO).total_cents, 50 * 1990, '50 linhas ainda é um carrinho');
});

test('o cliente: cada frase, com o campo que o site marca', () => {
  const base = { nome: 'Ana', email: 'ana@exemplo.pt', telefone: '912345678' };
  assert.deepEqual(validarCliente(base, MAO), base);
  recusa(() => validarCliente({ ...base, nome: '' }, MAO), /^Escreve o teu nome\.$/, 'nome');
  recusa(() => validarCliente({ ...base, nome: `${ZWSP}${ZWSP} ${BOM}` }, MAO), /^Escreve o teu nome\.$/, 'nome');   // só invisíveis
  recusa(() => validarCliente({ ...base, nome: `${ZWJ}${ZWJ}` }, MAO), /nome/, 'nome');                           // só juntores
  for (const email of ['ana@exemplo', 'ana', 'ana @exemplo.pt', `${'a'.repeat(160)}@exemplo.pt`, '']) {
    recusa(() => validarCliente({ ...base, email }, MAO), /^Escreve um email como nome@exemplo\.pt\.$/, 'email');
  }
  assert.equal(validarCliente({ ...base, email: ' Ana@Exemplo.PT ' }, MAO).email, 'ana@exemplo.pt');
  recusa(() => validarCliente({ ...base, telefone: '91234' }, MAO), /^Escreve o telemóvel com 9 algarismos\.$/, 'telefone');
  recusa(() => validarCliente({ ...base, telefone: '1'.repeat(16) }, MAO), /telemóvel/, 'telefone');
  assert.equal(validarCliente({ ...base, telefone: '+351 912 345 678' }, MAO).telefone, '+351 912 345 678');
  assert.equal(validarCliente({ ...base, telefone: '+44 7911 123456' }, MAO).telefone, '+44 7911 123456', 'um telemóvel de fora também serve');
  assert.equal(validarCliente({ ...base, nif: '123 456 789' }, MAO).nif, '123456789');
  recusa(() => validarCliente({ ...base, nif: '123456788' }, MAO), /^O NIF não está certo\. Confirma-o ou deixa-o em branco\.$/, 'nif');
  recusa(() => validarCliente({ ...base, nif: '12345678' }, MAO), /NIF/, 'nif');
  assert.equal('nif' in validarCliente({ ...base, nif: '' }, MAO), false, 'o NIF vazio fica ausente');
  // Em mão, a morada ignora-se (e não se grava).
  assert.deepEqual(validarCliente({ ...base, ...moradaValida(), pais: 'Portugal' }, MAO), base);
  // Com envio, a morada, o código postal e a localidade.
  recusa(() => validarCliente(base, CONT), /^Escreve a morada\.$/, 'morada');
  recusa(() => validarCliente({ ...base, ...moradaValida(), codigoPostal: '44405' }, CONT), /^Escreve o código postal como 4440-000\.$/, 'codigoPostal');
  recusa(() => validarCliente({ ...base, ...moradaValida(), codigoPostal: '0440-503' }, CONT), /como 4440-000/, 'codigoPostal');
  recusa(() => validarCliente({ ...base, ...moradaValida(), codigoPostal: '9000-100' }, CONT), /^Em Portugal continental o código postal começa por 1 a 8\. Para os Açores e a Madeira, escolhe essa entrega\.$/, 'codigoPostal');
  recusa(() => validarCliente({ ...base, ...moradaValida() }, ILHAS), /^Nos Açores e na Madeira o código postal começa por 9\. Para Portugal continental, escolhe essa entrega\.$/, 'codigoPostal');
  recusa(() => validarCliente({ ...base, ...moradaValida(), codigoPostal: '95001' }, ILHAS), /^Escreve o código postal como 9500-000\.$/, 'codigoPostal');
  assert.equal(validarCliente({ ...base, ...moradaValida(), codigoPostal: '9500 321' }, ILHAS).codigoPostal, '9500-321');
  assert.equal(validarCliente({ ...base, ...moradaValida(), codigoPostal: '4440503' }, CONT).codigoPostal, '4440-503', 'sem o hífen, como o site também aceita');
  recusa(() => validarCliente({ ...base, ...moradaValida(), localidade: ' ' }, CONT), /^Escreve a localidade\.$/, 'localidade');
  const cont = validarCliente({ ...base, ...moradaValida(), pais: 'Espanha' }, CONT);
  assert.deepEqual(cont, { ...base, ...moradaValida() }, 'no continente o país é Portugal: o que vier não se grava');
  // Fora de Portugal: o código postal é texto livre (até 20) e o país é obrigatório.
  const fora = { ...base, morada: '12 Rue de la Paix', codigoPostal: 'SW1A 1AA', localidade: 'Paris', pais: 'França' };
  assert.deepEqual(validarCliente(fora, FORA), fora);
  recusa(() => validarCliente({ ...fora, codigoPostal: '' }, FORA), /^Escreve o código postal\.$/, 'codigoPostal');
  recusa(() => validarCliente({ ...fora, codigoPostal: 'X'.repeat(21) }, FORA), /^O código postal tem no máximo 20 caracteres\.$/, 'codigoPostal');
  recusa(() => validarCliente({ ...fora, pais: '' }, FORA), /^Escreve o país\.$/, 'pais');
  assert.equal(telefoneValido('912 345 678'), true);
});

test('a oferta e as notas: a mensagem só com oferta, as mudanças de linha ficam, acima dos limites recusa (não corta)', () => {
  assert.deepEqual(validarExtras({ oferta: false, mensagem: 'Parabéns!' }), { oferta: { sim: false }, notas: '' }, 'sem oferta não há cartão');
  assert.deepEqual(validarExtras({ oferta: 'sim', mensagem: 'x' }).oferta, { sim: false }, 'oferta é true ou não é');
  assert.deepEqual(validarExtras({ oferta: true }).oferta, { sim: true });
  assert.deepEqual(validarExtras({ oferta: true, mensagem: '  Parabéns,\r\n\n\n\nClara!  ' }).oferta, { sim: true, mensagem: 'Parabéns,\n\nClara!' });
  assert.equal(validarExtras({ oferta: true, mensagem: 'a'.repeat(240) }).oferta.mensagem.length, 240);
  recusa(() => validarExtras({ oferta: true, mensagem: 'a'.repeat(241) }), /^A mensagem para o cartão tem mais de 240 caracteres\.$/, 'mensagem');
  assert.equal(validarExtras({ notas: 'Preciso para dia 20' }).notas, 'Preciso para dia 20');
  assert.equal(validarExtras({ notas: 'n'.repeat(600) }).notas.length, 600);
  recusa(() => validarExtras({ notas: 'n'.repeat(601) }), /^As notas têm mais de 600 caracteres\.$/, 'notas');
});

test('o pedido inteiro: a entrega, os termos e o total têm de vir; o pedido do contrato passa', () => {
  const ok = validarPedido(pedidoValido({ oferta: true, mensagem: 'Parabéns!', notas: 'Preciso para dia 20' }), cat, 'encomenda');
  assert.equal(ok.zona.id, 'mao');
  assert.equal(ok.contas.total_cents, 1990);
  assert.deepEqual(ok.oferta, { sim: true, mensagem: 'Parabéns!' });
  assert.equal(ok.notas, 'Preciso para dia 20');
  recusa(() => validarPedido(pedidoValido({ entrega: 'lua' }), cat, 'encomenda'), /^Escolhe como queres receber a encomenda\.$/, 'entrega');
  recusa(() => validarPedido(pedidoValido({ entrega: undefined }), cat, 'encomenda'), /receber/, 'entrega');
  recusa(() => validarPedido(pedidoValido({ termos: 'sim' }), cat, 'encomenda'), /^Para encomendar, aceita os termos e condições\.$/, 'termos');
  recusa(() => validarPedido(pedidoValido({ termos: undefined }), cat, 'encomenda'), /termos/, 'termos');
  recusa(() => validarPedido(pedidoValido({ total_cents: '1990' }), cat, 'encomenda'), /^Pedido inválido: falta o total\.$/);
  recusa(() => validarPedido(pedidoValido({ entrega: 'continente' }), cat, 'encomenda'), /morada/, 'morada');
  recusa(() => validarPedido(null, cat, 'encomenda'), /^Pedido inválido\.$/);
  recusa(() => validarPedido([], cat, 'encomenda'), /^Pedido inválido\.$/);
  assert.equal(validarPedido(pedidoPorCorreio({ cliente: clienteValido({ ...moradaValida(), nif: '501964843' }) }), cat, 'online').cliente.nif, '501964843');
});

test('limpar: os de controlo passam a espaço, os invisíveis saem, os juntores dos emojis ficam; cortar não parte um emoji', () => {
  assert.equal(limpar(`  a${String.fromCodePoint(0)}b   c `, 10), 'a b c');
  assert.equal(limpar('x'.repeat(50), 10), 'x'.repeat(10));
  assert.equal(limpar(`Ma${ZWSP}ria`), 'Maria', 'o espaço de largura zero sai sem partir a palavra');
  assert.equal(limpar(`${RLO}etnelav`), 'etnelav', 'a marca de direcção sai');
  assert.equal(limpar(`An${SHY}a`), 'Ana');
  const familia = ['1F468', '200D', '1F469', '200D', '1F467'].map((h) => String.fromCodePoint(parseInt(h, 16))).join('');
  assert.equal(limpar(`Ana ${familia}`), `Ana ${familia}`, 'o emoji composto fica inteiro');
  assert.equal(limpar(`${ZWJ} ${ZWJ}`), '', 'só juntores é vazio');
  assert.equal(limpar('a\n\n\n\nb\tc', Infinity, { linhas: true }), 'a\n\nb c');
  assert.equal(limpar('a\nb'), 'a b', 'sem `linhas`, numa linha só');
  const emoji = String.fromCodePoint(0x1f476);   // um bebé: dois carácteres de UTF-16
  assert.equal(cortar(`ab${emoji}`, 3), 'ab', 'cortado a meio do emoji, o emoji sai inteiro');
  assert.equal(cortar(`ab${emoji}`, 4), `ab${emoji}`);
  assert.equal(cortar(null, 3), '');
});

test('a data de Lisboa feita à mão é a do Intl, hora a hora (o início e o fim de cada hora) de 2025 a 2032', () => {
  const intl = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fmt = (ms) => { const p = Object.fromEntries(intl.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
  const fim = Date.UTC(2033, 0, 1);
  let n = 0;
  for (let ms = Date.UTC(2025, 0, 1); ms < fim; ms += 3600 * 1000) {
    for (const t of [ms, ms + 3599 * 1000]) {
      const minha = horaDeLisboa(new Date(t)).toISOString().slice(0, 16);
      if (minha !== fmt(t)) assert.fail(`${new Date(t).toISOString()}: à mão ${minha}, Intl ${fmt(t)}`);
      n += 1;
    }
  }
  assert.ok(n > 140000);
  assert.equal(hojeLisboa(new Date('2026-07-01T23:30:00Z')), '2026-07-02', 'às 23:30 UTC de verão já é o dia seguinte em Lisboa');
  assert.equal(hojeLisboa(new Date('2026-12-01T23:30:00Z')), '2026-12-01');
  assert.equal(hojeLisboa(new Date('2026-03-29T00:59:59Z')), '2026-03-29');
});
