/* AS CORRIDAS (11 nov 2026, da revisão a fundo das encomendas): o que o KV fazia mal e o objecto
   durável de cada encomenda (objecto.js) faz bem — uma escrita do painel sobre uma leitura atrasada,
   a anulação que o «expired» da Stripe desfazia, duas mudanças ao mesmo tempo —, e o que veio com
   elas: o «Voltar» da Stripe (POST /encomenda/desistir), o travão dos emails por endereço e os dados
   sujos que se aceitavam. */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { assinar } from '../stripe.js';
import { MAX_EMAILS_POR_PAGAR } from '../email.js';
import { catalogoDeEnsaio, envFalso, redeFalsa, pedir, registar, bearer, pedidoValido, clienteValido } from './ajuda.mjs';

let rede;
afterEach(() => { if (rede) rede.repor(); rede = null; });

const SEGREDO = 'whsec_teste_1234567890';
async function webhook(env, evento) {
  const corpo = JSON.stringify({ created: Math.floor(Date.now() / 1000), ...evento });
  const t = Math.floor(Date.now() / 1000);
  const r = await worker.fetch(new Request('https://franjakids-encomendas.test/stripe/webhook', {
    method: 'POST', body: corpo, headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${await assinar(corpo, t, SEGREDO)}` },
  }), env);
  return { status: r.status, texto: await r.text() };
}
const sessaoPaga = (encomenda) => ({ id: 'evt_pago', type: 'checkout.session.completed', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 1990, payment_method_types: ['card'], client_reference_id: encomenda, metadata: { encomenda } } } });
const sessaoExpirada = (encomenda) => ({ id: 'evt_expirou', type: 'checkout.session.expired', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', client_reference_id: encomenda, metadata: { encomenda } } } });

/* Uma encomenda «online» pendente. `aoFechar(env)` corre quando o Worker pede à Stripe para fechar a
   página (para ver em que estado a encomenda já estava nesse instante). */
async function pendente({ aoFechar = null, fecho = null } = {}) {
  let env;
  rede = redeFalsa({
    catalogo: catalogoDeEnsaio({ modo: 'online' }),
    stripe: async (url, init) => {
      if (url.endsWith('/expire')) { if (aoFechar) await aoFechar(env); return fecho ? fecho() : Response.json({ id: 'cs_test_a1b2c3d4e5f6', status: 'expired' }); }
      if (init.method === 'POST') return Response.json({ id: 'cs_test_a1b2c3d4e5f6', url: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6' });
      return Response.json({});
    },
  });
  env = envFalso({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SEGREDO, RESEND_API_KEY: 're_x', STORE_EMAIL: 'loja@exemplo.pt' });
  const r = await registar(worker, env);
  rede.chamadas.length = 0;
  return { env, encomenda: r.encomenda, chave: r.chave };
}
const doObjecto = async (env, id) => (await pedir(worker, env, 'GET', `/painel/encomendas/${id}`, { cabecalhos: bearer() })).json;

test('uma nota do painel logo a seguir ao pagamento, com a cópia do KV atrasada, não apaga o pagamento', async () => {
  const { env, encomenda } = await pendente();
  const atrasada = env.ORDERS.dados.get(`order:${encomenda}`);   // a cópia de antes do pagamento
  assert.equal((await webhook(env, sessaoPaga(encomenda))).status, 200);
  // o KV de outro sítio do mundo ainda mostra a versão de antes (medido: ~50 s)
  env.ORDERS.dados.set(`order:${encomenda}`, atrasada);
  const r = await pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}/nota`, { corpo: { texto: 'Ligou a perguntar o prazo.', por: 'dona@exemplo.pt' }, cabecalhos: bearer() });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.estado, 'paga');
  const enc = await doObjecto(env, encomenda);
  assert.equal(enc.estado, 'paga');
  assert.equal(enc.stripe.payment_intent, 'pi_1');
  assert.ok(enc.stripe.pago_em && enc.avisos && enc.avisos.paga, 'o pagamento e os avisos ficam');
  assert.equal(enc.notas_painel.at(-1).texto, 'Ligou a perguntar o prazo.');
  // e a cópia do KV (a lista do painel) volta a ser a de agora
  assert.equal(JSON.parse(env.ORDERS.dados.get(`order:${encomenda}`).valor).estado, 'paga');
});

test('anular uma pendente: grava «anulada» ANTES de fechar a página da Stripe; o «expired» que vem a seguir não lhe mexe nem manda emails', async () => {
  let noFecho = null;
  const { env, encomenda } = await pendente({ aoFechar: async (e) => { noFecho = (await doObjecto(e, encomenda)).estado; } });
  const r = await pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}/estado`, { corpo: { estado: 'anulada', por: 'dona@exemplo.pt', avisar: false }, cabecalhos: bearer() });
  assert.equal(r.status, 200, r.texto);
  assert.equal(noFecho, 'anulada', 'quando a Stripe fecha a página, a encomenda já está anulada');
  const antes = rede.resend().length;
  assert.equal((await webhook(env, sessaoExpirada(encomenda))).status, 200);
  const enc = await doObjecto(env, encomenda);
  assert.equal(enc.estado, 'anulada');
  assert.ok(!enc.historico.some((h) => h.estado === 'expirou'));
  assert.equal(enc.avisos?.expirou, undefined);
  assert.equal(rede.resend().length, antes, 'nenhum email');
});

test('duas mudanças de estado ao mesmo tempo: uma passa e a outra dá 409 com o estado de agora', async () => {
  const { env, encomenda } = await pendente();
  const mudar = (estado) => pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}/estado`, { corpo: { estado, por: 'dona@exemplo.pt', avisar: false }, cabecalhos: bearer() });
  const [a, b] = await Promise.all([mudar('paga'), mudar('anulada')]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], `${a.status} ${a.texto} | ${b.status} ${b.texto}`);
  const perdeu = a.status === 409 ? a : b;
  assert.match(perdeu.json.erro, /mudou entretanto/);
  const enc = await doObjecto(env, encomenda);
  assert.equal(enc.historico.length, 2, 'pendente e uma só mudança');
  assert.equal(enc.estado, (a.status === 200 ? 'paga' : 'anulada'));
});

test('POST /encomenda/desistir: de volta da Stripe sem pagar, a página fecha-se e a encomenda fica «expirou», sem emails', async () => {
  const { env, encomenda, chave } = await pendente();
  const origem = { Origin: 'https://renatovalente5.github.io' };
  assert.equal((await pedir(worker, env, 'POST', '/encomenda/desistir', { corpo: { e: encomenda, c: 'A'.repeat(20) }, cabecalhos: origem })).status, 404, 'sem a chave certa, 404');
  const r = await pedir(worker, env, 'POST', '/encomenda/desistir', { corpo: { e: encomenda, c: chave }, cabecalhos: origem });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.estado, 'expirou');
  assert.ok(rede.stripe().some((c) => c.url.endsWith('/checkout/sessions/cs_test_a1b2c3d4e5f6/expire')));
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://renatovalente5.github.io');
  const enc = await doObjecto(env, encomenda);
  assert.deepEqual([enc.estado, enc.historico.at(-1).por], ['expirou', 'cliente']);
  assert.equal(rede.resend().length, 0, 'a pessoa está no site: sem emails');
  // o «expired» da Stripe a seguir não manda nada; outra vez o desistir, nada muda
  await webhook(env, sessaoExpirada(encomenda));
  assert.equal(rede.resend().length, 0);
  assert.equal((await pedir(worker, env, 'POST', '/encomenda/desistir', { corpo: { e: encomenda, c: chave }, cabecalhos: origem })).json.estado, 'expirou');
});

test('desistir de uma que se pagou nesse instante: a Stripe recusa fechar, e a encomenda fica para o webhook', async () => {
  const { env, encomenda, chave } = await pendente({ fecho: () => new Response('{"error":{"message":"This Checkout Session is complete"}}', { status: 400 }) });
  const r = await pedir(worker, env, 'POST', '/encomenda/desistir', { corpo: { e: encomenda, c: chave } });
  assert.equal(r.json.estado, 'pendente');
  assert.equal((await webhook(env, sessaoPaga(encomenda))).status, 200);
  assert.equal((await doObjecto(env, encomenda)).estado, 'paga');
});

test(`o travão dos emails: a mesma pessoa recebe no máximo ${MAX_EMAILS_POR_PAGAR} emails de encomendas por pagar por dia; a loja recebe sempre`, async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso({ RESEND_API_KEY: 're_x', STORE_EMAIL: 'loja@exemplo.pt' });
  const resultados = [];
  for (let i = 0; i <= MAX_EMAILS_POR_PAGAR; i++) {
    const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido({ cliente: clienteValido({ email: i % 2 ? 'VITIMA@exemplo.pt' : 'vitima@exemplo.pt' }) }) });
    assert.equal(r.status, 200, r.texto);
    resultados.push(r.json.encomenda);
  }
  const paraAVitima = rede.resend().filter((m) => [].concat(m.to).includes('vitima@exemplo.pt'));
  const paraALoja = rede.resend().filter((m) => [].concat(m.to).includes('loja@exemplo.pt'));
  assert.equal(paraAVitima.length, MAX_EMAILS_POR_PAGAR);
  assert.equal(paraALoja.length, MAX_EMAILS_POR_PAGAR + 1);
  const ultima = await doObjecto(env, resultados.at(-1));
  assert.match(ultima.avisos.registada.cliente, /^travado/);
});

test('dados sujos: um telemóvel com texto à volta recusa-se; umas notas que não são texto não se gravam («[object Object]»)', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  const mau = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido({ cliente: clienteValido({ telefone: 'visita evil.example 912345678' }) }) });
  assert.deepEqual([mau.status, mau.json.campo], [400, 'telefone']);
  const bom = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido({ cliente: clienteValido({ telefone: '(+351) 912.345-678' }), notas: { x: 1 } }) });
  assert.equal(bom.status, 200, bom.texto);
  const enc = await doObjecto(env, bom.json.encomenda);
  assert.equal('notas' in enc, false);
});
