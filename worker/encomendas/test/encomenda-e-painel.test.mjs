/* O GET /encomenda (a resposta pública, sem dados pessoais) e as rotas do painel (o segredo, a
   lista, a ficha, os estados e as transições proibidas, as notas, a saúde). */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { razaoParaNao, TRANSICOES_PAINEL, ESTADOS, metadadosDe } from '../encomenda.js';
import { catalogoDeEnsaio, envFalso, redeFalsa, pedir, pedidoValido, clienteValido, moradaValida, registar, bearer, ORIGEM } from './ajuda.mjs';

let rede;
afterEach(() => { if (rede) rede.repor(); rede = null; });
const porCorreio = (sobre = {}) => ({ entrega: 'continente', cliente: clienteValido(moradaValida()), total_cents: 2380, ...sobre });

test('GET /encomenda: com a chave certa dá só o que a pessoa já sabe (§3); sem ela, ou errada, 404', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio({ portes: { continente: null } }) });
  const env = envFalso();
  const { encomenda, chave } = await registar(worker, env, porCorreio({ total_cents: 1990, cliente: clienteValido({ ...moradaValida(), nif: '123456789' }), oferta: true, mensagem: 'Para a avó Rosa', notas: 'Deixar no café' }));
  const r = await pedir(worker, env, 'GET', `/encomenda?e=${encomenda}&c=${chave}`, { cabecalhos: { Origin: ORIGEM } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGEM);
  assert.deepEqual(r.json, {
    encomenda, estado: 'registada', modo: 'encomenda', entrega: 'continente', portes_por_confirmar: true,
    linhas: [{ nome: 'Babygrow', qtd: 1, total_cents: 1990, escolhas: ['Tamanho: 1 mês', 'Cor: Rosa', 'Nome a bordar: Clara'] }],
    artigos_cents: 1990, portes_cents: 0, total_cents: 1990,
    cliente: { nome: 'Maria' },
  });
  const texto = JSON.stringify(r.json);
  for (const proibido of ['maria@exemplo.pt', '912', '123456789', chave, 'Rua das Flores', '4440', 'Valongo', 'Fernanda', 'avó Rosa', 'café']) {
    assert.equal(texto.includes(proibido), false, `não pode levar «${proibido}»`);
  }
  for (const mau of [`/encomenda?e=${encomenda}&c=${'A'.repeat(20)}`, `/encomenda?e=${encomenda}`, `/encomenda?e=FK-20261109-ZZZZZZ&c=${chave}`, `/encomenda?e=${encomenda.toLowerCase()}&c=${chave}`, `/encomenda?e=${encomenda.replace('FK-', 'LF-')}&c=${chave}`, '/encomenda?e=order:x&c=y', `/encomenda?e=${encomenda}&c=${chave.toLowerCase()}`]) {
    const m = await pedir(worker, env, 'GET', mau);
    assert.equal(m.status, 404, mau);
    assert.deepEqual(m.json, { erro: 'Encomenda não encontrada.' });
  }
  const falta = await pedir(worker, env, 'GET', '/encomenda');
  assert.equal(falta.status, 400);
  assert.deepEqual(falta.json, { erro: 'Falta o número da encomenda.' });
});

test('GET /encomenda?s=: pela sessão da Stripe (só as que este Worker abriu), e a sessão paga adianta-se ao webhook', async () => {
  let paga = false;
  rede = redeFalsa({
    catalogo: catalogoDeEnsaio({ modo: 'online' }),
    stripe: (url, init) => (init.method === 'GET'
      ? Response.json({ id: 'cs_test_a1b2c3d4e5f6', payment_status: paga ? 'paid' : 'unpaid' })
      : Response.json({ id: 'cs_test_a1b2c3d4e5f6', url: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6' })),
  });
  const env = envFalso({ STRIPE_SECRET_KEY: 'sk_test_x' });
  const { encomenda } = await registar(worker, env);
  const antes = await pedir(worker, env, 'GET', '/encomenda?s=cs_test_a1b2c3d4e5f6');
  assert.equal(antes.status, 200);
  assert.equal(antes.json.encomenda, encomenda);
  assert.equal(antes.json.estado, 'pendente');
  assert.equal(antes.json.modo, 'online');
  paga = true;
  const depois = await pedir(worker, env, 'GET', '/encomenda?s=cs_test_a1b2c3d4e5f6');
  assert.equal(depois.json.estado, 'paga', 'mostra «paga» pela sessão…');
  assert.equal(JSON.parse(await env.ORDERS.get(`order:${encomenda}`)).estado, 'pendente', '…mas quem grava é o webhook');
  const chamadas = rede.stripe().length;
  assert.equal((await pedir(worker, env, 'GET', '/encomenda?s=cs_test_outra_sessao')).status, 404);
  assert.equal((await pedir(worker, env, 'GET', '/encomenda?s=lixo')).status, 404);
  assert.equal(rede.stripe().length, chamadas, 'uma sessão que não é nossa nem chega à Stripe');
});

test('o painel: sem o bearer 401, com o bearer errado 401, sem segredo no Worker 503, sem CORS', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  assert.equal((await pedir(worker, env, 'GET', '/painel/saude')).status, 401);
  assert.equal((await pedir(worker, env, 'GET', '/painel/saude', { cabecalhos: bearer('segredo-do-painel-de-tesTE') })).status, 401, 'outro segredo do mesmo tamanho');
  assert.equal((await pedir(worker, env, 'GET', '/painel/saude', { cabecalhos: bearer('outro') })).status, 401);
  assert.equal((await pedir(worker, env, 'GET', '/painel/encomendas', { cabecalhos: { Authorization: 'Basic abc' } })).status, 401);
  assert.equal((await pedir(worker, env, 'GET', '/painel/saude', { cabecalhos: bearer() })).status, 200);
  assert.equal((await pedir(worker, envFalso({ PAINEL_SEGREDO: '' }), 'GET', '/painel/saude', { cabecalhos: bearer() })).status, 503);
  const semCors = await pedir(worker, env, 'GET', '/painel/saude', { cabecalhos: { ...bearer(), Origin: ORIGEM } });
  assert.equal(semCors.headers.get('Access-Control-Allow-Origin'), null, 'o painel não tem CORS');
});

test('GET /painel/saude diz o modo e o que está ligado (booleanos), e o erro do catálogo quando não se lê', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const r = await pedir(worker, envFalso({ RESEND_API_KEY: 're_x', STORE_EMAIL: 'loja@exemplo.pt' }), 'GET', '/painel/saude', { cabecalhos: bearer() });
  assert.deepEqual(r.json, { ok: true, modo: 'encomenda', stripe: false, webhook: false, email: true, dona: true, catalogo: 'ok' });
  rede.repor();
  rede = redeFalsa({ catalogo: catalogoDeEnsaio({ modo: 'online' }) });
  const online = await pedir(worker, envFalso({ STRIPE_SECRET_KEY: 'sk_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }), 'GET', '/painel/saude', { cabecalhos: bearer() });
  assert.deepEqual(online.json, { ok: true, modo: 'online', stripe: true, webhook: true, email: false, dona: false, catalogo: 'ok' });
  rede.repor();
  rede = redeFalsa({ catalogo: null });
  const semCat = await pedir(worker, envFalso(), 'GET', '/painel/saude', { cabecalhos: bearer() });
  assert.equal(semCat.json.ok, true);
  assert.equal(semCat.json.modo, null);
  assert.match(semCat.json.catalogo, /HTTP 404/);
  rede.repor();
  rede = redeFalsa({ catalogo: { ...catalogoDeEnsaio(), v: 3 } });
  const versao = await pedir(worker, envFalso({ MODO: 'encomenda' }), 'GET', '/painel/saude', { cabecalhos: bearer() });
  assert.match(versao.json.catalogo, /versão 3, e o Worker só conhece a 2/);
  assert.equal(versao.json.modo, 'encomenda', 'com o travão, o modo sabe-se na mesma');
});

test('a lista do painel: as mais recentes primeiro, com o resumo, e os filtros por estado, dia e texto', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  const a = await registar(worker, env, { cliente: { nome: 'José Antão', email: 'jose@exemplo.pt', telefone: '911111111' } });
  await new Promise((r) => setTimeout(r, 5));
  const b = await registar(worker, env, porCorreio({ cliente: { nome: 'Maria Conceição', email: 'conceicao@exemplo.pt', telefone: '922 222 222', ...moradaValida() } }));
  const lista = await pedir(worker, env, 'GET', '/painel/encomendas', { cabecalhos: bearer() });
  assert.equal(lista.status, 200);
  assert.equal(lista.json.total, 2);
  assert.equal(lista.json.pagina, 1);
  assert.equal(lista.json.paginas, 1);
  assert.deepEqual(lista.json.encomendas.map((e) => e.encomenda), [b.encomenda, a.encomenda]);
  const resumo = lista.json.encomendas[1];
  assert.deepEqual(Object.keys(resumo).sort(), ['actualizada_em', 'cliente', 'criada_em', 'encomenda', 'entrega', 'estado', 'linhas', 'modo', 'total_cents']);
  assert.deepEqual(resumo.cliente, { nome: 'José Antão', telefone: '911111111' });
  assert.deepEqual(resumo.linhas, [{ nome: 'Babygrow', qtd: 1 }]);
  assert.equal(resumo.estado, 'registada');
  assert.equal(resumo.entrega, 'mao');
  assert.equal(lista.json.encomendas[0].entrega, 'continente');
  assert.equal(lista.json.encomendas[0].total_cents, 2380);
  assert.equal(JSON.stringify(lista.json).includes('jose@exemplo.pt'), false, 'o resumo não leva o email');
  const q = async (s) => (await pedir(worker, env, 'GET', `/painel/encomendas?${s}`, { cabecalhos: bearer() })).json;
  assert.deepEqual((await q('q=conceicao')).encomendas.map((e) => e.encomenda), [b.encomenda], 'sem acentos nem maiúsculas');
  assert.deepEqual((await q('q=ANTÃO')).encomendas.map((e) => e.encomenda), [a.encomenda]);
  assert.deepEqual((await q('q=JOSE@')).encomendas.map((e) => e.encomenda), [a.encomenda], 'pelo email');
  assert.deepEqual((await q('q=922222')).encomendas.map((e) => e.encomenda), [b.encomenda], 'o telefone compara-se só pelos algarismos');
  assert.deepEqual((await q(`q=${a.encomenda.slice(-6).toLowerCase()}`)).encomendas.map((e) => e.encomenda), [a.encomenda], 'pelo id');
  const hoje = a.encomenda.slice(3, 11).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  assert.equal((await q(`desde=${hoje}&ate=${hoje}`)).total, 2);
  assert.equal((await q('ate=2020-01-01')).total, 0);
  assert.equal((await q('desde=lixo')).total, 2, 'um dia que não é dia não filtra');
  assert.equal((await q('estado=paga')).total, 0);
  assert.equal((await q('estado=registada')).total, 2);
  assert.equal((await q('pagina=2')).encomendas.length, 0);
  assert.equal((await pedir(worker, env, 'POST', '/painel/encomendas', { cabecalhos: bearer(), corpo: {} })).status, 405);
});

test('os metadados da chave cabem em 1 024 BYTES (não caracteres), mesmo com nomes acentuados e um carrinho enorme', () => {
  const nomeLongo = 'T-shirt «Fui promovido a irmão mais velho» ção ção ção';
  const enc = { estado: 'registada', modo: 'encomenda', entrega: 'mao', total_cents: 1, criada_em: new Date().toISOString(), actualizada_em: new Date().toISOString(), cliente: { nome: '鈴木'.repeat(60), telefone: '9'.repeat(50), email: `${'e'.repeat(200)}@x.pt` }, linhas: Array.from({ length: 50 }, () => ({ nome: nomeLongo, qtd: 20 })) };
  const m = metadadosDe(enc);
  const bytes = new TextEncoder().encode(JSON.stringify(m)).length;
  assert.ok(bytes <= 1024, `tem ${bytes} bytes`);
  assert.ok(JSON.stringify(m).length < bytes, 'em caracteres pareceria caber mais: conta-se em bytes');
  assert.ok(m.mais > 0, 'diz quantas linhas ficaram de fora');
  assert.equal(m.linhas.length + m.mais, 50);
  assert.equal(metadadosDe({ ...enc, linhas: [{ nome: 'Babygrow', qtd: 1 }] }).mais, undefined, 'quando cabe tudo, não há «mais»');
});

test('a ficha do painel traz a encomenda inteira; um id que não existe, 404', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  const { encomenda, chave } = await registar(worker, env, { cliente: clienteValido({ nif: '123456789' }) });
  const r = await pedir(worker, env, 'GET', `/painel/encomendas/${encomenda}`, { cabecalhos: bearer() });
  assert.equal(r.status, 200);
  assert.equal(r.json.chave, chave);
  assert.equal(r.json.cliente.email, 'maria@exemplo.pt');
  assert.equal(r.json.cliente.nif, '123456789');
  assert.equal(r.json.linhas[0].texto, 'Clara');
  assert.equal((await pedir(worker, env, 'GET', '/painel/encomendas/FK-20261109-ZZZZZZ', { cabecalhos: bearer() })).status, 404);
  assert.equal((await pedir(worker, env, 'GET', '/painel/encomendas/lixo', { cabecalhos: bearer() })).status, 404);
  assert.equal((await pedir(worker, env, 'GET', '/painel/outra', { cabecalhos: bearer() })).status, 404);
  assert.equal((await pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}`, { cabecalhos: bearer(), corpo: {} })).status, 405);
  assert.equal((await pedir(worker, env, 'GET', `/painel/encomendas/${encomenda}/estado`, { cabecalhos: bearer() })).status, 405);
});

const muda = (env, id, estado, extra = {}) => pedir(worker, env, 'POST', `/painel/encomendas/${id}/estado`, { cabecalhos: bearer(), corpo: { estado, por: 'dona@exemplo.pt', ...extra } });

test('entrega em mão: «registada» não passa a «pronta»; registada → paga → pronta → levantada, com o histórico e os emails', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso({ RESEND_API_KEY: 're_x', STORE_EMAIL: 'loja@exemplo.pt' });
  const { encomenda } = await registar(worker, env);
  rede.chamadas.length = 0;
  const cedo = await muda(env, encomenda, 'pronta');
  assert.equal(cedo.status, 409);
  assert.deepEqual(cedo.json, { erro: 'De «registada» só se passa a «paga», «anulada».' });
  assert.equal(rede.resend().length, 0, 'uma transição recusada não avisa ninguém');

  const paga = await muda(env, encomenda, 'paga', { nota: 'MB WAY recebido' });
  assert.equal(paga.status, 200, paga.texto);
  assert.equal(paga.json.estado, 'paga');
  assert.equal(paga.json.historico.length, 2);
  assert.deepEqual({ ...paga.json.historico[1], em: 'x' }, { em: 'x', estado: 'paga', por: 'dona@exemplo.pt', nota: 'MB WAY recebido' });
  assert.equal(paga.json.actualizada_em, paga.json.historico[1].em);
  let emails = rede.resend();
  assert.equal(emails.length, 1, 'marcada pela dona, só o cliente é avisado');
  assert.equal(emails[0].subject, `Pagamento recebido — encomenda ${encomenda}`);
  assert.match(emails[0].text, /Recebemos o teu pagamento\. Quando estiver pronta, combinamos contigo a entrega\./);
  assert.doesNotMatch(emails[0].text, /pré-visualização/, 'em modo «encomenda», a pré-visualização combina-se antes');
  assert.deepEqual({ ...paga.json.avisos.paga, em: 'x' }, { em: 'x', cliente: 'enviado', loja: 'não se aplica' });

  rede.chamadas.length = 0;
  const pronta = await muda(env, encomenda, 'pronta');
  assert.equal(pronta.status, 200, pronta.texto);
  emails = rede.resend();
  assert.equal(emails.length, 1);
  assert.equal(emails[0].subject, `A tua encomenda ${encomenda} está pronta`);
  assert.match(emails[0].text, /Vamos combinar contigo o dia da entrega em mão\./);
  assert.equal(JSON.parse(await env.ORDERS.get(`order:${encomenda}`)).estado, 'pronta');
  assert.equal(env.ORDERS.dados.get(`order:${encomenda}`).metadata.estado, 'pronta', 'os metadados acompanham');

  rede.chamadas.length = 0;
  const levantada = await muda(env, encomenda, 'levantada');
  assert.equal(levantada.status, 200);
  assert.equal(rede.resend().length, 0, '«levantada» não manda email');
  assert.equal('levantada' in (levantada.json.avisos || {}), false);
  assert.deepEqual(levantada.json.historico.map((h) => h.estado), ['registada', 'paga', 'pronta', 'levantada']);
  const depois = await muda(env, encomenda, 'anulada');
  assert.equal(depois.status, 409);
  assert.deepEqual(depois.json, { erro: 'Uma encomenda «levantada» não muda mais de estado.' });
});

test('as transições proibidas dão 409 com a razão (a «pronta» de uma encomenda por CTT, a «enviada» de uma em mão…); «avisar: false» não manda email', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso({ RESEND_API_KEY: 're_x' });
  const mao = await registar(worker, env);
  const ctt = await registar(worker, env, porCorreio());
  rede.chamadas.length = 0;
  assert.equal((await muda(env, ctt.encomenda, 'paga', { avisar: false })).status, 200);
  assert.equal((await muda(env, mao.encomenda, 'paga', { avisar: false })).status, 200);
  const casos = [
    [ctt.encomenda, 'pronta', 'Só uma encomenda com entrega em mão fica «pronta»; uma que segue pelos CTT marca-se «enviada».'],
    [ctt.encomenda, 'levantada', 'Só uma encomenda com entrega em mão se marca «levantada».'],
    [mao.encomenda, 'enviada', 'Uma encomenda com entrega em mão não se marca «enviada»: marque-a «pronta» e, depois, «levantada».'],
    [mao.encomenda, 'paga', 'A encomenda já está «paga».'],
    [mao.encomenda, 'registada', 'De «paga» só se passa a «pronta», «levantada», «anulada».'],
    [ctt.encomenda, 'registada', 'De «paga» só se passa a «enviada», «anulada».'],
    [mao.encomenda, 'reembolsada', 'De «paga» só se passa a «pronta», «levantada», «anulada».'],
    [mao.encomenda, 'pendente', 'De «paga» só se passa a «pronta», «levantada», «anulada».'],
    [mao.encomenda, 'inventado', 'Esse estado não existe.'],
    [mao.encomenda, 'constructor', 'Esse estado não existe.'],
  ];
  for (const [id, estado, erro] of casos) {
    const r = await muda(env, id, estado);
    assert.equal(r.status, 409, `${estado}: ${r.texto}`);
    assert.deepEqual(r.json, { erro }, estado);
  }
  assert.equal((await pedir(worker, env, 'POST', `/painel/encomendas/${mao.encomenda}/estado`, { cabecalhos: bearer(), corpo: 'lixo' })).status, 400);
  assert.equal((await muda(env, 'FK-20261109-ZZZZZZ', 'paga')).status, 404);
  assert.equal(rede.resend().length, 0, '«avisar: false» e as recusas não mandam nada');
  assert.equal('avisos' in JSON.parse(await env.ORDERS.get(`order:${ctt.encomenda}`)), false);

  rede.chamadas.length = 0;
  let r = await muda(env, ctt.encomenda, 'enviada', { nota: 'CTT RR123456789PT' });
  assert.equal(r.status, 200);
  let emails = rede.resend();
  assert.equal(emails.length, 1);
  assert.equal(emails[0].subject, `A tua encomenda ${ctt.encomenda} seguiu`);
  assert.match(emails[0].text, /seguiu pelo correio para Rua das Flores, 10, 2\.º Esq\., 4440-503 Valongo\.\n\nCTT RR123456789PT/);
  assert.match(emails[0].html, /CTT RR123456789PT/);
  r = await muda(env, ctt.encomenda, 'anulada', { nota: 'Devolvemos o dinheiro por MB WAY.' });
  assert.equal(r.status, 200);
  emails = rede.resend();
  assert.equal(emails.at(-1).subject, `A tua encomenda ${ctt.encomenda} foi anulada`);
  assert.match(emails.at(-1).text, /A tua encomenda foi anulada\.\n\nDevolvemos o dinheiro por MB WAY\./);
  assert.doesNotMatch(emails.at(-1).text, /14 dias|desistência/, 'anulada não fala da livre resolução');
  assert.deepEqual(r.json.historico.map((h) => h.estado), ['registada', 'paga', 'enviada', 'anulada']);
});

test('a tabela das transições do painel é a do contrato (§4), e está fechada sobre os estados', () => {
  assert.deepEqual(ESTADOS, ['registada', 'pendente', 'paga', 'pronta', 'enviada', 'levantada', 'anulada', 'reembolsada', 'falhou', 'expirou']);
  assert.deepEqual(TRANSICOES_PAINEL, {
    registada: ['paga', 'anulada'],
    pendente: ['paga', 'anulada'],
    paga: ['pronta', 'enviada', 'levantada', 'anulada'],
    pronta: ['levantada', 'anulada'],
    enviada: ['anulada'],
    falhou: ['paga', 'anulada'],
    expirou: ['paga', 'anulada'],
    levantada: [],
    anulada: [],
    reembolsada: [],
  });
  for (const [de, para] of Object.entries(TRANSICOES_PAINEL)) {
    assert.ok(ESTADOS.includes(de), de);
    for (const e of para) assert.ok(ESTADOS.includes(e), e);
    assert.equal(para.includes(de), false, 'nunca para o mesmo');
  }
  // Cada par (estado, entrega) × destino: só passa o que a tabela deixa E a entrega permite.
  const SO_MAO = ['pronta', 'levantada'];
  for (const de of ESTADOS) {
    for (const entrega of ['mao', 'continente', 'ilhas', 'estrangeiro']) {
      for (const para of ESTADOS) {
        const pode = TRANSICOES_PAINEL[de].includes(para) && (entrega === 'mao' ? para !== 'enviada' : !SO_MAO.includes(para));
        assert.equal(razaoParaNao({ estado: de, entrega }, para) === null, pode, `${de} → ${para} (${entrega})`);
      }
    }
  }
  assert.notEqual(razaoParaNao({ estado: 'registada', entrega: 'mao' }, 'pronta'), null, 'a Franja Kids só produz depois do pagamento');
});

test('as notas do painel acrescentam-se e ficam na ficha', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  const { encomenda } = await registar(worker, env);
  const r = await pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}/nota`, { cabecalhos: bearer(), corpo: { texto: 'Pré-visualização enviada por mensagem.\nAprovou.', por: 'dona@exemplo.pt' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.notas_painel.length, 1);
  assert.equal(r.json.notas_painel[0].texto, 'Pré-visualização enviada por mensagem.\nAprovou.');
  assert.equal(r.json.notas_painel[0].por, 'dona@exemplo.pt');
  assert.equal(r.json.estado, 'registada', 'uma nota não muda o estado');
  await pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}/nota`, { cabecalhos: bearer(), corpo: { texto: 'Segunda nota' } });
  const ficha = await pedir(worker, env, 'GET', `/painel/encomendas/${encomenda}`, { cabecalhos: bearer() });
  assert.equal(ficha.json.notas_painel.length, 2);
  assert.equal(ficha.json.notas_painel[1].por, 'painel');
  const vazia = await pedir(worker, env, 'POST', `/painel/encomendas/${encomenda}/nota`, { cabecalhos: bearer(), corpo: { texto: '   ' } });
  assert.equal(vazia.status, 400);
  assert.equal(vazia.json.campo, 'texto');
});
