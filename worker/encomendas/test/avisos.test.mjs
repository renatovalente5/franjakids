/* O AVISO DE STOCK (avisos.js, 20 nov 2026): o POST /aviso do site (só o que existe e está esgotado), a contagem do
   painel (sem os emails), o «Avisar quem pediu» (só o que já se compra; uma vez; o que falha fica) e os travões. */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { pedirAvisos, disponivel, existe, varianteDe, MAX_POR_EMAIL, MAX_POR_PRODUTO, MAX_POR_ENVIO, DURACAO_DIAS } from '../avisos.js';
import { emailDeStock } from '../email.js';
import { catalogoDeEnsaio, envFalso, redeFalsa, pedir, bearer, semAcentos, FRASE_PROIBIDA } from './ajuda.mjs';

let rede;
afterEach(() => { if (rede) rede.repor(); rede = null; });

/* Um catálogo com a manta esgotada, e o babygrow com o tamanho «1 mês» e a cor «Rosa» esgotados. */
const esgotado = () => {
  const cat = catalogoDeEnsaio();
  cat.produtos['manta-remalhada'].esgotado = true;
  cat.produtos['babygrow-com-nome'].tamanhosEsgotados = ['1 mês'];
  cat.produtos['babygrow-com-nome'].cores[0].esgotado = true;
  return cat;
};
const avisar = (env, corpo) => pedir(worker, env, 'POST', '/aviso', { corpo });
const contagem = async (env) => (await pedir(worker, env, 'GET', '/painel/avisos', { cabecalhos: bearer() })).json;
const enviarDe = (env, produto) => pedir(worker, env, 'POST', `/painel/avisos/${produto}/enviar`, { cabecalhos: bearer() });

test('as escolhas: só o grupo e o valor, e só as que existem; «disponível» é comprar-se agora', () => {
  assert.equal(varianteDe(null), null);
  assert.deepEqual(varianteDe({ grupo: ' Tamanho ', valor: '1 mês', mais: 1 }), { grupo: 'Tamanho', valor: '1 mês' });
  assert.equal(varianteDe({ grupo: 'Tamanho' }), undefined);
  assert.equal(varianteDe('Tamanho'), undefined);
  const cat = esgotado();
  const bg = cat.produtos['babygrow-com-nome'];
  assert.equal(existe(bg, { grupo: 'Tamanho', valor: '1 mês' }), true);
  assert.equal(existe(bg, { grupo: 'Tamanho', valor: '9 anos' }), false);
  assert.equal(existe(bg, { grupo: 'Embrulho', valor: 'Caixa' }), false);
  assert.equal(disponivel(bg, { grupo: 'Tamanho', valor: '1 mês' }), false);
  assert.equal(disponivel(bg, { grupo: 'Tamanho', valor: '3 meses' }), true);
  assert.equal(disponivel(bg, { grupo: 'Cor', valor: 'Rosa' }), false);
  assert.equal(disponivel(bg, null), true);
  assert.equal(disponivel(cat.produtos['manta-remalhada'], null), false);
  assert.equal(disponivel(cat.produtos['manta-remalhada'], { grupo: 'Cor', valor: 'Areia' }), false, 'com o produto esgotado, nenhuma escolha se compra');
  const ens = cat.produtos['conjunto-de-ensaio'];
  ens.opcoes[1].valores[0].esgotado = true;
  assert.equal(disponivel(ens, { grupo: 'Embrulho', valor: 'Caixa' }), false);
  assert.equal(disponivel(ens, { grupo: 'Embrulho', valor: 'Saco' }), true);
});

test('POST /aviso: guarda o que está esgotado; recusa o email mau, o que não existe e o que já se compra', async () => {
  rede = redeFalsa({ catalogo: esgotado() });
  const env = envFalso();
  let r = await avisar(env, { produto: 'manta-remalhada', variante: null, email: ' Ana@Exemplo.pt ' });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json, { ok: true });
  r = await avisar(env, { produto: 'babygrow-com-nome', variante: { grupo: 'Tamanho', valor: '1 mês' }, email: 'ana@exemplo.pt' });
  assert.equal(r.status, 200, r.texto);
  // pedir outra vez a mesma coisa não junta nada
  assert.equal((await avisar(env, { produto: 'manta-remalhada', variante: null, email: 'ana@exemplo.pt' })).status, 200);
  assert.deepEqual(await contagem(env), { avisos: { 'manta-remalhada': [{ grupo: null, valor: null, n: 1 }], 'babygrow-com-nome': [{ grupo: 'Tamanho', valor: '1 mês', n: 1 }] } });
  assert.deepEqual((await avisar(env, { produto: 'manta-remalhada', email: 'ana@exemplo' })).json, { erro: 'Escreve um email como nome@exemplo.pt.', campo: 'email' });
  assert.equal((await avisar(env, { produto: 'nao-existe', email: 'ana@exemplo.pt' })).status, 404);
  assert.equal((await avisar(env, { produto: 'constructor', email: 'ana@exemplo.pt' })).status, 404, 'só os produtos do catálogo (não o protótipo)');
  assert.equal((await avisar(env, { produto: 'babygrow-com-nome', variante: { grupo: 'Tamanho', valor: '9 anos' }, email: 'ana@exemplo.pt' })).status, 400);
  assert.equal((await avisar(env, { produto: 'babygrow-com-nome', variante: 'Tamanho', email: 'ana@exemplo.pt' })).status, 400);
  const ja = await avisar(env, { produto: 'babygrow-com-nome', variante: { grupo: 'Tamanho', valor: '3 meses' }, email: 'ana@exemplo.pt' });
  assert.equal(ja.status, 409);
  assert.match(ja.json.erro, /Já há outra vez/);
  assert.equal((await avisar(env, { produto: 'caixa-surpresa', variante: null, email: 'ana@exemplo.pt' })).status, 409, 'o que não está esgotado compra-se');
  // o painel não vê os emails, e sem o segredo nem a contagem
  assert.doesNotMatch(JSON.stringify(await contagem(env)), /exemplo/);
  assert.equal((await pedir(worker, env, 'GET', '/painel/avisos')).status, 401);
});

test('POST /aviso: CORS só das origens do site; o travão por IP; no máximo MAX_POR_EMAIL à espera por email', async () => {
  rede = redeFalsa({ catalogo: esgotado() });
  const env = envFalso();
  const pre = await pedir(worker, env, 'OPTIONS', '/aviso', { cabecalhos: { Origin: 'https://renatovalente5.github.io' } });
  assert.equal(pre.status, 204);
  assert.equal((await pedir(worker, env, 'POST', '/aviso', { corpo: {}, cabecalhos: { Origin: 'https://outro.exemplo' } })).status, 403);
  const travado = envFalso({ TRAVAO_CHECKOUT: { limit: async ({ key }) => ({ success: !key.startsWith('aviso:') }) } });
  assert.equal((await avisar(travado, { produto: 'manta-remalhada', email: 'ana@exemplo.pt' })).status, 429);
  // muitos pedidos do mesmo email: as escolhas esgotadas de um produto de ensaio, uma a uma
  const cat = esgotado();
  cat.produtos['t-shirt-promovido-a-irmao'].tamanhosEsgotados = [...cat.produtos['t-shirt-promovido-a-irmao'].tamanhos];
  cat.produtos['t-shirt-promovido-a-irmao'].esgotado = true;
  rede.repor();
  rede = redeFalsa({ catalogo: cat });
  const pedidos = [null, ...cat.produtos['t-shirt-promovido-a-irmao'].tamanhos.map((valor) => ({ grupo: 'Tamanho', valor }))];
  const estados = [];
  for (const variante of [...pedidos, { grupo: 'Texto', valor: 'Irmão mais velho' }, { grupo: 'Texto', valor: 'Irmã mais velha' }]) {
    estados.push((await avisar(env, { produto: 't-shirt-promovido-a-irmao', variante, email: 'muitos@exemplo.pt' })).status);
  }
  assert.deepEqual(estados, Array(MAX_POR_EMAIL).fill(200));
  // o seguinte, de outro produto, já não cabe; de outro email, sim
  const cheio = await avisar(env, { produto: 'manta-remalhada', email: 'muitos@exemplo.pt' });
  assert.equal(cheio.status, 429);
  assert.match(cheio.json.erro, /muitos avisos à espera/);
  assert.equal((await avisar(env, { produto: 'manta-remalhada', email: 'outra@exemplo.pt' })).status, 200);
});

test('«Avisar quem pediu»: só o que já se compra recebe o email (uma vez); o que continua esgotado fica', async () => {
  rede = redeFalsa({ catalogo: esgotado() });
  const env = envFalso({ RESEND_API_KEY: 're_teste', STORE_EMAIL: 'loja@exemplo.pt' });
  for (const [email, valor] of [['ana@exemplo.pt', '1 mês'], ['rita@exemplo.pt', '1 mês']]) assert.equal((await avisar(env, { produto: 'babygrow-com-nome', variante: { grupo: 'Tamanho', valor }, email })).status, 200);
  assert.equal((await avisar(env, { produto: 'babygrow-com-nome', variante: { grupo: 'Cor', valor: 'Rosa' }, email: 'eva@exemplo.pt' })).status, 200);
  // ainda esgotado: ninguém é avisado
  assert.deepEqual((await enviarDe(env, 'babygrow-com-nome')).json, { enviados: 0, falharam: 0, esperam: 3, faltam: 0 });
  assert.equal(rede.resend().length, 0);
  // o tamanho voltou (a cor não): avisam-se as duas do tamanho, e a da cor fica à espera
  const voltou = esgotado();
  voltou.produtos['babygrow-com-nome'].tamanhosEsgotados = [];
  rede.repor();
  rede = redeFalsa({ catalogo: voltou });
  const r = await enviarDe(env, 'babygrow-com-nome');
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json, { enviados: 2, falharam: 0, esperam: 1, faltam: 0 });
  const emails = rede.resend();
  assert.deepEqual(emails.map((e) => e.to[0]).sort(), ['ana@exemplo.pt', 'rita@exemplo.pt']);
  for (const e of emails) {
    assert.equal(e.subject, 'Voltou: Babygrow');
    assert.match(e.text, /Pediste-nos um aviso: «Babygrow» \(tamanho 1 mês\) já está outra vez à venda\./);
    assert.match(e.text, /Ver no site: https:\/\/renatovalente5\.github\.io\/franjakids\/produtos\/babygrow-com-nome\//);
    assert.equal(e.reply_to, 'loja@exemplo.pt');
    assert.doesNotMatch(semAcentos(`${e.subject}\n${e.text}\n${e.html}`), FRASE_PROIBIDA);
  }
  // outra vez: os avisados já saíram, não se repete nada
  assert.deepEqual((await enviarDe(env, 'babygrow-com-nome')).json, { enviados: 0, falharam: 0, esperam: 1, faltam: 0 });
  assert.equal(rede.resend().length, 2);
  assert.deepEqual(await contagem(env), { avisos: { 'babygrow-com-nome': [{ grupo: 'Cor', valor: 'Rosa', n: 1 }] } });
});

test('«Avisar quem pediu»: um email que falha fica para a próxima vez; um produto que saiu do site não avisa ninguém', async () => {
  const cat = esgotado();
  rede = redeFalsa({ catalogo: cat });
  const env = envFalso({ RESEND_API_KEY: 're_teste' });
  assert.equal((await avisar(env, { produto: 'manta-remalhada', email: 'ana@exemplo.pt' })).status, 200);
  const voltou = esgotado();
  voltou.produtos['manta-remalhada'].esgotado = false;
  rede.repor();
  rede = redeFalsa({ catalogo: voltou, resend: () => new Response('{"message":"em baixo"}', { status: 500 }) });
  assert.deepEqual((await enviarDe(env, 'manta-remalhada')).json, { enviados: 0, falharam: 1, esperam: 1, faltam: 0 });
  rede.repor();
  rede = redeFalsa({ catalogo: voltou });
  assert.deepEqual((await enviarDe(env, 'manta-remalhada')).json, { enviados: 1, falharam: 0, esperam: 0, faltam: 0 });
  // saiu do site: o pedido fica (pode voltar), ninguém recebe nada
  assert.equal((await avisar(env, { produto: 'manta-remalhada', email: 'eva@exemplo.pt' })).status, 409, 'já se compra');
  const semManta = esgotado();
  rede.repor();
  rede = redeFalsa({ catalogo: semManta });
  assert.equal((await avisar(env, { produto: 'manta-remalhada', email: 'eva@exemplo.pt' })).status, 200);
  delete semManta.produtos['manta-remalhada'];
  rede.repor();
  rede = redeFalsa({ catalogo: semManta });
  assert.deepEqual((await enviarDe(env, 'manta-remalhada')).json, { enviados: 0, falharam: 0, esperam: 1, faltam: 0 });
});

test('os pedidos duram 6 meses: os mais velhos saem sozinhos, com os contadores', async () => {
  rede = redeFalsa({ catalogo: esgotado() });
  const env = envFalso();
  assert.equal((await avisar(env, { produto: 'manta-remalhada', email: 'ana@exemplo.pt' })).status, 200);
  assert.equal(Object.keys((await pedirAvisos(env, { op: 'contar' })).avisos).length, 1);
  const depois = Date.now() + (DURACAO_DIAS + 1) * 24 * 3600 * 1000;
  assert.deepEqual(await pedirAvisos(env, { op: 'contar', agora: depois }), { avisos: {} });
  assert.deepEqual(await pedirAvisos(env, { op: 'pedir', produto: 'manta-remalhada', variante: null, email: 'ana@exemplo.pt', agora: depois }), { ok: true }, 'o pedido antigo saiu: pode pedir outra vez');
});

test('o email do aviso: o nome, a escolha, a ligação e o contacto; nunca a frase do botão da lei', () => {
  const env = { STORE_NAME: 'Franja Kids', STORE_INSTAGRAM: 'franjakids', STORE_EMAIL: 'loja@exemplo.pt', SITE_URL: 'https://franjakids.com' };
  const m = emailDeStock(env, { nome: 'Body «Baby 2027»', url: 'https://franjakids.com/produtos/body-baby-2027/', variante: { grupo: 'Desenho', valor: 'Menina' } });
  assert.equal(m.assunto, 'Voltou: Body «Baby 2027»');
  assert.match(m.texto, /«Body «Baby 2027»» \(Desenho: Menina\) já está outra vez à venda\./);
  assert.match(m.html, /href="https:\/\/franjakids\.com\/produtos\/body-baby-2027\/"/);
  assert.match(m.texto, /Este aviso só se manda uma vez/);
  assert.doesNotMatch(semAcentos(`${m.texto}\n${m.html}`), FRASE_PROIBIDA);
});

test('o email conta como pessoa (ana+1@ é a ana@); o produto e a loja têm limite; a mensagem diz qual', async () => {
  rede = redeFalsa({ catalogo: esgotado() });
  const env = envFalso();
  assert.equal((await avisar(env, { produto: 'manta-remalhada', email: 'ana@gmail.com' })).status, 200);
  // o mesmo pedido com outro «+» ou com pontos no Gmail é o mesmo pedido: não junta nada
  for (const email of ['ana+1@gmail.com', 'a.na+promo@gmail.com', 'ANA@googlemail.com']) assert.equal((await avisar(env, { produto: 'manta-remalhada', email })).status, 200, email);
  assert.deepEqual(await contagem(env), { avisos: { 'manta-remalhada': [{ grupo: null, valor: null, n: 1 }] } });
  // e o limite por email conta-os juntos
  const cat = esgotado();
  cat.produtos['t-shirt-promovido-a-irmao'].esgotado = true;
  rede.repor();
  rede = redeFalsa({ catalogo: cat });
  const pedidos = [null, ...cat.produtos['t-shirt-promovido-a-irmao'].tamanhos.map((valor) => ({ grupo: 'Tamanho', valor })), { grupo: 'Texto', valor: 'Irmão mais velho' }];
  const estados = [];
  for (const [i, variante] of pedidos.entries()) estados.push((await avisar(env, { produto: 't-shirt-promovido-a-irmao', variante, email: `ana+${i}@gmail.com` })).status);
  assert.equal(estados.filter((x) => x === 200).length, MAX_POR_EMAIL - 1, 'a manta já contava um');
  const r = await avisar(env, { produto: 'babygrow-com-nome', variante: { grupo: 'Tamanho', valor: '1 mês' }, email: 'a.n.a@gmail.com' });
  assert.equal(r.status, 429);
  assert.match(r.json.erro, /Este email já tem muitos avisos à espera/);
  // a loja cheia (o limite de um produto) diz outra coisa
  for (let i = 0; i < MAX_POR_PRODUTO; i++) await pedirAvisos(env, { op: 'pedir', produto: 'caixa-surpresa', variante: null, email: `cliente${i}@exemplo.pt` });
  const cs = esgotado();
  cs.produtos['caixa-surpresa'].esgotado = true;
  rede.repor();
  rede = redeFalsa({ catalogo: cs });
  const cheio = await avisar(env, { produto: 'caixa-surpresa', email: 'outra@exemplo.pt' });
  assert.equal(cheio.status, 429);
  assert.match(cheio.json.erro, /Não conseguimos guardar mais avisos agora/);
});

test('cada clique avisa no máximo MAX_POR_ENVIO; os outros ficam para o clique seguinte', async () => {
  const cat = esgotado();
  rede = redeFalsa({ catalogo: cat });
  const env = envFalso({ RESEND_API_KEY: 're_teste' });
  const n = MAX_POR_ENVIO + 7;
  for (let i = 0; i < n; i++) await pedirAvisos(env, { op: 'pedir', produto: 'manta-remalhada', variante: null, email: `cliente${i}@exemplo.pt` });
  const voltou = esgotado();
  voltou.produtos['manta-remalhada'].esgotado = false;
  rede.repor();
  rede = redeFalsa({ catalogo: voltou });
  assert.deepEqual((await enviarDe(env, 'manta-remalhada')).json, { enviados: MAX_POR_ENVIO, falharam: 0, esperam: 7, faltam: 7 });
  assert.deepEqual((await enviarDe(env, 'manta-remalhada')).json, { enviados: 7, falharam: 0, esperam: 0, faltam: 0 });
  const para = rede.resend().map((e) => e.to[0]);
  assert.equal(para.length, n);
  assert.equal(new Set(para).size, n, 'ninguém recebe dois');
});

test('um envio que pára a meio não repete os que já foram (cada pedido sai logo a seguir ao seu email)', async () => {
  const cat = esgotado();
  rede = redeFalsa({ catalogo: cat });
  const env = envFalso({ RESEND_API_KEY: 're_teste' });
  for (const email of ['a@exemplo.pt', 'b@exemplo.pt', 'c@exemplo.pt']) await pedirAvisos(env, { op: 'pedir', produto: 'manta-remalhada', variante: null, email });
  const voltou = esgotado();
  voltou.produtos['manta-remalhada'].esgotado = false;
  rede.repor();
  rede = redeFalsa({ catalogo: voltou });
  // o objecto deixa de responder ao 3.º «fechar» (o pedido do painel morre a meio)
  const ns = env.AVISOS;
  let fechos = 0;
  env.AVISOS = { ...ns, jurisdiction: () => ({ ...ns, idFromName: ns.idFromName, get: (id) => { const o = ns.get(id); return { fetch: async (url, init) => { const corpo = JSON.parse(init.body); if (corpo.op === 'fechar' && ++fechos === 3) throw new Error('caiu'); return o.fetch(url, init); } }; } }), idFromName: ns.idFromName, get: ns.get };
  assert.equal((await enviarDe(env, 'manta-remalhada')).json.enviados, 3);
  env.AVISOS = ns;
  // passados os 10 min da reserva, o clique seguinte só volta a quem não ficou apagado (o 3.º), não aos outros dois
  const agora = Date.now;
  Date.now = () => agora() + 11 * 60 * 1000;
  try {
    assert.deepEqual((await enviarDe(env, 'manta-remalhada')).json, { enviados: 1, falharam: 0, esperam: 0, faltam: 0 });
  } finally { Date.now = agora; }
  // (a ordem é a das chaves no objecto) o 3.º do 1.º clique — o do «fechar» que caiu — é o único que recebe outra vez
  const para = rede.resend().map((e) => e.to[0]);
  assert.equal(para.length, 4);
  assert.deepEqual([...new Set(para.slice(0, 3))].sort(), ['a@exemplo.pt', 'b@exemplo.pt', 'c@exemplo.pt']);
  assert.equal(para[3], para[2]);
});

test('um produto chamado «constructor» conta-se como os outros', async () => {
  const env = envFalso();
  await pedirAvisos(env, { op: 'pedir', produto: 'constructor', variante: null, email: 'ana@exemplo.pt' });
  assert.deepEqual(JSON.parse(JSON.stringify(await pedirAvisos(env, { op: 'contar' }))), { avisos: { constructor: [{ grupo: null, valor: null, n: 1 }] } });
});

test('o travão do aviso conta a rede IPv6 /64, e não cada endereço', async () => {
  const { chaveDoIp } = await import('../index.js');
  assert.equal(chaveDoIp('2001:db8:abcd:12:1:2:3:4'), '2001:db8:abcd:12::/64');
  assert.equal(chaveDoIp('2001:DB8:ABCD:12:ffff::1'), '2001:db8:abcd:12::/64');
  assert.equal(chaveDoIp('203.0.113.7'), '203.0.113.7');
});
