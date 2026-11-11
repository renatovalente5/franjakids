/* OS CUPÕES (cupoes.js, 11 nov 2026): a regra que o painel grava, a conta do desconto, o POST /cupao do
   finalizar, o /checkout com o cupão (o desconto, o uso reservado num passo só — o limite e o «um por
   pessoa» —, a Stripe com o cupão de uso único) e o uso que volta quando a encomenda não se faz. */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { assinar } from '../stripe.js';
import { validarRegra, descontoDoCupao, normalizarCodigo, emailCanonico } from '../cupoes.js';
import { catalogoDeEnsaio, envFalso, redeFalsa, pedir, bearer, pedidoValido, pedidoPorCorreio, clienteValido } from './ajuda.mjs';

let rede;
afterEach(() => { if (rede) rede.repor(); rede = null; });

const ORIGEM = { Origin: 'https://renatovalente5.github.io' };
const SEGREDO = 'whsec_teste_1234567890';
const gravarCupao = (env, codigo, regra) => pedir(worker, env, 'PUT', `/painel/cupoes/${codigo}`, { corpo: regra, cabecalhos: bearer() });
const usos = async (env, codigo) => ((await pedir(worker, env, 'GET', '/painel/cupoes', { cabecalhos: bearer() })).json.cupoes.find((c) => c.codigo === codigo) || {}).usos;
const ficha = async (env, id) => (await pedir(worker, env, 'GET', `/painel/encomendas/${id}`, { cabecalhos: bearer() })).json;

test('a regra: o código em maiúsculas, os tipos, os limites e as datas; o que não presta diz o campo', () => {
  assert.equal(normalizarCodigo(' bem vindo '), 'BEMVINDO');
  assert.equal(normalizarCodigo('x'), '');
  assert.deepEqual(validarRegra({ codigo: 'bemvindo', tipo: 'percentagem', valor: 10 }).regra, { codigo: 'BEMVINDO', tipo: 'percentagem', ativo: true, valor: 10 });
  assert.equal(validarRegra({ codigo: 'X1', tipo: 'percentagem', valor: 10 }).campo, 'codigo');
  assert.equal(validarRegra({ codigo: 'ABC', tipo: 'brinde' }).campo, 'tipo');
  assert.equal(validarRegra({ codigo: 'ABC', tipo: 'percentagem', valor: 95 }).campo, 'valor');
  assert.equal(validarRegra({ codigo: 'ABC', tipo: 'valor', valor: 5.555 }).campo, 'valor');
  assert.equal(validarRegra({ codigo: 'ABC', tipo: 'portes', desde: '2026-12-10', ate: '2026-12-01' }).campo, 'ate');
  assert.equal(validarRegra({ codigo: 'ABC', tipo: 'portes', categorias: ['inventada'] }, { categorias: ['bodies'] }).campo, 'categorias');
  assert.equal(validarRegra({ codigo: 'ABC', tipo: 'portes', limite: 0 }).campo, 'limite');
  assert.equal(emailCanonico('A.Na+promo@GMAIL.com'), 'ana@gmail.com');
});

test('o desconto: a percentagem arredonda ao cêntimo, o valor fixo não passa dos artigos, os portes só com tudo da categoria', () => {
  const linhas = [{ total_cents: 1990, categoria: 'babygrows' }, { total_cents: 1500, categoria: 't-shirts' }];
  assert.deepEqual(descontoDoCupao({ tipo: 'percentagem', valor: 15 }, linhas), { cents: 524, portes: false });
  assert.deepEqual(descontoDoCupao({ tipo: 'percentagem', valor: 10, categorias: ['t-shirts'] }, linhas), { cents: 150, portes: false });
  assert.deepEqual(descontoDoCupao({ tipo: 'valor', valor: 50 }, linhas), { cents: 3490, portes: false });
  assert.deepEqual(descontoDoCupao({ tipo: 'portes', categorias: ['t-shirts'] }, linhas), { cents: 0, portes: false });
  assert.deepEqual(descontoDoCupao({ tipo: 'portes' }, linhas), { cents: 0, portes: true });
});

test('o painel: cria, lista com os usos e a frase, recusa o que não presta e apaga', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  const r = await gravarCupao(env, 'bemvindo', { tipo: 'percentagem', valor: 10, minimo: 20, categorias: ['babygrows'], nota: 'Para a primeira compra' });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.codigo, 'BEMVINDO');
  assert.equal(r.json.descricao, '10% de desconto em Babygrows, nas compras a partir de 20 €');
  assert.equal((await gravarCupao(env, 'MAU', { tipo: 'percentagem', valor: 0 })).json.campo, 'valor');
  assert.equal((await gravarCupao(env, 'OUTRO', { tipo: 'portes', categorias: ['inventada'] })).json.campo, 'categorias');
  const l = await pedir(worker, env, 'GET', '/painel/cupoes', { cabecalhos: bearer() });
  assert.deepEqual(l.json.cupoes.map((c) => [c.codigo, c.usos, c.nota]), [['BEMVINDO', 0, 'Para a primeira compra']]);
  assert.equal((await pedir(worker, env, 'DELETE', '/painel/cupoes/BEMVINDO', { cabecalhos: bearer() })).status, 200);
  assert.equal((await pedir(worker, env, 'DELETE', '/painel/cupoes/BEMVINDO', { cabecalhos: bearer() })).status, 404);
  assert.equal((await pedir(worker, env, 'GET', '/painel/cupoes')).status, 401, 'sem o segredo, nada');
});

test('POST /cupao: o finalizar confere um código e vê o desconto; os que não valem dizem porquê', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  await gravarCupao(env, 'DEZ', { tipo: 'percentagem', valor: 10 });
  await gravarCupao(env, 'GRANDE', { tipo: 'valor', valor: 5, minimo: 100 });
  await gravarCupao(env, 'PORTES', { tipo: 'portes' });
  await gravarCupao(env, 'NATAL', { tipo: 'percentagem', valor: 20, desde: '2099-12-01' });
  await gravarCupao(env, 'PARADO', { tipo: 'percentagem', valor: 20, ativo: false });
  const { linhas } = pedidoValido();
  const conferir = (codigo, entrega = 'mao') => pedir(worker, env, 'POST', '/cupao', { corpo: { codigo, linhas, entrega }, cabecalhos: ORIGEM });
  const bom = await conferir('dez');
  assert.equal(bom.status, 200, bom.texto);
  assert.deepEqual([bom.json.cupao.codigo, bom.json.cupao.descricao, bom.json.desconto_cents], ['DEZ', '10% de desconto', 199]);
  assert.equal(bom.headers.get('access-control-allow-origin'), 'https://renatovalente5.github.io');
  assert.match((await conferir('GRANDE')).json.erro, /a partir de 100 €/);
  assert.match((await conferir('PORTES')).json.erro, /não se aplica a esta entrega/, 'portes grátis numa entrega em mão: não dá nada');
  assert.equal((await conferir('PORTES', 'continente')).status, 200);
  assert.match((await conferir('NATAL')).json.erro, /só vale a partir de 01\/12\/2099/);
  assert.match((await conferir('PARADO')).json.erro, /não existe ou já não vale/);
  assert.match((await conferir('NAOHA')).json.erro, /não existe/);
  assert.equal((await conferir('x')).json.campo, 'cupao');
});

test('o /checkout com cupão: o desconto no total, na encomenda e nos emails; o uso conta', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso({ RESEND_API_KEY: 're_x', STORE_EMAIL: 'loja@exemplo.pt' });
  await gravarCupao(env, 'DEZ', { tipo: 'percentagem', valor: 10 });
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoPorCorreio({ cupao: 'dez', total_cents: 1990 - 199 + 390 }) });
  assert.equal(r.status, 200, r.texto);
  const enc = await ficha(env, r.json.encomenda);
  assert.deepEqual([enc.cupao, enc.desconto_cents, enc.total_cents, enc.cupao_contado], ['DEZ', 199, 2181, true]);
  assert.equal(await usos(env, 'DEZ'), 1);
  const cliente = rede.resend().find((m) => [].concat(m.to).includes('maria@exemplo.pt'));
  assert.match(cliente.text, /Cupão DEZ: −1,99 €/);
  assert.match(cliente.html, /Cupão DEZ/);
  // o que o site mostrou tem de bater com o desconto: sem ele, 409
  assert.equal((await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoPorCorreio({ cupao: 'DEZ' }) })).status, 409);
  // a vista pública (a página «obrigado») mostra o cupão
  const vista = await pedir(worker, env, 'GET', `/encomenda?e=${r.json.encomenda}&c=${r.json.chave}`, { cabecalhos: ORIGEM });
  assert.deepEqual([vista.json.cupao, vista.json.desconto_cents], ['DEZ', 199]);
});

test('o limite e o «um por pessoa» conferem-se num passo só: dois ao mesmo tempo, só um passa', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  await gravarCupao(env, 'UMSO', { tipo: 'valor', valor: 5, limite: 1 });
  const pedidoCom = (email) => pedidoValido({ cupao: 'UMSO', cliente: clienteValido({ email }), total_cents: 1990 - 500 });
  const [a, b] = await Promise.all([pedir(worker, env, 'POST', '/checkout', { corpo: pedidoCom('a@exemplo.pt') }), pedir(worker, env, 'POST', '/checkout', { corpo: pedidoCom('b@exemplo.pt') })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 400], `${a.texto} | ${b.texto}`);
  const recusado = a.status === 400 ? a : b;
  assert.equal(recusado.json.campo, 'cupao');
  assert.match(recusado.json.erro, /já foi usado o número de vezes que podia/);
  assert.equal(await usos(env, 'UMSO'), 1);

  await gravarCupao(env, 'UMPOR', { tipo: 'valor', valor: 5, porCliente: true });
  const p = (email) => pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido({ cupao: 'UMPOR', cliente: clienteValido({ email }), total_cents: 1490 }) });
  assert.equal((await p('ana@gmail.com')).status, 200);
  const outraVez = await p('A.na+2@gmail.com');
  assert.match(outraVez.json.erro, /uma vez por pessoa/, 'a mesma pessoa, com o email escrito de outra maneira');
  assert.equal((await p('rui@exemplo.pt')).status, 200);
});

test('modo «online»: a Stripe recebe um cupão de uso único com o desconto; o uso volta quando expira ou se desiste', async () => {
  rede = redeFalsa({
    catalogo: catalogoDeEnsaio({ modo: 'online' }),
    stripe: (url, init) => {
      if (url.endsWith('/coupons')) return Response.json({ id: 'cpn_teste' });
      if (url.endsWith('/expire')) return Response.json({ id: 'cs_test_a1b2c3d4e5f6', status: 'expired' });
      if (url.endsWith('/checkout/sessions') && init.method === 'POST') return Response.json({ id: 'cs_test_a1b2c3d4e5f6', url: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6' });
      return Response.json({});
    },
  });
  const env = envFalso({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SEGREDO });
  await gravarCupao(env, 'CINCO', { tipo: 'valor', valor: 5 });
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido({ cupao: 'CINCO', total_cents: 1490 }) });
  assert.equal(r.status, 200, r.texto);
  const cupao = rede.stripe().find((c) => c.url.endsWith('/coupons'));
  const pc = new URLSearchParams(cupao.corpo);
  assert.deepEqual([pc.get('amount_off'), pc.get('currency'), pc.get('max_redemptions'), pc.get('duration')], ['500', 'eur', '1', 'once']);
  const sessao = new URLSearchParams(rede.stripe().find((c) => c.url.endsWith('/checkout/sessions')).corpo);
  assert.equal(sessao.get('discounts[0][coupon]'), 'cpn_teste');
  assert.equal(await usos(env, 'CINCO'), 1, 'reservado logo que a encomenda fica registada');
  // a Stripe diz que expirou: o uso volta (uma vez)
  const corpo = JSON.stringify({ id: 'evt_exp', created: Math.floor(Date.now() / 1000), type: 'checkout.session.expired', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', metadata: { encomenda: r.json.encomenda } } } });
  const t = Math.floor(Date.now() / 1000);
  await worker.fetch(new Request('https://franjakids-encomendas.test/stripe/webhook', { method: 'POST', body: corpo, headers: { 'stripe-signature': `t=${t},v1=${await assinar(corpo, t, SEGREDO)}` } }), env);
  assert.equal(await usos(env, 'CINCO'), 0);
  assert.equal((await ficha(env, r.json.encomenda)).cupao_contado, false);
  // outra encomenda com o cupão, e a pessoa desiste: o uso volta também
  const r2 = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido({ cupao: 'CINCO', total_cents: 1490 }) });
  assert.equal(await usos(env, 'CINCO'), 1);
  await pedir(worker, env, 'POST', '/encomenda/desistir', { corpo: { e: r2.json.encomenda, c: r2.json.chave } });
  assert.equal(await usos(env, 'CINCO'), 0);
});

test('a dona anula uma encomenda com cupão: o uso volta; marcá-la paga outra vez volta a contá-lo', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  await gravarCupao(env, 'CINCO', { tipo: 'valor', valor: 5 });
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido({ cupao: 'CINCO', total_cents: 1490 }) });
  assert.equal(await usos(env, 'CINCO'), 1);
  const mudar = (estado) => pedir(worker, env, 'POST', `/painel/encomendas/${r.json.encomenda}/estado`, { corpo: { estado, por: 'dona@exemplo.pt', avisar: false }, cabecalhos: bearer() });
  assert.equal((await mudar('anulada')).status, 200);
  assert.equal(await usos(env, 'CINCO'), 0);
});
