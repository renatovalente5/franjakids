/* O POST /checkout conduzido de ponta a ponta: a forma no KV, as respostas, os emails, o CORS, o
   travão, os dois modos. Sem rede: o catálogo, a Stripe e o Resend são de faz-de-conta. */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { RE_ID, RE_CHAVE } from '../encomenda.js';
import { catalogoDeEnsaio, envFalso, redeFalsa, pedir, pedidoValido, pedidoPorCorreio, clienteValido, moradaValida, semAcentos, FRASE_PROIBIDA, ORIGEM } from './ajuda.mjs';

let rede;
afterEach(() => { if (rede) rede.repor(); rede = null; });
const lerKV = async (env, id) => JSON.parse(await env.ORDERS.get(`order:${id}`));

test('modo «encomenda»: regista, devolve o número e a chave, e grava a encomenda com a forma do contrato (§4)', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  const corpo = pedidoValido({ cliente: clienteValido({ nif: '123456789' }), oferta: true, mensagem: 'Parabéns, Clara!', notas: 'Preciso para dia 20' });
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(Object.keys(r.json).sort(), ['chave', 'encomenda', 'estado', 'total_cents']);
  assert.match(r.json.encomenda, RE_ID);
  assert.match(r.json.encomenda, /^FK-\d{8}-[2-9A-HJ-NP-Z]{6}$/);
  assert.match(r.json.chave, RE_CHAVE);
  assert.equal(r.json.estado, 'registada');
  assert.equal(r.json.total_cents, 1990);

  const enc = await lerKV(env, r.json.encomenda);
  const em = enc.criada_em;
  assert.match(em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(enc, {
    v: 1,
    encomenda: r.json.encomenda,
    chave: r.json.chave,
    modo: 'encomenda',
    estado: 'registada',
    entrega: 'mao',
    linhas: [{
      produto: 'babygrow-com-nome', nome: 'Babygrow', qtd: 1,
      tamanho: '1 mês', cor: 'Rosa', opcoes: {}, personalizar: true, texto: 'Clara',
      escolhas: ['Tamanho: 1 mês', 'Cor: Rosa', 'Nome a bordar: Clara'], personalizada: true,
      unidade_cents: 1990, total_cents: 1990,
    }],
    artigos_cents: 1990, portes_cents: 0, portes_por_confirmar: false, total_cents: 1990,
    cliente: { nome: 'Maria Fernanda Silva', email: 'maria@exemplo.pt', telefone: '912 345 678', nif: '123456789' },
    oferta: { sim: true, mensagem: 'Parabéns, Clara!' },
    notas: 'Preciso para dia 20',
    termos: { aceites_em: em, pagina: 'https://renatovalente5.github.io/franjakids/termos/' },
    historico: [{ em, estado: 'registada', por: 'site' }],
    criada_em: em,
    actualizada_em: em,
    versao: 1,   // a 1.ª escrita no objecto da encomenda (objecto.js): cada escrita confere-a e sobe-a
  });
  // O dia do id é o de Lisboa (o mesmo que o painel usa para filtrar).
  assert.equal(r.json.encomenda.slice(3, 11), new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(em)).replace(/-/g, ''));
  // Os metadados da chave, de que a lista do painel vive.
  const m = env.ORDERS.dados.get(`order:${r.json.encomenda}`).metadata;
  assert.deepEqual(m, { estado: 'registada', modo: 'encomenda', entrega: 'mao', total_cents: 1990, criada_em: em, actualizada_em: em, nome: 'Maria Fernanda Silva', telefone: '912 345 678', email: 'maria@exemplo.pt', linhas: [['Babygrow', 1]] });
  assert.equal(env.ORDERS.escritas, 1, 'uma escrita só');
  assert.equal(rede.resend().length, 0, 'sem RESEND_API_KEY não se manda nada');
});

test('sem notas nem oferta, os opcionais ficam ausentes (não vazios)', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido({ notas: '   ', cliente: clienteValido({ nif: '' }) }) });
  assert.equal(r.status, 200, r.texto);
  const enc = await lerKV(env, r.json.encomenda);
  assert.equal('notas' in enc, false);
  assert.equal('nif' in enc.cliente, false);
  assert.deepEqual(enc.oferta, { sim: false });
  assert.equal('stripe' in enc, false, 'sem Stripe em modo encomenda');
  assert.equal('avisos' in enc, false, 'sem falhas de email não há nada a registar');
});

test('por CTT: a morada fica, os portes somam-se, e os emails saem ao cliente e à loja (o NIF só na da loja)', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso({ RESEND_API_KEY: 're_teste', STORE_EMAIL: 'loja@exemplo.pt' });
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoPorCorreio({ cliente: clienteValido({ ...moradaValida(), nif: '123456789' }), notas: 'Tocar à campainha.' }) });
  assert.equal(r.status, 200, r.texto);
  const enc = await lerKV(env, r.json.encomenda);
  assert.equal(enc.entrega, 'continente');
  assert.deepEqual(enc.cliente, { nome: 'Maria Fernanda Silva', email: 'maria@exemplo.pt', telefone: '912 345 678', nif: '123456789', ...moradaValida() });
  assert.equal(enc.portes_cents, 390);
  assert.equal(enc.total_cents, 2380);
  const emails = rede.resend();
  assert.equal(emails.length, 2, 'um ao cliente, um à loja');
  const cliente = emails.find((e) => e.to[0] === 'maria@exemplo.pt');
  const loja = emails.find((e) => e.to[0] === 'loja@exemplo.pt');
  assert.ok(cliente && loja);
  assert.equal(cliente.subject, `Recebemos a tua encomenda ${r.json.encomenda}`);
  assert.match(cliente.text, /^Olá Maria,/);
  assert.match(cliente.text, /1 × Babygrow — 19,90 €\n {6}Tamanho: 1 mês · Cor: Rosa · Nome a bordar: Clara/);
  assert.match(cliente.text, /Portes: 3,90 €/);
  assert.match(cliente.text, /Total: 23,80 €/);
  assert.match(cliente.text, /Envio para Rua das Flores, 10, 2\.º Esq\., 4440-503 Valongo\./);
  assert.match(cliente.text, /Antes de produzirmos, mandamos-te a pré-visualização para aprovares\./);
  assert.match(cliente.text, /Os artigos personalizados não têm troca nem devolução por desistência/);
  assert.match(cliente.text, /franjakids\/trocas-e-devolucoes\//);
  assert.match(cliente.html, /logotipo-320\.png/);
  assert.match(cliente.html, /<html lang="pt-PT"/);
  assert.equal(cliente.from, 'Franja Kids <onboarding@resend.dev>');
  assert.equal(cliente.reply_to, 'loja@exemplo.pt');
  for (const parte of [cliente.subject, cliente.text, cliente.html]) {
    assert.equal(parte.includes('123456789'), false, 'o NIF nunca vai no email do cliente');
    assert.equal(parte.includes('campainha'), false, 'as notas são para a loja');
  }
  assert.match(loja.subject, /^Nova encomenda FK-\d{8}-[A-Z0-9]{6} — 23,80 €$/);
  assert.match(loja.text, /Telemóvel: 912 345 678/);
  assert.match(loja.text, /NIF: 123456789/);
  assert.match(loja.text, /Nome a bordar: Clara/);
  assert.match(loja.text, /Tocar à campainha\./);
  assert.match(loja.html, /123456789/);
  assert.equal(loja.reply_to, 'maria@exemplo.pt', 'responder à loja é responder ao cliente');
  for (const e of emails) assert.doesNotMatch(semAcentos(`${e.subject}\n${e.text}\n${e.html || ''}`), FRASE_PROIBIDA);
  assert.equal(env.ORDERS.escritas, 1);
});

test('portes por confirmar (zona sem portes) em modo «encomenda»: segue, o total é só os artigos e o email di-lo', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio({ portes: { continente: null } }) });
  const env = envFalso({ RESEND_API_KEY: 're_teste', STORE_EMAIL: 'loja@exemplo.pt' });
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoPorCorreio({ total_cents: 1990 }) });
  assert.equal(r.status, 200, r.texto);
  const enc = await lerKV(env, r.json.encomenda);
  assert.equal(enc.portes_por_confirmar, true);
  assert.equal(enc.portes_cents, 0);
  assert.equal(enc.total_cents, 1990);
  const [cliente, loja] = ['maria@exemplo.pt', 'loja@exemplo.pt'].map((a) => rede.resend().find((e) => e.to[0] === a));
  assert.match(cliente.text, /Portes: a confirmar/);
  assert.match(cliente.text, /Total: 19,90 € \+ portes/);
  assert.match(cliente.text, /Confirmamos os portes contigo antes do pagamento\./);
  assert.equal(loja.subject, `Nova encomenda ${r.json.encomenda} — 19,90 € + portes`);
  assert.match(loja.text, /PORTES POR CONFIRMAR/);
});

test('uma falha do Resend não apaga a encomenda; sem STORE_EMAIL só vai o email ao cliente', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio(), resend: () => new Response('{"message":"em baixo"}', { status: 500 }) });
  const env = envFalso({ RESEND_API_KEY: 're_teste' });
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido() });
  assert.equal(r.status, 200);
  assert.equal(rede.resend().length, 1, 'sem STORE_EMAIL a loja não recebe');
  const enc = await lerKV(env, r.json.encomenda);
  assert.equal(enc.estado, 'registada');
  assert.equal(enc.avisos.registada.cliente, 'falhou');
  assert.equal(enc.avisos.registada.loja, 'sem destinatário');
  assert.equal(env.ORDERS.escritas, 2, 'a encomenda, e depois a falha registada');
});

test('409 com a frase do contrato quando o total do site não bate com as contas do Worker', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  for (const total_cents of [1989, 1690, 2380]) {
    const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido({ total_cents }) });
    assert.equal(r.status, 409);
    assert.deepEqual(r.json, { erro: 'Os preços mudaram. Confirma o total e envia outra vez.' });
  }
  assert.equal(env.ORDERS.escritas, 0, 'um pedido recusado não gasta escritas');
});

test('400 com a frase e o campo, de ponta a ponta; 413 e JSON estragado', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  const casos = [
    [pedidoValido({ cliente: clienteValido({ email: 'maria' }) }), 'Escreve um email como nome@exemplo.pt.', 'email'],
    [pedidoValido({ cliente: clienteValido({ telefone: '123' }) }), 'Escreve o telemóvel com 9 algarismos.', 'telefone'],
    [pedidoValido({ cliente: clienteValido({ nif: '111111111' }) }), 'O NIF não está certo. Confirma-o ou deixa-o em branco.', 'nif'],
    [pedidoValido({ cliente: clienteValido({ nome: ' ' }) }), 'Escreve o teu nome.', 'nome'],
    [pedidoValido({ termos: false }), 'Para encomendar, aceita os termos e condições.', 'termos'],
    [pedidoValido({ linhas: [{ produto: 'ja-nao-existe', qtd: 1 }] }), 'Um produto do carrinho já não se vende no site. Tira-o do carrinho para continuar.', 'produto'],
    [pedidoValido({ linhas: [{ ...pedidoValido().linhas[0], texto: '' }] }), 'Escreve «Nome a bordar» de «Babygrow», ou tira a personalização.', 'texto'],
    [pedidoValido({ linhas: [{ ...pedidoValido().linhas[0], qtd: 21 }] }), 'A quantidade de cada produto vai de 1 a 20.', undefined],
    [pedidoPorCorreio({ cliente: clienteValido({ ...moradaValida(), codigoPostal: '9000-100' }) }), 'Em Portugal continental o código postal começa por 1 a 8. Para os Açores e a Madeira, escolhe essa entrega.', 'codigoPostal'],
    [pedidoValido({ oferta: true, mensagem: 'm'.repeat(241) }), 'A mensagem para o cartão tem mais de 240 caracteres.', 'mensagem'],
    [pedidoValido({ entrega: 'lua' }), 'Escolhe como queres receber a encomenda.', 'entrega'],
  ];
  for (const [corpo, erro, campo] of casos) {
    const r = await pedir(worker, env, 'POST', '/checkout', { corpo });
    assert.equal(r.status, 400, JSON.stringify(r.json));
    assert.deepEqual(r.json, campo ? { erro, campo } : { erro });
  }
  assert.equal((await pedir(worker, env, 'POST', '/checkout', { corpo: '{não é json' })).status, 400);
  assert.equal((await pedir(worker, env, 'POST', '/checkout', { corpo: '[1,2]' })).status, 400);
  const grande = await pedir(worker, env, 'POST', '/checkout', { corpo: { x: 'a'.repeat(70 * 1024) } });
  assert.equal(grande.status, 413);
  assert.equal(env.ORDERS.escritas, 0);
});

test('um carrinho de 50 linhas personalizadas com textos compridos cabe no pedido e nos metadados', async () => {
  // O texto de uma personalização pode ir até 200 caracteres (R.LIMITES.max): com 50 linhas assim,
  // o pedido passa dos 16 KiB que bastavam na LF Mobile.
  const cat = catalogoDeEnsaio();
  cat.produtos['t-shirt-promovido-a-irmao'].personalizacao.max = 200;
  rede = redeFalsa({ catalogo: cat });
  const env = envFalso();
  const texto = 'Para o mano Tomás, que vai ser o melhor irmão mais velho do mundo: a Clara chega em março e já te adora. Com amor, da mãe, do pai, dos avós de Valongo e de toda a família, até à lua e voltar! ❤ ';
  const linha = { produto: 't-shirt-promovido-a-irmao', tamanho: '14 anos', opcoes: { Texto: 'Irmão mais velho' }, personalizar: false, texto: texto.slice(0, 199), qtd: 20 };
  const corpo = pedidoValido({ linhas: Array.from({ length: 50 }, () => linha), total_cents: 50 * 20 * 1200, cliente: clienteValido({ nome: 'Maria da Conceição Gonçalves Antunes Lourenço' }) });
  assert.ok(new TextEncoder().encode(JSON.stringify(corpo)).length > 16 * 1024, 'passa dos 16 KiB da LF Mobile');
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo });
  assert.equal(r.status, 200, r.texto);
  const m = env.ORDERS.dados.get(`order:${r.json.encomenda}`).metadata;
  assert.ok(new TextEncoder().encode(JSON.stringify(m)).length <= 1024);
  assert.equal(m.linhas.length + m.mais, 50);
});

test('o catálogo em baixo, ou noutra versão, dá 503 sem gastar o KV', async () => {
  rede = redeFalsa({ catalogo: null });
  const env = envFalso();
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido() });
  assert.equal(r.status, 503);
  assert.deepEqual(r.json, { erro: 'Não conseguimos confirmar os preços agora. Tenta daqui a um minuto.' });
  rede.repor();
  rede = redeFalsa({ catalogo: { ...catalogoDeEnsaio(), v: 3 } });
  assert.equal((await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido() })).status, 503, 'uma forma que o Worker não conhece não se usa');
  rede.repor();
  rede = redeFalsa({ catalogo: { ...catalogoDeEnsaio(), zonas: [] } });
  assert.equal((await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido() })).status, 503);
  assert.equal(env.ORDERS.escritas, 0);
});

test('modo «online» sem chave da Stripe: 503 com a frase do contrato', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio({ modo: 'online' }) });
  const r = await pedir(worker, envFalso(), 'POST', '/checkout', { corpo: pedidoValido() });
  assert.equal(r.status, 503);
  assert.deepEqual(r.json, { erro: 'O pagamento no site ainda não está ligado. Encomenda por mensagem no Instagram.' });
});

test('modo «online»: abre a página da Stripe (hosted, em português) só com o nome e a quantidade de cada produto, e grava «pendente»', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio({ modo: 'online' }) });
  const env = envFalso({ STRIPE_SECRET_KEY: 'sk_test_x' });
  const corpo = pedidoPorCorreio({ cliente: clienteValido({ ...moradaValida(), nif: '123456789' }), oferta: true, mensagem: 'Para a Clara', notas: 'Ligar antes' });
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(Object.keys(r.json).sort(), ['chave', 'encomenda', 'total_cents', 'url']);
  assert.equal(r.json.url, 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6');
  assert.match(r.json.encomenda, RE_ID);
  assert.equal(r.json.total_cents, 2380);
  const [chamada] = rede.stripe();
  assert.equal(chamada.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(chamada.init.headers.Authorization, 'Bearer sk_test_x');
  assert.equal(chamada.init.headers['Stripe-Version'], '2026-07-29.dahlia');
  assert.equal(chamada.init.headers['Idempotency-Key'], `chk_${r.json.encomenda}`);
  const params = new URLSearchParams(chamada.corpo);
  assert.equal(params.get('ui_mode'), 'hosted_page');
  assert.equal(params.get('locale'), 'pt');
  assert.equal(params.get('mode'), 'payment');
  assert.equal(params.get('client_reference_id'), r.json.encomenda);
  assert.equal(params.get('customer_email'), 'maria@exemplo.pt');
  // o número e a chave nos dois: a «obrigado» lê a encomenda pelo objecto dela, e o «Voltar» fecha-a (desistir)
  assert.equal(params.get('success_url'), `https://renatovalente5.github.io/franjakids/obrigado/?e=${r.json.encomenda}&c=${r.json.chave}&s={CHECKOUT_SESSION_ID}`);
  assert.equal(params.get('cancel_url'), `https://renatovalente5.github.io/franjakids/finalizar/?cancelado=${r.json.encomenda}&c=${r.json.chave}`);
  assert.equal(params.has('payment_method_types[]'), false, 'os meios são os que estiverem ligados na conta');
  assert.equal(params.get('line_items[0][quantity]'), '1');
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '1990');
  assert.equal(params.get('line_items[0][price_data][currency]'), 'eur');
  assert.equal(params.get('line_items[0][price_data][product_data][name]'), 'Babygrow', 'só o nome: nem as escolhas nem o texto da personalização');
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '390', 'os portes são uma linha');
  assert.equal(params.get('line_items[1][price_data][product_data][name]'), 'Portes de envio');
  assert.equal(params.get('metadata[encomenda]'), r.json.encomenda);
  assert.equal(params.get('payment_intent_data[metadata][encomenda]'), r.json.encomenda);
  const enviado = decodeURIComponent(chamada.corpo.replace(/\+/g, ' '));
  for (const fica of ['Clara', '123456789', '912 345 678', 'Rua das Flores', 'Valongo', 'Ligar antes', 'Tamanho', 'Rosa']) {
    assert.equal(enviado.includes(fica), false, `«${fica}» não vai para a Stripe`);
  }
  const enc = await lerKV(env, r.json.encomenda);
  assert.equal(enc.modo, 'online');
  assert.equal(enc.estado, 'pendente');
  assert.equal(enc.historico[0].estado, 'pendente');
  assert.deepEqual(enc.stripe, { session_id: 'cs_test_a1b2c3d4e5f6' });
  assert.equal(await env.ORDERS.get('session:cs_test_a1b2c3d4e5f6'), r.json.encomenda);
  assert.equal(env.ORDERS.escritas, 2);
  assert.equal(rede.resend().length, 0, 'em modo online os emails vêm com o pagamento');
});

test('modo «online»: sem portes não há linha de portes; a Stripe a recusar dá 502 sem gastar o KV; zona sem portes dá 400', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio({ modo: 'online' }) });
  let env = envFalso({ STRIPE_SECRET_KEY: 'sk_test_x' });
  assert.equal((await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido() })).status, 200);
  assert.equal(new URLSearchParams(rede.stripe()[0].corpo).has('line_items[1][quantity]'), false, 'em mão, sem linha de portes');
  rede.repor();
  rede = redeFalsa({ catalogo: catalogoDeEnsaio({ modo: 'online', portes: { continente: null } }), stripe: () => new Response('{"error":{"message":"Invalid API Key"}}', { status: 401 }) });
  env = envFalso({ STRIPE_SECRET_KEY: 'sk_test_x' });
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido() });
  assert.equal(r.status, 502);
  assert.deepEqual(r.json, { erro: 'Não foi possível abrir o pagamento. Tenta outra vez ou manda-nos mensagem no Instagram.' });
  assert.equal(env.ORDERS.escritas, 0);
  const semPortes = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoPorCorreio({ total_cents: 1990 }) });
  assert.equal(semPortes.status, 400);
  assert.deepEqual(semPortes.json, { erro: 'Para esta entrega confirmamos os portes antes do pagamento: manda-nos mensagem no Instagram.', campo: 'entrega' });
  assert.equal(rede.stripe().length, 1, 'recusado antes de chamar a Stripe');
});

test('MODO=encomenda força o modo «encomenda» mesmo com o catálogo em «online»', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio({ modo: 'online' }) });
  const r = await pedir(worker, envFalso({ MODO: 'encomenda' }), 'POST', '/checkout', { corpo: pedidoValido() });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.estado, 'registada');
  assert.equal(rede.stripe().length, 0);
});

test('CORS: a pré-visualização e o build local passam, uma origem estranha leva 403, o OPTIONS responde às duas rotas', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  const env = envFalso();
  const boa = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido(), cabecalhos: { Origin: ORIGEM } });
  assert.equal(boa.status, 200);
  assert.equal(boa.headers.get('Access-Control-Allow-Origin'), ORIGEM);
  assert.equal(boa.headers.get('Vary'), 'Origin');
  for (const local of ['http://127.0.0.1:8985', 'http://localhost:8985']) {
    const r = await pedir(worker, env, 'OPTIONS', '/checkout', { cabecalhos: { Origin: local, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), local);
    assert.match(r.headers.get('Access-Control-Allow-Methods'), /POST/);
    assert.match(r.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
  }
  assert.equal((await pedir(worker, env, 'OPTIONS', '/encomenda', { cabecalhos: { Origin: ORIGEM } })).status, 204);
  assert.equal((await pedir(worker, env, 'OPTIONS', '/outra', { cabecalhos: { Origin: ORIGEM } })).status, 404);
  for (const ma of ['https://malandro.example', 'http://127.0.0.1:9999', 'https://renatovalente5.github.io.malandro.example']) {
    const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido(), cabecalhos: { Origin: ma } });
    assert.equal(r.status, 403, ma);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  }
  const semOrigem = await pedir(worker, env, 'GET', '/');
  assert.equal(semOrigem.status, 200);
  assert.deepEqual(semOrigem.json, { ok: true, servico: 'franjakids-encomendas' });
  assert.equal(semOrigem.headers.get('Access-Control-Allow-Origin'), null, 'sem Origin não há cabeçalhos CORS');
  assert.equal((await pedir(worker, env, 'GET', '/checkout')).status, 405);
  assert.equal((await pedir(worker, env, 'POST', '/encomenda', { corpo: {} })).status, 405);
  assert.equal((await pedir(worker, env, 'GET', '/nada')).status, 404);
  assert.equal(env.ORDERS.escritas, 1, 'só a encomenda da origem boa');
});

test('o travão da Cloudflare: 429 quando o binding diz que chega, contado por IP', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  let n = 0;
  const env = envFalso({ TRAVAO_CHECKOUT: { limit: async ({ key }) => { assert.equal(key, 'checkout:1.2.3.4'); n += 1; return { success: n <= 2 }; } } });
  const cab = { 'CF-Connecting-IP': '1.2.3.4' };
  assert.equal((await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido(), cabecalhos: cab })).status, 200);
  assert.equal((await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido(), cabecalhos: cab })).status, 200);
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido(), cabecalhos: cab });
  assert.equal(r.status, 429);
  assert.deepEqual(r.json, { erro: 'Demasiadas tentativas. Espera um minuto e tenta outra vez.' });
  assert.equal(env.ORDERS.escritas, 2);
});

test('o travão de memória vale quando o binding falta ou falha: 10 por minuto por IP', async () => {
  rede = redeFalsa({ catalogo: catalogoDeEnsaio() });
  for (const [ip, travao] of [['9.9.9.9', undefined], ['8.8.8.8', { limit: async () => { throw new Error('em baixo'); } }]]) {
    const env = envFalso({ TRAVAO_CHECKOUT: travao });
    const estados = [];
    for (let i = 0; i < 11; i++) estados.push((await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido(), cabecalhos: { 'CF-Connecting-IP': ip } })).status);
    assert.deepEqual(estados, [...Array(10).fill(200), 429], ip);
  }
});
