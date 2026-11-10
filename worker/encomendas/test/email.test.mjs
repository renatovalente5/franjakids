/* Os emails: todos em texto E HTML com os mesmos factos, curtos, com o logótipo, o número, as
   escolhas e o texto da personalização, o total e o contacto da loja; a livre resolução certa para o
   que é e o que não é personalizado; o NIF nunca no email do cliente; e NUNCA a frase do botão da
   lei sobre o pagamento (montada por pedaços em ajuda.mjs, para nem os testes a terem). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensagens, avisar, eur, dataPT } from '../email.js';
import { CORES, CORES_ESCURAS } from '../email-html.js';
import { envFalso, redeFalsa, semAcentos, FRASE_PROIBIDA, clone } from './ajuda.mjs';

const env = envFalso({ STORE_EMAIL: 'loja@exemplo.pt' });
const BABYGROW = { produto: 'babygrow-com-nome', nome: 'Babygrow', qtd: 1, tamanho: '1 mês', cor: 'Rosa', opcoes: {}, personalizar: true, texto: 'Clara', escolhas: ['Tamanho: 1 mês', 'Cor: Rosa', 'Nome a bordar: Clara'], personalizada: true, unidade_cents: 1990, total_cents: 1990 };
const MANTA = { produto: 'manta-remalhada', nome: 'Manta remalhada', qtd: 2, cor: 'Areia', opcoes: {}, personalizar: false, texto: '', escolhas: ['Cor: Areia'], personalizada: false, unidade_cents: 2190, total_cents: 4380 };
const enc = {
  v: 1, encomenda: 'FK-20261109-7K2Q9M', chave: 'ABCDEFGHJKLMNPQRSTUV', modo: 'encomenda', estado: 'registada', entrega: 'continente',
  linhas: [BABYGROW, MANTA],
  artigos_cents: 6370, portes_cents: 0, portes_por_confirmar: false, total_cents: 6370,
  cliente: { nome: 'Maria Fernanda Silva', email: 'maria@exemplo.pt', telefone: '912 345 678', nif: '123456789', morada: 'Rua das Flores, 10', codigoPostal: '4440-503', localidade: 'Valongo' },
  oferta: { sim: true, mensagem: 'Parabéns, Clara!\nCom amor, avó Rosa' },
  notas: 'Preciso para dia 20.',
  termos: { aceites_em: '2026-11-09T21:02:11.000Z', pagina: 'https://renatovalente5.github.io/franjakids/termos/' },
  stripe: { session_id: 'cs_1', payment_intent: 'pi_1', metodo: 'mb_way', pago_em: '2026-11-09T21:05:00.000Z', reembolsado_cents: 6370 },
  historico: [{ em: '2026-11-09T21:02:11.000Z', estado: 'registada', por: 'site' }],
  criada_em: '2026-11-09T21:02:11.000Z', actualizada_em: '2026-11-09T21:02:11.000Z',
};
const MOMENTOS = ['registada', 'paga', 'pronta', 'enviada', 'anulada', 'reembolsada', 'falhou', 'expirou'];
const extras = { nota: 'CTT RR000111222PT', origem: 'stripe' };   // um registo que não se confunde com o NIF
/* A entrega de cada momento: «pronta» é só da entrega em mão. */
const paraMomento = (momento, e = enc) => ({ ...e, entrega: momento === 'pronta' ? 'mao' : e.entrega, estado: momento === 'registada' ? 'registada' : momento });
const tudo = (m) => [m.cliente && m.cliente.assunto, m.cliente && m.cliente.texto, m.cliente && m.cliente.html, m.loja && m.loja.assunto, m.loja && m.loja.texto, m.loja && m.loja.html].filter(Boolean).join('\n');

test('cada momento tem o email ao cliente em texto e HTML, com o número, o logótipo, a saudação e o contacto da loja', () => {
  for (const momento of MOMENTOS) {
    const m = mensagens(env, momento, paraMomento(momento), extras);
    assert.ok(m.cliente, momento);
    const { assunto, texto, html } = m.cliente;
    assert.ok(assunto.includes('FK-20261109-7K2Q9M'), `${momento}: o assunto leva o número`);
    assert.ok(texto.length > 100 && texto.length < 2500, `${momento}: curto (${texto.length})`);
    assert.match(texto, /^Olá Maria,\n/);
    assert.match(texto, /Franja Kids · mensagem no Instagram: https:\/\/ig\.me\/m\/franjakids · loja@exemplo\.pt$/);
    assert.match(texto, /Ver a encomenda: https:\/\/renatovalente5\.github\.io\/franjakids\/obrigado\/\?e=FK-20261109-7K2Q9M&c=ABCDEFGHJKLMNPQRSTUV/);
    assert.match(html, /^<!DOCTYPE html/);
    assert.match(html, /<html lang="pt-PT"/);
    assert.match(html, /<img src="https:\/\/renatovalente5\.github\.io\/franjakids\/assets\/marca\/logotipo-320\.png" width="160" height="114" alt="Franja Kids"/);
    assert.match(html, /Encomenda FK-20261109-7K2Q9M · 9 de novembro de 2026/);
    assert.match(html, /obrigado\/\?e=FK-20261109-7K2Q9M&amp;c=ABCDEFGHJKLMNPQRSTUV/, 'o botão «Ver a encomenda»');
    assert.match(html, /href="https:\/\/ig\.me\/m\/franjakids"/);
    assert.match(html, /renatovalente5\.github\.io\/franjakids\. É sobre a tua encomenda, não é publicidade\./);
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(texto, /undefined|null|NaN|\[object/);
    assert.doesNotMatch(html, /undefined|NaN|\[object|>null</);
  }
});

test('nunca a frase proibida, em nenhum email (ao cliente e à loja), nem sem acentos', () => {
  for (const momento of MOMENTOS) {
    for (const origem of ['stripe', 'painel']) {
      for (const e of [paraMomento(momento), { ...paraMomento(momento), entrega: 'mao' }, { ...paraMomento(momento), linhas: [MANTA] }]) {
        assert.doesNotMatch(semAcentos(tudo(mensagens(env, momento, e, { ...extras, origem }))), FRASE_PROIBIDA, momento);
      }
    }
  }
});

test('o NIF nunca vai no email do cliente (em nenhum momento); vai sempre no da loja', () => {
  for (const momento of MOMENTOS) {
    const m = mensagens(env, momento, paraMomento(momento), extras);
    const doCliente = [m.cliente.assunto, m.cliente.texto, m.cliente.html].join('\n');
    assert.equal(doCliente.includes('123456789'), false, `${momento}: o NIF não vai ao cliente`);
    assert.equal(doCliente.includes('Preciso para dia 20'), false, `${momento}: as notas são para a loja`);
    if (m.loja) {
      assert.match(m.loja.texto, /NIF: 123456789/, momento);
      assert.match(m.loja.html, /123456789/, momento);
    }
  }
  const semNif = mensagens(env, 'registada', { ...enc, cliente: { ...enc.cliente, nif: undefined } }).loja;
  assert.match(semNif.texto, /NIF: \(não indicado\)/);
});

test('cada linha mostra as escolhas e o texto da personalização; os portes e o total como o site', () => {
  const { texto, html } = mensagens(env, 'registada', enc).cliente;
  assert.match(texto, /ARTIGOS\n {2}1 × Babygrow — 19,90 €\n {6}Tamanho: 1 mês · Cor: Rosa · Nome a bordar: Clara\n {2}2 × Manta remalhada — 43,80 €\n {6}Cor: Areia\n {2}Portes: Grátis\n {2}Total: 63,70 €/);
  assert.match(html, /1 × Babygrow/);
  assert.match(html, /Tamanho: 1 mês · Cor: Rosa · Nome a bordar: Clara/);
  assert.match(html, /19,90&nbsp;€/);
  assert.match(html, /63,70 €/);
  const comPortes = mensagens(env, 'registada', { ...enc, linhas: [BABYGROW], artigos_cents: 1990, portes_cents: 390, total_cents: 2380 }).cliente.texto;
  assert.match(comPortes, /Portes: 3,90 €\n {2}Total: 23,80 €/);
  const porConfirmar = mensagens(env, 'registada', { ...enc, linhas: [BABYGROW], artigos_cents: 1990, portes_por_confirmar: true, total_cents: 1990 });
  assert.match(porConfirmar.cliente.texto, /Portes: a confirmar\n {2}Total: 19,90 € \+ portes/);
  assert.match(porConfirmar.cliente.texto, /Envio para Rua das Flores, 10, 4440-503 Valongo\. Confirmamos os portes contigo antes do pagamento\./);
  assert.equal(porConfirmar.loja.assunto, 'Nova encomenda FK-20261109-7K2Q9M — 19,90 € + portes');
  const mao = mensagens(env, 'registada', { ...enc, entrega: 'mao', cliente: { nome: 'Maria', email: 'maria@exemplo.pt', telefone: '912345678' } });
  assert.match(mao.cliente.texto, /Entrega em mão: Grátis/);
  assert.match(mao.cliente.texto, /ENTREGA\n {2}Entrega em mão: combinamos contigo o dia por mensagem\./);
  assert.match(mao.loja.texto, /ENTREGA\n {2}Entrega em mão\n/);
  const fora = mensagens(env, 'registada', { ...enc, entrega: 'estrangeiro', portes_por_confirmar: true, cliente: { ...enc.cliente, morada: '12 Rue de la Paix', codigoPostal: '75002', localidade: 'Paris', pais: 'França' } });
  assert.match(fora.cliente.texto, /Envio para 12 Rue de la Paix, 75002 Paris, França\./);
  assert.match(fora.loja.texto, /Fora de Portugal — PORTES POR CONFIRMAR com o cliente\n {2}Maria Fernanda Silva, 12 Rue de la Paix, 75002 Paris, França/);
});

test('a oferta: «não pomos preços» e a mensagem do cartão, ao cliente na confirmação e sempre à loja; o texto do cliente vai escapado no HTML', () => {
  const m = mensagens(env, 'registada', enc);
  assert.match(m.cliente.texto, /OFERTA\n {2}É para oferecer: não pomos preços na encomenda\.\n {2}Mensagem para o cartão: «Parabéns, Clara!\n {4}Com amor, avó Rosa»/);
  assert.match(m.cliente.html, /Mensagem para o cartão: «Parabéns, Clara!<br>Com amor, avó Rosa»/);
  assert.match(m.loja.texto, /OFERTA\n {2}É para oferecer: não pomos preços na encomenda\./);
  assert.match(m.loja.texto, /NOTAS DO CLIENTE\n {2}Preciso para dia 20\./);
  assert.doesNotMatch(mensagens(env, 'registada', { ...enc, oferta: { sim: false } }).cliente.texto, /OFERTA/);
  assert.doesNotMatch(mensagens(env, 'pronta', { ...enc, entrega: 'mao' }).cliente.texto, /OFERTA|ENTREGA/, 'a oferta e a entrega vão na confirmação, não em cada email');
  const malandro = mensagens(env, 'registada', { ...enc, oferta: { sim: true, mensagem: '<img src=x onerror=alert(1)>' }, linhas: [{ ...BABYGROW, escolhas: ['Nome a bordar: <b>Ana</b>'] }] });
  for (const html of [malandro.cliente.html, malandro.loja.html]) {
    assert.doesNotMatch(html, /<img src=x|<b>Ana/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&lt;b&gt;Ana&lt;\/b&gt;/);
  }
});

test('a livre resolução: 14 dias para o que não é personalizado; os personalizados não a têm; sempre com /trocas-e-devolucoes/ e /termos/', () => {
  const T = 'https://renatovalente5.github.io/franjakids/trocas-e-devolucoes/';
  const termos = 'https://renatovalente5.github.io/franjakids/termos/';
  const so = (linhas) => mensagens(env, 'registada', { ...enc, linhas }).cliente;
  const misto = so([BABYGROW, MANTA]);
  assert.match(misto.texto, /Tens 14 dias depois de receberes a encomenda para desistir dos artigos sem personalização, sem dares justificação; os personalizados não têm troca nem devolução por desistência\./);
  const semPers = so([MANTA]);
  assert.match(semPers.texto, /Tens 14 dias depois de receberes a encomenda para desistir da compra, sem dares justificação: vê como em/);
  assert.doesNotMatch(semPers.texto, /personalizados/);
  const soPers = so([BABYGROW]);
  assert.match(soPers.texto, /Os artigos personalizados não têm troca nem devolução por desistência\./);
  assert.doesNotMatch(soPers.texto, /14 dias/, 'tudo personalizado: não há 14 dias a prometer');
  for (const m of [misto, semPers, soPers]) {
    assert.ok(m.texto.includes(T) && m.texto.includes(termos));
    assert.ok(m.html.includes(`href="${T}"`) && m.html.includes(`href="${termos}"`));
  }
  // Escolher a cor e o tamanho não é personalizar: só o nome bordado conta.
  assert.match(so([{ ...BABYGROW, personalizada: false, escolhas: ['Tamanho: 1 mês', 'Cor: Rosa'] }]).texto, /desistir da compra/);
  for (const momento of ['registada', 'paga', 'pronta', 'enviada']) {
    assert.match(mensagens(env, momento, paraMomento(momento), extras).cliente.texto, /trocas-e-devolucoes/, `${momento} leva a livre resolução`);
  }
  for (const momento of ['anulada', 'reembolsada', 'falhou', 'expirou']) {
    assert.doesNotMatch(mensagens(env, momento, paraMomento(momento), extras).cliente.texto, /14 dias|desistência/, `${momento} não fala da livre resolução`);
  }
});

test('a pré-visualização só se promete quando há o que pré-visualizar, e pela Stripe (pelo painel já foi combinada)', () => {
  const PREVIA = /Antes de produzirmos, mandamos-te a pré-visualização para aprovares\./;
  assert.match(mensagens(env, 'registada', enc).cliente.texto, PREVIA);
  assert.doesNotMatch(mensagens(env, 'registada', { ...enc, linhas: [MANTA] }).cliente.texto, PREVIA, 'uma manta não tem pré-visualização');
  assert.match(mensagens(env, 'paga', paraMomento('paga'), { origem: 'stripe' }).cliente.texto, PREVIA);
  assert.doesNotMatch(mensagens(env, 'paga', paraMomento('paga'), { origem: 'painel' }).cliente.texto, PREVIA);
  assert.match(mensagens(env, 'paga', paraMomento('paga'), { origem: 'stripe' }).loja.texto, /A seguir: a fatura e a pré-visualização para o cliente aprovar\./);
  assert.match(mensagens(env, 'paga', { ...paraMomento('paga'), linhas: [MANTA] }, { origem: 'stripe' }).loja.texto, /A seguir: a fatura\.$/);
});

test('o texto e o HTML dizem os mesmos factos', () => {
  const site = 'https://renatovalente5.github.io/franjakids';
  for (const momento of MOMENTOS) {
    const e = paraMomento(momento);
    const m = mensagens(env, momento, e, extras);
    for (const quem of ['cliente', 'loja']) {
      const x = m[quem];
      if (!x) continue;
      // O HTML sem marcas, com as entidades desfeitas: o que lá se lê.
      const lido = x.html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
      const hrefs = [...x.html.matchAll(/href="([^"]+)"/g)].map((r) => r[1].replace(/&amp;/g, '&'));
      const factos = [e.encomenda, eur(e.total_cents).replace(' ', ' '), ...e.linhas.flatMap((l) => [l.nome, ...l.escolhas])];
      for (const f of factos) assert.ok(lido.includes(f), `${momento}/${quem}: o HTML não diz «${f}»`);
      for (const f of factos) assert.ok(x.texto.includes(f), `${momento}/${quem}: o texto não diz «${f}»`);
      // Cada endereço do texto está numa ligação do HTML (e o contrário, tirando o mailto).
      const urls = x.texto.match(/https:\/\/\S+[^\s.,)]/g) || [];
      for (const u of urls) assert.ok(hrefs.includes(u), `${momento}/${quem}: o HTML não liga para ${u}`);
      for (const h of hrefs.filter((u) => u.startsWith('https://'))) assert.ok(x.texto.includes(h), `${momento}/${quem}: o texto não diz ${h}`);
      if (quem === 'cliente' && !['anulada', 'reembolsada', 'falhou', 'expirou'].includes(momento)) assert.ok(urls.includes(`${site}/trocas-e-devolucoes/`));
    }
  }
});

test('os emails à loja: só nos momentos certos, com tudo o que precisa (telefone, NIF, email, morada, notas)', () => {
  const comLoja = { registada: true, paga: true, pronta: false, enviada: false, anulada: false, reembolsada: false, falhou: true, expirou: true };
  for (const momento of MOMENTOS) {
    assert.equal(Boolean(mensagens(env, momento, paraMomento(momento), { origem: 'stripe' }).loja), comLoja[momento], momento);
  }
  assert.equal(mensagens(env, 'paga', paraMomento('paga'), { origem: 'painel' }).loja, null, 'marcada pela dona no painel, a loja não se avisa a si própria');
  const d = mensagens(env, 'registada', enc).loja;
  assert.equal(d.assunto, 'Nova encomenda FK-20261109-7K2Q9M — 63,70 €');
  assert.match(d.texto, /^Nova encomenda FK-20261109-7K2Q9M — 63,70 €\.\n/);
  assert.match(d.texto, /CLIENTE\n {2}Nome: Maria Fernanda Silva\n {2}Telemóvel: 912 345 678\n {2}Email: maria@exemplo\.pt\n {2}NIF: 123456789/);
  assert.match(d.texto, /ENTREGA\n {2}Portugal continental\n {2}Maria Fernanda Silva, Rua das Flores, 10, 4440-503 Valongo/);
  assert.match(d.texto, /Falta confirmar a encomenda com o cliente e combinar o pagamento\./);
  assert.match(d.html, /href="mailto:maria@exemplo\.pt"/);
  assert.match(d.html, /Responder a este email é responder ao cliente\./);
  const falhou = mensagens(env, 'falhou', paraMomento('falhou')).loja;
  assert.equal(falhou.assunto, 'FK-20261109-7K2Q9M falhou');
  assert.match(falhou.texto, /^O pagamento da encomenda FK-20261109-7K2Q9M não se concluiu\. O cliente foi avisado\./);
  assert.match(mensagens(env, 'expirou', paraMomento('expirou')).loja.texto, /^A página de pagamento da encomenda FK-20261109-7K2Q9M expirou sem o pagamento\. O cliente foi avisado\./);
  assert.equal(mensagens(env, 'expirou', paraMomento('expirou')).loja.assunto, 'FK-20261109-7K2Q9M expirou');
  assert.match(mensagens(env, 'paga', paraMomento('paga'), { origem: 'stripe' }).loja.texto, /Pagamento: MB WAY · Stripe: pi_1/);
});

/* O contraste (WCAG 2.x): a luminância relativa de cada cor e a razão entre as duas. */
const luminancia = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('as cores dos emails: cada par de texto mede 4,5:1 ou mais, no claro e no escuro, e o HTML não usa outras', () => {
  const C = CORES, E = CORES_ESCURAS;
  const pares = [
    ['texto no cartão', C.tinta, C.cartao], ['texto secundário no cartão', C.tintaSuave, C.cartao], ['ligações no cartão', C.coral, C.cartao],
    ['rodapé no fundo', C.tintaSuave, C.fundo], ['texto do botão', C.botaoTexto, C.castanho],
    ['escuro: texto no cartão', E.tinta, E.cartao], ['escuro: secundário no cartão', E.tintaSuave, E.cartao], ['escuro: rodapé no fundo', E.tintaSuave, E.fundo],
  ];
  for (const [nome, a, b] of pares) assert.ok(contraste(a, b) >= 4.5, `${nome}: ${contraste(a, b).toFixed(2)}:1`);
  const medidas = new Set([...Object.values(C), ...Object.values(E)].map((x) => x.toUpperCase()));
  for (const momento of MOMENTOS) {
    const m = mensagens(env, momento, paraMomento(momento), extras);
    for (const x of [m.cliente, m.loja].filter(Boolean)) {
      for (const [cor] of x.html.matchAll(/#[0-9A-Fa-f]{6}\b/g)) assert.ok(medidas.has(cor.toUpperCase()), `${momento}: ${cor} não está nas cores medidas`);
    }
  }
});

test('avisar(): sem chave do Resend não manda e di-lo; com ela manda ao cliente e à loja; sem STORE_EMAIL só ao cliente', async () => {
  const semChave = await avisar(envFalso(), 'registada', enc);
  assert.deepEqual({ ...semChave, em: 'x' }, { em: 'x', cliente: 'sem chave', loja: 'sem destinatário' });
  const rede = redeFalsa({});
  try {
    const r = await avisar(envFalso({ RESEND_API_KEY: ' re_x ', STORE_EMAIL: 'loja@exemplo.pt' }), 'registada', enc);
    assert.deepEqual({ ...r, em: 'x' }, { em: 'x', cliente: 'enviado', loja: 'enviado' });
    const emails = rede.resend();
    assert.equal(emails.length, 2);
    assert.equal(rede.chamadas[0].init.headers.Authorization, 'Bearer re_x', 'a chave sem os espaços colados');
    assert.ok(emails.every((e) => typeof e.text === 'string' && e.text.length && typeof e.html === 'string'), 'o texto nunca se omite, e o HTML vai sempre');
    assert.ok(emails.every((e) => e.from === 'Franja Kids <onboarding@resend.dev>'));
    const so = await avisar(envFalso({ RESEND_API_KEY: 're_x' }), 'pronta', { ...enc, entrega: 'mao' });
    assert.deepEqual({ ...so, em: 'x' }, { em: 'x', cliente: 'enviado', loja: 'não se aplica' });
    const semEmail = await avisar(envFalso({ RESEND_API_KEY: 're_x' }), 'pronta', { ...enc, cliente: { nome: 'X' } });
    assert.equal(semEmail.cliente, 'sem email');
    assert.deepEqual(mensagens(env, 'inventado', enc), { cliente: null, loja: null });
  } finally { rede.repor(); }
});

test('miudezas: os euros e a data por extenso na hora de Lisboa (a do Intl)', () => {
  assert.equal(eur(5), '0,05 €');
  assert.equal(eur(1990), '19,90 €');
  assert.equal(eur(123456), '1234,56 €');
  const intl = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'long', year: 'numeric' });
  for (let ms = Date.UTC(2026, 0, 1, 23, 30); ms < Date.UTC(2028, 0, 1); ms += 86400 * 1000) {
    assert.equal(dataPT(new Date(ms).toISOString()), intl.format(new Date(ms)), new Date(ms).toISOString());
  }
  assert.equal(dataPT('lixo'), '');
  const e2 = clone(enc);
  e2.criada_em = '2026-07-31T23:30:00.000Z';
  assert.match(mensagens(env, 'registada', e2).cliente.html, /· 1 de agosto de 2026/, 'às 23:30 UTC de verão já é dia 1 em Lisboa');
});

/* A CLOUDFLARE (Email Sending, o binding EMAIL) vem antes do Resend: com ele, o email sai por ele, com o
   remetente partido em { email, name } e a resposta para a loja; uma recusa dá 'falhou'. */
test('com o binding EMAIL da Cloudflare: sai por ele, com o remetente e o reply-to certos; uma recusa é «falhou»', async () => {
  const { enviar, remetenteDe } = await import('../email.js');
  assert.deepEqual(remetenteDe({ MAIL_FROM: 'Franja Kids <encomendas@franjakids.com>' }), { email: 'encomendas@franjakids.com', name: 'Franja Kids' });
  assert.deepEqual(remetenteDe({ MAIL_FROM: 'encomendas@franjakids.com' }), { email: 'encomendas@franjakids.com' });
  const enviados = [];
  const EMAIL = { send: async (m) => { enviados.push(m); return { messageId: 'm1' }; } };
  const r = await avisar(envFalso({ EMAIL, MAIL_FROM: 'Franja Kids <encomendas@franjakids.com>', STORE_EMAIL: 'loja@exemplo.pt', RESEND_API_KEY: 're_nao_usar' }), 'registada', enc);
  assert.equal(r.cliente, 'enviado');
  assert.equal(r.loja, 'enviado');
  assert.equal(enviados.length, 2);
  const aoCliente = enviados.find((m) => m.to === 'maria@exemplo.pt');
  assert.deepEqual(aoCliente.from, { email: 'encomendas@franjakids.com', name: 'Franja Kids' });
  assert.equal(aoCliente.replyTo, 'loja@exemplo.pt');
  assert.ok(aoCliente.text && aoCliente.html && aoCliente.subject.includes('FK-20261109-7K2Q9M'));
  const recusa = await avisar(envFalso({ EMAIL: { send: async () => { const e = new Error('não'); e.code = 'E_SENDER_NOT_VERIFIED'; throw e; } }, MAIL_FROM: 'x@franjakids.com' }), 'pronta', { ...enc, entrega: 'mao' });
  assert.equal(recusa.cliente, 'falhou');
});
