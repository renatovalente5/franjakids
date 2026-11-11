/* A Stripe: a codificação que ela exige, a assinatura dos webhooks, e o webhook conduzido de ponta a
   ponta (pago, expirado, falhado, reembolsado, repetido, fora de ordem, com o Resend em baixo). */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { formEncode, verificarAssinatura, assinar, aplicarEvento, EVENTOS } from '../stripe.js';
import { catalogoDeEnsaio, envFalso, redeFalsa, pedir, registar, bearer, clienteValido, moradaValida } from './ajuda.mjs';
import { MAX_EMAILS_POR_PAGAR } from '../email.js';

let rede;
afterEach(() => { if (rede) rede.repor(); rede = null; });

test('formEncode: a Stripe não aceita JSON, tem de sair aninhado', () => {
  assert.equal(formEncode({ mode: 'payment' }), 'mode=payment');
  assert.equal(formEncode({ a: { b: { c: 1 } } }), 'a%5Bb%5D%5Bc%5D=1');
  assert.equal(formEncode({ line_items: [{ quantity: 2, price_data: { currency: 'eur', unit_amount: 1990 } }] }),
    'line_items%5B0%5D%5Bquantity%5D=2&line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=eur&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=1990');
  assert.equal(formEncode({ expand: ['latest_charge'] }), 'expand%5B%5D=latest_charge');
  assert.equal(formEncode({ a: 1, b: null, c: undefined, d: '' }), 'a=1');
  assert.ok(formEncode({ n: 'T-shirt «Fui promovido» & mais' }).includes('%C2%AB'));
});

const SEGREDO = 'whsec_teste_1234567890';
const AGORA = 1_800_000_000;

test('verificarAssinatura: HMAC sobre o corpo cru, com tolerância de 5 minutos e duas v1 na rotação do segredo', async () => {
  const corpo = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } });
  const boa = `t=${AGORA},v1=${await assinar(corpo, AGORA, SEGREDO)}`;
  assert.equal((await verificarAssinatura(corpo, boa, SEGREDO, AGORA)).id, 'evt_1');
  assert.ok(await verificarAssinatura(corpo, boa, SEGREDO, AGORA + 299));
  await assert.rejects(verificarAssinatura(corpo, boa, SEGREDO, AGORA + 301), /tolerância/);
  await assert.rejects(verificarAssinatura(corpo.replace('cs_1', 'cs_2'), boa, SEGREDO, AGORA), /inválida/);
  await assert.rejects(verificarAssinatura(corpo, `t=${AGORA},v1=${await assinar(corpo, AGORA, 'whsec_outro_123456789')}`, SEGREDO, AGORA), /inválida/);
  await assert.rejects(verificarAssinatura(corpo, null, SEGREDO, AGORA), /ausente/);
  await assert.rejects(verificarAssinatura(corpo, 'lixo', SEGREDO, AGORA), /malformada/);
  assert.ok(await verificarAssinatura(corpo, `t=${AGORA},v1=${await assinar(corpo, AGORA, 'whsec_velho')},v1=${await assinar(corpo, AGORA, SEGREDO)}`, SEGREDO, AGORA));
});

/* Um webhook assinado como a Stripe o manda. */
async function webhook(env, evento, { segredo = SEGREDO } = {}) {
  const corpo = JSON.stringify({ created: Math.floor(Date.now() / 1000), ...evento });
  const t = Math.floor(Date.now() / 1000);
  const r = await worker.fetch(new Request('https://franjakids-encomendas.test/stripe/webhook', {
    method: 'POST', body: corpo, headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${await assinar(corpo, t, segredo)}` },
  }), env);
  return { status: r.status, texto: await r.text() };
}

/* Uma encomenda em modo «online», pendente, com a sessão cs_test_a1b2c3d4e5f6. `pi` é a resposta da
   Stripe ao GET do PaymentIntent (o método da cobrança). */
async function pendente({ pi = null, resend, fecho = null, env: extraEnv = {}, sobre = {} } = {}) {
  rede = redeFalsa({
    catalogo: catalogoDeEnsaio({ modo: 'online' }),
    resend,
    stripe: (url, init) => {
      if (url.endsWith('/expire')) return fecho ? fecho() : Response.json({ id: 'cs_test_a1b2c3d4e5f6', status: 'expired' });
      if (init.method === 'POST') return Response.json({ id: 'cs_test_a1b2c3d4e5f6', url: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6' });
      if (url.includes('/payment_intents/')) return pi ? Response.json(pi) : new Response('{"error":{"message":"não há"}}', { status: 404 });
      return Response.json({});
    },
  });
  const env = envFalso({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SEGREDO, RESEND_API_KEY: 're_x', STORE_EMAIL: 'loja@exemplo.pt', ...extraEnv });
  const { encomenda } = await registar(worker, env, sobre);
  rede.chamadas.length = 0;
  env.ORDERS.escritas = 0;
  return { env, encomenda, ler: async () => JSON.parse(await env.ORDERS.get(`order:${encomenda}`)) };
}
const sessaoPaga = (encomenda, id = 'evt_pago', extra = {}) => ({ id, type: 'checkout.session.completed', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 1990, payment_method_types: ['card'], client_reference_id: encomenda, metadata: { encomenda }, ...extra } } });

test('o webhook: a sessão paga marca «paga», avisa o cliente e a loja UMA vez, e o evento repetido não repete nada', async () => {
  const { env, encomenda, ler } = await pendente();
  const r = await webhook(env, sessaoPaga(encomenda));
  assert.equal(r.status, 200, r.texto);
  const enc = await ler();
  assert.equal(enc.estado, 'paga');
  assert.deepEqual({ ...enc.historico.at(-1), em: 'x' }, { em: 'x', estado: 'paga', por: 'stripe' });
  assert.equal(enc.stripe.session_id, 'cs_test_a1b2c3d4e5f6');
  assert.equal(enc.stripe.payment_intent, 'pi_1');
  assert.equal(enc.stripe.metodo, 'card');
  assert.match(enc.stripe.pago_em, /^\d{4}-/);
  assert.equal(enc.avisos.paga.cliente, 'enviado');
  assert.equal(enc.avisos.paga.loja, 'enviado');
  assert.equal(await env.ORDERS.get('pi:pi_1'), encomenda);
  assert.equal(await env.ORDERS.get('evt:evt_pago'), '1');
  assert.equal(rede.stripe().length, 0, 'com um meio só na sessão, não se pergunta à Stripe');
  const emails = rede.resend();
  assert.equal(emails.length, 2);
  const cliente = emails.find((e) => e.to[0] === 'maria@exemplo.pt');
  assert.equal(cliente.subject, `Pagamento recebido — encomenda ${encomenda}`);
  assert.match(cliente.text, /Recebemos o teu pagamento\. Antes de produzirmos, mandamos-te a pré-visualização para aprovares\. Quando estiver pronta, combinamos contigo a entrega\./);
  assert.match(cliente.text, /ENTREGA\n {2}Entrega em mão: combinamos contigo o dia por mensagem\./, 'pela Stripe é a confirmação: leva a entrega');
  assert.match(cliente.text, /Os artigos personalizados não têm troca nem devolução por desistência/);
  const loja = emails.find((e) => e.to[0] === 'loja@exemplo.pt');
  assert.equal(loja.subject, `Encomenda paga ${encomenda} — 19,90 €`);
  assert.match(loja.text, /Pagamento: cartão · Stripe: pi_1/);
  assert.match(loja.text, /A seguir: a fatura e a pré-visualização para o cliente aprovar\./);
  // O mesmo evento outra vez: nada.
  rede.chamadas.length = 0;
  const escritas = env.ORDERS.escritas;
  const r2 = await webhook(env, sessaoPaga(encomenda));
  assert.equal(r2.status, 200);
  assert.equal(r2.texto, 'repetido');
  assert.equal(rede.resend().length, 0);
  assert.equal(env.ORDERS.escritas, escritas);
  // Um evento NOVO que também diz «pago» (o async_payment_succeeded depois do completed): sem emails.
  const r3 = await webhook(env, { ...sessaoPaga(encomenda, 'evt_pago_2'), type: 'checkout.session.async_payment_succeeded' });
  assert.equal(r3.status, 200);
  assert.equal(rede.resend().length, 0, 'a marca enc.avisos.paga evita o segundo email');
  assert.equal((await ler()).historico.filter((h) => h.estado === 'paga').length, 1);
});

test('o webhook: com vários meios na sessão, o método é o da cobrança (MB WAY), e não o primeiro da lista', async () => {
  const { env, encomenda, ler } = await pendente({ pi: { id: 'pi_1', object: 'payment_intent', latest_charge: { id: 'ch_1', payment_method_details: { type: 'mb_way' } } } });
  const r = await webhook(env, sessaoPaga(encomenda, 'evt_mbway', { payment_method_types: ['card', 'mb_way'] }));
  assert.equal(r.status, 200, r.texto);
  assert.equal((await ler()).stripe.metodo, 'mb_way');
  const [chamada] = rede.stripe();
  assert.equal(chamada.url, 'https://api.stripe.com/v1/payment_intents/pi_1?expand%5B%5D=latest_charge');
  assert.equal(chamada.init.method, 'GET');
  assert.match(rede.resend().find((e) => e.to[0] === 'loja@exemplo.pt').text, /Pagamento: MB WAY · Stripe: pi_1/);
});

test('o webhook: se a Stripe não disser o método, o pagamento conta na mesma (o método fica por saber)', async () => {
  const { env, encomenda, ler } = await pendente({ pi: null });
  const r = await webhook(env, sessaoPaga(encomenda, 'evt_sem_metodo', { payment_method_types: ['card', 'mb_way'] }));
  assert.equal(r.status, 200, r.texto);
  const enc = await ler();
  assert.equal(enc.estado, 'paga');
  assert.equal('metodo' in enc.stripe, false);
  assert.match(rede.resend().find((e) => e.to[0] === 'loja@exemplo.pt').text, /Pagamento: — · Stripe: pi_1/);
});

test('o webhook: uma sessão completa SEM pagamento (meio diferido) fica «pendente» até o dinheiro entrar', async () => {
  const { env, encomenda, ler } = await pendente();
  const semPagar = { id: 'evt_diferido_1', type: 'checkout.session.completed', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', payment_status: 'unpaid', payment_intent: 'pi_mb', metadata: { encomenda } } } };
  assert.equal((await webhook(env, semPagar)).status, 200);
  let enc = await ler();
  assert.equal(enc.estado, 'pendente');
  assert.equal(enc.stripe.payment_intent, 'pi_mb');
  assert.equal(rede.resend().length, 0, 'sem dinheiro não há «Pagamento recebido»');
  const pagou = { id: 'evt_diferido_2', type: 'checkout.session.async_payment_succeeded', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_mb', payment_method_types: ['multibanco'], metadata: { encomenda } } } };
  assert.equal((await webhook(env, pagou)).status, 200);
  enc = await ler();
  assert.equal(enc.estado, 'paga');
  assert.equal(enc.stripe.metodo, 'multibanco');
  assert.equal(rede.resend().length, 2);
});

test('o webhook: a sessão expirada e o pagamento falhado avisam; depois de paga, um evento atrasado não desfaz nada', async () => {
  const { env, encomenda, ler } = await pendente();
  const expirou = { id: 'evt_exp', type: 'checkout.session.expired', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', payment_status: 'unpaid', metadata: { encomenda } } } };
  assert.equal((await webhook(env, expirou)).status, 200);
  assert.equal((await ler()).estado, 'expirou');
  let emails = rede.resend();
  assert.equal(emails.length, 1, 'só à cliente: à loja não pede nada');
  const cliente = emails.find((e) => e.to[0] === 'maria@exemplo.pt');
  assert.equal(cliente.subject, `O pagamento da encomenda ${encomenda} não se concluiu`);
  assert.match(cliente.text, /A página de pagamento expirou sem o pagamento\. Nada foi cobrado\./);
  assert.doesNotMatch(cliente.text, /14 dias|desistência/);
  assert.equal((await ler()).avisos.expirou.loja, 'não se aplica');
  // Pagou afinal (a Stripe ainda aceitou o pagamento): fica paga.
  rede.chamadas.length = 0;
  assert.equal((await webhook(env, sessaoPaga(encomenda))).status, 200);
  assert.equal((await ler()).estado, 'paga');
  // Uma falha e uma expiração atrasadas não a desfazem, nem avisam.
  rede.chamadas.length = 0;
  for (const [id, type] of [['evt_falha', 'checkout.session.async_payment_failed'], ['evt_exp_2', 'checkout.session.expired']]) {
    assert.equal((await webhook(env, { id, type, data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', metadata: { encomenda } } } })).status, 200);
  }
  assert.equal((await ler()).estado, 'paga');
  assert.equal(rede.resend().length, 0);
});

test('o webhook: o pagamento falhado numa encomenda pendente marca «falhou» e avisa a cliente (à loja não pede nada)', async () => {
  const { env, encomenda, ler } = await pendente();
  const falhou = { id: 'evt_falhou', type: 'checkout.session.async_payment_failed', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', metadata: { encomenda } } } };
  assert.equal((await webhook(env, falhou)).status, 200);
  assert.equal((await ler()).estado, 'falhou');
  const emails = rede.resend();
  assert.match(emails.find((e) => e.to[0] === 'maria@exemplo.pt').text, /O pagamento não se concluiu\. Nada foi cobrado\./);
  assert.deepEqual(emails.map((e) => e.to[0]), ['maria@exemplo.pt']);
});

/* O MULTIBANCO (11 nov 2026, da LF Mobile): a sessão completa-se sem pagamento, a referência chega no
   payment_intent.requires_action, e o dinheiro no async_payment_succeeded (ou a referência expira:
   async_payment_failed). */
const MB = { entity: '12345', reference: '123 456 789', expires_at: 1800600000, hosted_voucher_url: 'https://payments.stripe.com/multibanco/voucher/x' };
const completaSemPagar = (encomenda, pi = 'pi_mb') => ({ id: `evt_mb_sessao_${pi}`, type: 'checkout.session.completed', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', status: 'complete', payment_status: 'unpaid', payment_intent: pi, metadata: { encomenda } } } });
const referenciaMB = (encomenda, id = 'evt_mb_ref', pi = 'pi_mb') => ({ id, type: 'payment_intent.requires_action', data: { object: { id: pi, object: 'payment_intent', status: 'requires_action', metadata: { encomenda }, next_action: { type: 'multibanco_display_details', multibanco_display_details: MB } } } });

test('o webhook: Multibanco — fica «pendente», a referência grava-se e o «Falta pagar» sai UMA vez, só à cliente; pago, «paga»; uma referência atrasada não manda nada', async () => {
  const { env, encomenda, ler } = await pendente();
  assert.equal((await webhook(env, completaSemPagar(encomenda))).status, 200);
  assert.equal((await ler()).estado, 'pendente');
  assert.equal(rede.resend().length, 0);
  assert.equal((await webhook(env, referenciaMB(encomenda))).status, 200);
  let enc = await ler();
  assert.equal(enc.estado, 'pendente');
  assert.deepEqual(enc.stripe.multibanco, { entidade: '12345', referencia: '123 456 789', validade: 1800600000, url: 'https://payments.stripe.com/multibanco/voucher/x' });
  assert.equal(enc.stripe.payment_intent, 'pi_mb');
  let emails = rede.resend();
  assert.equal(emails.length, 1, 'só à cliente: a loja sabe quando o pagamento entrar');
  assert.deepEqual(emails[0].to, ['maria@exemplo.pt']);
  assert.equal(emails[0].subject, `Falta pagar: referência Multibanco da encomenda ${encomenda}`);
  assert.match(emails[0].text, /paga a referência Multibanco abaixo/);
  assert.match(emails[0].text, new RegExp(`PAGAR POR MULTIBANCO\n {2}Entidade: 12345\n {2}Referência: 123 456 789\n {2}Valor: ${(enc.total_cents / 100).toFixed(2).replace('.', ',')} €\n {2}Válida até: \\d{2}/\\d{2}/\\d{4}`));
  assert.match(emails[0].html, />123 456 789</);
  assert.equal(enc.avisos.multibanco.cliente, 'enviado');
  // A Stripe reentrega, ou manda outra vez a mesma referência: não sai outro email.
  rede.chamadas.length = 0;
  assert.equal((await webhook(env, referenciaMB(encomenda))).texto, 'repetido');
  assert.equal((await webhook(env, referenciaMB(encomenda, 'evt_mb_ref_2'))).status, 200);
  assert.equal(rede.resend().length, 0);
  // Pagou: «paga», com o método, e a confirmação aos dois.
  const pagou = { id: 'evt_mb_pago', type: 'checkout.session.async_payment_succeeded', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_mb', payment_method_types: ['multibanco'], metadata: { encomenda } } } };
  assert.equal((await webhook(env, pagou)).status, 200);
  enc = await ler();
  assert.equal(enc.estado, 'paga');
  assert.equal(enc.stripe.metodo, 'multibanco');
  emails = rede.resend();
  assert.equal(emails.length, 2);
  assert.match(emails.find((e) => e.to[0] === 'loja@exemplo.pt').text, /Pagamento: Multibanco · Stripe: pi_mb/);
  // Uma referência que chega atrasada, depois de pago: não pede para pagar outra vez.
  rede.chamadas.length = 0;
  assert.equal((await webhook(env, referenciaMB(encomenda, 'evt_mb_ref_3'))).status, 200);
  assert.equal(rede.resend().length, 0);
  assert.equal((await ler()).estado, 'paga');
});

test('o webhook: um requires_action sem referência (o 3-D Secure de um cartão) não muda nada nem avisa', async () => {
  const { env, encomenda, ler } = await pendente();
  const antes = await ler();
  const tresDS = { id: 'evt_3ds', type: 'payment_intent.requires_action', data: { object: { id: 'pi_3ds', object: 'payment_intent', status: 'requires_action', metadata: { encomenda }, next_action: { type: 'use_stripe_sdk', use_stripe_sdk: {} } } } };
  assert.equal((await webhook(env, tresDS)).status, 200);
  assert.deepEqual(await ler(), antes);
  assert.equal(rede.resend().length, 0);
});

test('o webhook: a referência Multibanco que não se pagou a tempo — «falhou», e a frase diz que a referência expirou', async () => {
  const { env, encomenda, ler } = await pendente();
  await webhook(env, completaSemPagar(encomenda));
  await webhook(env, referenciaMB(encomenda));
  rede.chamadas.length = 0;
  const expirou = { id: 'evt_mb_falhou', type: 'checkout.session.async_payment_failed', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', payment_status: 'unpaid', payment_intent: 'pi_mb', metadata: { encomenda } } } };
  assert.equal((await webhook(env, expirou)).status, 200);
  assert.equal((await ler()).estado, 'falhou');
  const emails = rede.resend();
  assert.match(emails.find((e) => e.to[0] === 'maria@exemplo.pt').text, /A referência Multibanco expirou sem o pagamento\. Nada foi cobrado\./);
  assert.deepEqual(emails.map((e) => e.to[0]), ['maria@exemplo.pt'], 'à loja não vai nada');
});

test(`o «Falta pagar» do Multibanco tem o travão por endereço: no máximo ${MAX_EMAILS_POR_PAGAR} por dia a quem ainda não pagou`, async () => {
  const { env, encomenda } = await pendente();
  const ids = [encomenda];
  for (let i = 0; i < MAX_EMAILS_POR_PAGAR; i++) ids.push((await registar(worker, env)).encomenda);
  rede.chamadas.length = 0;
  for (const [i, e] of ids.entries()) assert.equal((await webhook(env, referenciaMB(e, `evt_mb_travao_${i}`, `pi_mb_${i}`))).status, 200);
  assert.equal(rede.resend().filter((m) => [].concat(m.to).includes('maria@exemplo.pt')).length, MAX_EMAILS_POR_PAGAR);
  const ultima = JSON.parse(await env.ORDERS.get(`order:${ids.at(-1)}`));
  assert.match(ultima.avisos.multibanco.cliente, /^travado/);
  assert.equal(ultima.stripe.multibanco.referencia, '123 456 789', 'a referência grava-se na mesma (o «obrigado» mostra-a)');
});

test('a dona anula uma encomenda à espera do Multibanco: a página já se completou, por isso cancela-se o pagamento (a referência deixa de valer)', async () => {
  const { env, encomenda, ler } = await pendente({ fecho: () => new Response('{"error":{"message":"Only Checkout Sessions with a status of open can be expired."}}', { status: 400 }) });
  await webhook(env, completaSemPagar(encomenda));
  await webhook(env, referenciaMB(encomenda));
  rede.chamadas.length = 0;
  const r = await pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}/estado`, { cabecalhos: bearer(), corpo: { estado: 'anulada', por: 'dona@exemplo.pt', avisar: false } });
  assert.equal(r.status, 200, r.texto);
  assert.equal((await ler()).estado, 'anulada');
  const pedidos = rede.stripe().map((c) => c.url);
  assert.deepEqual(pedidos, ['https://api.stripe.com/v1/checkout/sessions/cs_test_a1b2c3d4e5f6/expire', 'https://api.stripe.com/v1/payment_intents/pi_mb/cancel']);
  const cancelar = rede.stripe().at(-1);
  assert.equal(cancelar.init.method, 'POST');
  assert.equal(cancelar.init.body, 'cancellation_reason=abandoned');
});

test('o webhook: o reembolso total marca «reembolsada» e avisa o cliente; o parcial fica só no histórico', async () => {
  const { env, encomenda, ler } = await pendente();
  await webhook(env, sessaoPaga(encomenda));
  rede.chamadas.length = 0;
  const parcial = { id: 'evt_r1', type: 'charge.refunded', data: { object: { id: 'ch_1', object: 'charge', payment_intent: 'pi_1', amount: 1990, amount_refunded: 300, refunded: false, metadata: { encomenda } } } };
  assert.equal((await webhook(env, parcial)).status, 200);
  let enc = await ler();
  assert.equal(enc.estado, 'paga');
  assert.equal(enc.stripe.reembolsado_cents, 300);
  assert.deepEqual({ ...enc.historico.at(-1), em: 'x' }, { em: 'x', estado: 'paga', por: 'stripe', nota: 'Reembolso parcial: 3,00 €' });
  assert.equal(rede.resend().length, 0);
  const total = { id: 'evt_r2', type: 'charge.refunded', data: { object: { id: 'ch_1', object: 'charge', payment_intent: 'pi_1', amount: 1990, amount_refunded: 1990, refunded: true, metadata: {} } } };
  assert.equal((await webhook(env, total)).status, 200, 'sem metadata, chega pelo índice pi:');
  enc = await ler();
  assert.equal(enc.estado, 'reembolsada');
  assert.equal(enc.stripe.reembolsado_cents, 1990);
  const emails = rede.resend();
  assert.equal(emails.length, 1, 'só o cliente: a loja foi quem devolveu');
  assert.equal(emails[0].subject, `Reembolso feito — encomenda ${encomenda}`);
  assert.match(emails[0].text, /Devolvemos 19,90 € ao meio de pagamento que usaste\./);
  // Um «pago» atrasado depois do reembolso não manda nada a ninguém.
  rede.chamadas.length = 0;
  assert.equal((await webhook(env, sessaoPaga(encomenda, 'evt_pago_tarde'))).status, 200);
  assert.equal((await ler()).estado, 'reembolsada');
  assert.equal(rede.resend().length, 0);
});

test('o webhook: um pagamento que chega a uma encomenda já anulada não a «paga» — fica no histórico e a loja é avisada para devolver', async () => {
  const { env, encomenda, ler } = await pendente();
  const anular = await pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}/estado`, { cabecalhos: bearer(), corpo: { estado: 'anulada', por: 'dona@exemplo.pt', nota: 'A cliente desistiu por mensagem.' } });
  assert.equal(anular.status, 200, anular.texto);
  rede.chamadas.length = 0;
  assert.equal((await webhook(env, sessaoPaga(encomenda))).status, 200);
  const enc = await ler();
  assert.equal(enc.estado, 'anulada');
  assert.deepEqual({ ...enc.historico.at(-1), em: 'x' }, { em: 'x', estado: 'anulada', por: 'stripe', nota: 'O pagamento entrou depois de a encomenda ser anulada: é preciso devolvê-lo.' });
  assert.match(enc.stripe.pago_em, /^\d{4}-/);
  const emails = rede.resend();
  assert.equal(emails.length, 1, 'nada de «Pagamento recebido» ao cliente de uma encomenda anulada');
  assert.equal(emails[0].to[0], 'loja@exemplo.pt');
  assert.equal(emails[0].subject, `Pagamento numa encomenda anulada: ${encomenda} — 19,90 €`);
  assert.match(emails[0].text, /É preciso devolvê-lo na Stripe\./);
  assert.deepEqual({ ...enc.avisos.paga, em: 'x' }, { em: 'x', cliente: 'não se aplica', loja: 'enviado' });
});

test('a dona anula uma encomenda «pendente»: a página da Stripe fecha-se, e o «expired» que vem a seguir não avisa ninguém', async () => {
  const { env, encomenda, ler } = await pendente();
  const r = await pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}/estado`, { cabecalhos: bearer(), corpo: { estado: 'anulada', por: 'dona@exemplo.pt' } });
  assert.equal(r.status, 200, r.texto);
  const fecho = rede.stripe().filter((c) => c.url.endsWith('/expire'));
  assert.equal(fecho.length, 1, 'pediu à Stripe para fechar a página');
  assert.equal(fecho[0].url, 'https://api.stripe.com/v1/checkout/sessions/cs_test_a1b2c3d4e5f6/expire');
  assert.equal(fecho[0].init.method, 'POST');
  rede.chamadas.length = 0;
  const expirou = { id: 'evt_exp_anulada', type: 'checkout.session.expired', data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', payment_status: 'unpaid', metadata: { encomenda } } } };
  assert.equal((await webhook(env, expirou)).status, 200);
  const enc = await ler();
  assert.equal(enc.estado, 'anulada');
  assert.deepEqual(enc.historico.map((h) => h.estado), ['pendente', 'anulada']);
  assert.equal(rede.resend().length, 0, 'nem «O pagamento não se concluiu» ao cliente, nem «expirou» à loja');
});

test('com a Stripe a recusar fechar a página (já pagou, ou já fechou), a dona muda o estado na mesma', async () => {
  const { env, encomenda, ler } = await pendente({ fecho: () => new Response('{"error":{"message":"Only Checkout Sessions with a status of open can be expired."}}', { status: 400 }) });
  const r = await pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}/estado`, { cabecalhos: bearer(), corpo: { estado: 'paga', por: 'dona@exemplo.pt', nota: 'Pagou por MB WAY à parte.' } });
  assert.equal(r.status, 200, r.texto);
  assert.equal((await ler()).estado, 'paga');
  assert.equal(rede.stripe().filter((c) => c.url.endsWith('/expire')).length, 1);
  assert.equal(rede.stripe().filter((c) => c.url.endsWith('/cancel')).length, 0, 'sem pagamento começado (nem referência), não há nada a cancelar');
  // Uma encomenda que já não está «pendente» não tem página aberta: não se pergunta outra vez.
  rede.chamadas.length = 0;
  assert.equal((await pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}/estado`, { cabecalhos: bearer(), corpo: { estado: 'anulada' } })).status, 200);
  assert.equal(rede.stripe().length, 0);
});

test('o webhook: assinatura errada 400, sem segredo 503, evento sem encomenda nossa 200, encomenda ainda invisível 409', async () => {
  const { env, encomenda } = await pendente();
  assert.equal((await webhook(env, sessaoPaga(encomenda), { segredo: 'whsec_errado' })).status, 400);
  assert.equal((await webhook(envFalso({ STRIPE_WEBHOOK_SECRET: '' }), sessaoPaga(encomenda))).status, 503);
  const alheio = await webhook(env, { id: 'evt_x', type: 'checkout.session.completed', data: { object: { id: 'cs_outra', object: 'checkout.session', payment_status: 'paid', metadata: {} } } });
  assert.equal(alheio.status, 200);
  assert.equal(alheio.texto, 'sem encomenda');
  const invisivel = await webhook(env, sessaoPaga('FK-20261109-ABCDEF', 'evt_inv'));
  assert.equal(invisivel.status, 409, 'pede reentrega: o KV pode ainda não a mostrar');
  const velho = await webhook(env, { ...sessaoPaga('FK-20261109-ABCDEF', 'evt_velho'), created: Math.floor(Date.now() / 1000) - 7200 });
  assert.equal(velho.status, 200, 'ao fim de uma hora desiste');
  const daLF = await webhook(env, sessaoPaga('LF-20261109-ABCDEF', 'evt_lf'));
  assert.equal(daLF.status, 200, 'um id que não é nosso não pede reentrega');
  assert.equal((await worker.fetch(new Request('https://x.test/stripe/webhook', { method: 'GET' }), env)).status, 405);
  assert.equal(await env.ORDERS.get('evt:evt_x'), null, 'sem efeitos, sem marca (cada escrita conta)');
});

test('o webhook: com o Resend em baixo responde 500 (a Stripe reentrega), o estado já ficou gravado, e na reentrega os emails saem', async () => {
  let emBaixo = true;
  const { env, encomenda, ler } = await pendente({ resend: () => (emBaixo ? new Response('x', { status: 503 }) : Response.json({ id: 're_1' })) });
  const r = await webhook(env, sessaoPaga(encomenda));
  assert.equal(r.status, 500);
  let enc = await ler();
  assert.equal(enc.estado, 'paga', 'o dinheiro entrou: o estado grava-se antes dos emails');
  assert.equal('avisos' in enc, false);
  assert.equal(await env.ORDERS.get('evt:evt_pago'), null, 'sem marca: a reentrega volta a aplicar');
  emBaixo = false;
  rede.chamadas.length = 0;
  const r2 = await webhook(env, sessaoPaga(encomenda));
  assert.equal(r2.status, 200);
  assert.equal(rede.resend().length, 2, 'na reentrega os emails saem');
  enc = await ler();
  assert.equal(enc.avisos.paga.cliente, 'enviado');
  assert.equal(enc.historico.filter((h) => h.estado === 'paga').length, 1, 'e o histórico não repete o pagamento');
  assert.equal(await env.ORDERS.get('evt:evt_pago'), '1');
});

test('aplicarEvento: um estado posterior nunca recua por um evento atrasado', () => {
  for (const [estado, entrega] of [['pronta', 'mao'], ['enviada', 'continente'], ['levantada', 'mao']]) {
    for (const type of ['checkout.session.completed', 'checkout.session.async_payment_succeeded']) {
      const enc = { encomenda: 'FK-20261109-ABCDEF', estado, entrega, total_cents: 100, historico: [], stripe: { session_id: 'cs_1', pago_em: '2026-11-09T10:00:00.000Z' } };
      const { avisos } = aplicarEvento(enc, { type, data: { object: { id: 'cs_1', payment_status: 'paid' } } });
      assert.equal(enc.estado, estado, `${estado} / ${type}`);
      assert.equal(enc.stripe.pago_em, '2026-11-09T10:00:00.000Z', 'a data do primeiro pagamento fica');
      assert.deepEqual(avisos, ['paga'], 'o aviso pede-se na mesma: a marca decide se já foi');
    }
    for (const type of ['checkout.session.expired', 'checkout.session.async_payment_failed']) {
      const enc = { estado, entrega, historico: [], stripe: {} };
      assert.deepEqual(aplicarEvento(enc, { type, data: { object: { id: 'cs_1' } } }).avisos, []);
      assert.equal(enc.estado, estado);
    }
  }
  assert.deepEqual(EVENTOS, ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired', 'payment_intent.requires_action', 'charge.refunded']);
});

test('em modo «online» com envio, o webhook pago manda à loja a morada e o NIF (e ao cliente, o NIF não)', async () => {
  const { env, encomenda } = await pendente({ sobre: { entrega: 'continente', cliente: clienteValido({ ...moradaValida(), nif: '123456789' }), total_cents: 2380 } });
  assert.equal((await webhook(env, sessaoPaga(encomenda))).status, 200);
  const loja = rede.resend().find((e) => e.to[0] === 'loja@exemplo.pt');
  assert.match(loja.text, /Rua das Flores, 10, 2\.º Esq\., 4440-503 Valongo/);
  assert.match(loja.text, /NIF: 123456789/);
  const cliente = rede.resend().find((e) => e.to[0] === 'maria@exemplo.pt');
  assert.equal(cliente.text.includes('123456789'), false);
  assert.match(cliente.text, /Recebemos o teu pagamento\. Antes de produzirmos, mandamos-te a pré-visualização para aprovares\. Avisamos-te quando a encomenda seguir\./);
});
