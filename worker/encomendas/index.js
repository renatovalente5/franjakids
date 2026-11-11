/* FRANJA KIDS — O WORKER DAS ENCOMENDAS (franjakids-encomendas). O contrato está em
 * docs/ENCOMENDAS.md; o site (assets/js/site.js) e o painel são escritos contra ele.
 *
 *   POST /checkout            a encomenda do site: refaz as contas com o catálogo publicado e as
 *                             regras do site (src/lib/regras.mjs), grava no KV e, em modo
 *                             «encomenda», manda os emails e devolve o número e a chave; em modo
 *                             «online», abre a página segura da Stripe.
 *   GET  /encomenda?e=&c=     o que a página «obrigado» mostra (sem dados pessoais); ou ?s=<sessão>.
 *   POST /encomenda/desistir  { e, c } — a pessoa voltou da página da Stripe sem pagar: fecha-a, e a
 *                             encomenda pendente fica «expirou», sem emails (11 nov 2026).
 *   POST /cupao               { codigo, linhas, entrega } — o finalizar confere um cupão: → { cupao, desconto_cents }
 *                             ou 400 { erro, campo: 'cupao' } (cupoes.js; 11 nov 2026).
 *   POST /stripe/webhook      os eventos da Stripe (a fonte da verdade do pagamento).
 *   /painel/…                 as rotas do painel, com o PAINEL_SEGREDO (painel.js).
 *
 * A base é o Worker das encomendas da LF Mobile, que veio do Worker da Stripe do Armazém dos
 * Pneus: a estrutura dos webhooks, a idempotência por evento, o Checkout hosted em português, as
 * contas refeitas do lado do servidor. Sem dependências npm: fetch puro. As regras dos preços não
 * se copiam: importam-se do site, e o wrangler junta-as no pacote.
 *
 * SEGREDOS (wrangler secret put; nunca no repositório): PAINEL_SEGREDO, STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET, RESEND_API_KEY. As vars estão no wrangler.toml (§7 do contrato).
 */

import { json, lerCorpoJson } from './http.js';
import { lerCatalogo, modoDe, siteUrl } from './catalogo.js';
import { validarPedido, ErroDoPedido, hojeLisboa } from './contas.js';
import { criarEncomenda, idLivre, novaChave, lerEncomenda, gravarEncomenda, alterarEncomenda, mudarEstado, vistaPublica, iguais, RE_ID, RE_CHAVE, TTL_ENCOMENDA, TTL_EVENTO, agoraISO } from './encomenda.js';
import { criarSessao, stripeFetch, verificarAssinatura, aplicarEvento, idDoEvento, metodoDaCobranca } from './stripe.js';
import { avisar, falhou, podeAvisarCliente } from './email.js';
import { rotaPainel } from './painel.js';
import { normalizarCodigo, pedirCupoes, resumoDoEmail, publico, porQueNaoVale, acertarCupao, fazerAcerto, libertarUso } from './cupoes.js';
import { hojeLisboa as hoje, contas as fazerContas } from './contas.js';

// Os objectos duráveis (objecto.js, cupoes.js): cada encomenda, o contador dos emails por endereço e os cupões.
export { Encomenda, Contador } from './objecto.js';
export { Cupoes } from './cupoes.js';

const JANELA_DE_REENTREGA_SEGUNDOS = 3600;   // até quando vale pedir à Stripe que reentregue
const SEM_INSTAGRAM = 'manda-nos mensagem no Instagram';

/* ---------------------------------------------------------------- CORS
   Só as origens de ALLOWED_ORIGINS. Um pedido SEM Origin (o curl, um servidor) não é um pedido
   entre origens: segue sem cabeçalhos CORS. Um pedido com uma origem desconhecida, 403. */
const origensDe = (env) => String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
function corsDe(request, env) {
  const origem = request.headers.get('Origin');
  if (!origem) return {};
  if (!origensDe(env).includes(origem)) return null;
  return {
    'Access-Control-Allow-Origin': origem,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/* ---------------------------------------------------------------- o travão do /checkout
   Primeiro o da Cloudflare (o binding TRAVAO_CHECKOUT, 5 por minuto por IP, contado em todas as
   localizações); se o binding faltar ou falhar, vale o de memória, que só trava este isolate. Cada
   /checkout aceite grava no KV, e a quota de escritas é da conta inteira. */
const batidas = new Map();
function travadoEmMemoria(ip, agora = Date.now()) {
  const r = batidas.get(ip);
  if (!r || agora - r.inicio > 60_000) { batidas.set(ip, { inicio: agora, n: 1 }); return false; }
  r.n += 1;
  if (batidas.size > 5000) batidas.clear();
  return r.n > 10;
}
async function travado(env, ip) {
  if (env.TRAVAO_CHECKOUT && typeof env.TRAVAO_CHECKOUT.limit === 'function') {
    try {
      const { success } = await env.TRAVAO_CHECKOUT.limit({ key: `checkout:${ip}` });
      if (!success) return true;
    } catch (e) {
      console.error('travão da Cloudflare falhou (vale o de memória):', e.message);
    }
  }
  return travadoEmMemoria(ip);
}

/* ---------------------------------------------------------------- POST /checkout */

async function checkout(request, env, cors) {
  const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
  if (await travado(env, ip)) return json({ erro: 'Demasiadas tentativas. Espera um minuto e tenta outra vez.' }, 429, cors);
  const { corpo, resposta } = await lerCorpoJson(request, cors);
  if (resposta) return resposta;

  let cat;
  try {
    cat = await lerCatalogo(env);
  } catch (e) {
    console.error('catálogo por ler:', e.message);
    return json({ erro: 'Não conseguimos confirmar os preços agora. Tenta daqui a um minuto.' }, 503, cors);
  }
  const modo = modoDe(cat, env);
  if (modo === 'online' && !env.STRIPE_SECRET_KEY) return json({ erro: 'O pagamento no site ainda não está ligado. Encomenda por mensagem no Instagram.' }, 503, cors);

  // O cupão (cupoes.js): a regra lê-se do objecto dos cupões; um que já não vale recusa a encomenda com
  // campo «cupao» (o finalizar tira-o e refaz o total).
  const tirado = (razao) => json({ erro: `${razao} Tirámo-lo: vê o total outra vez.`, campo: 'cupao' }, 400, cors);
  let cupao = null;
  if (corpo && corpo.cupao !== undefined && corpo.cupao !== null && corpo.cupao !== '') {
    const codigo = normalizarCodigo(corpo.cupao);
    try { cupao = codigo ? (await pedirCupoes(env, { op: 'ler', codigo })).regra : null; } catch (e) { console.error('cupões por ler', e.message); return json({ erro: 'Não conseguimos confirmar o cupão agora. Tenta daqui a um minuto.' }, 503, cors); }
    if (!cupao || cupao.ativo === false) return tirado('Este cupão não existe ou já não vale.');
  }

  let pedido;
  try {
    pedido = validarPedido(corpo, cat, modo, { cupao });
  } catch (e) {
    if (e instanceof ErroDoPedido) return json(e.campo ? { erro: e.message, campo: e.campo } : { erro: e.message }, e.status, cors);
    throw e;
  }
  if (cupao && pedido.contas.cupao_sem_efeito) {
    return tirado(cupao.tipo === 'portes' ? `O cupão ${cupao.codigo} é de portes grátis e não se aplica a esta entrega.` : `O cupão ${cupao.codigo} não dá desconto nestes artigos.`);
  }
  // O que o site mostrou tem de ser o que se cobra: se um preço mudou entretanto, o site redesenha.
  if (pedido.contas.total_cents !== corpo.total_cents) return json({ erro: 'Os preços mudaram. Confirma o total e envia outra vez.' }, 409, cors);

  const em = agoraISO();
  const id = await idLivre(env, hojeLisboa());
  // O uso do cupão reserva-se já, num passo só no objecto (as datas, o mínimo, o limite e o «um por pessoa»
  // conferem-se lá): dois clientes ao mesmo tempo não passam o limite. Volta se a encomenda não se gravar.
  if (cupao) {
    let r;
    try { r = await pedirCupoes(env, { op: 'reservar', codigo: cupao.codigo, cliente: await resumoDoEmail(pedido.cliente.email), encomenda: id, hoje: hojeLisboa(), artigos_cents: pedido.contas.artigos_cents }); } catch (e) { console.error('cupão por reservar', e.message); return json({ erro: 'Não conseguimos confirmar o cupão agora. Tenta daqui a um minuto.' }, 503, cors); }
    if (r.erro) return tirado(r.erro);
  }
  const enc = criarEncomenda({ id, chave: novaChave(), modo, estado: modo === 'online' ? 'pendente' : 'registada', pedido, termosPagina: `${siteUrl(env)}/termos/`, em });

  if (modo === 'online') {
    // A sessão da Stripe primeiro, a encomenda depois: um pedido que a Stripe recuse não gasta
    // escritas do KV. E a pessoa só recebe o endereço da página de pagamento com a encomenda já
    // gravada: não paga uma encomenda que não existe.
    let sessao;
    try {
      sessao = await criarSessao(env, enc, pedido.zona);
    } catch (e) {
      console.error('a Stripe não abriu a sessão', id, e.status, e.codigo, e.message);
      await libertarUso(env, enc);
      return json({ erro: `Não foi possível abrir o pagamento. Tenta outra vez ou ${SEM_INSTAGRAM}.` }, 502, cors);
    }
    enc.stripe = { session_id: sessao.id };
    try {
      await gravarEncomenda(env, enc, { em });
      await env.ORDERS.put(`session:${sessao.id}`, id, { expirationTtl: TTL_ENCOMENDA });
    } catch (e) {
      console.error('ENCOMENDA NÃO GRAVADA', id, sessao.id, e.message);
      await libertarUso(env, enc);
      return json({ erro: `Não foi possível registar a encomenda agora. Tenta daqui a pouco ou ${SEM_INSTAGRAM}.` }, 503, cors);
    }
    return json({ encomenda: id, chave: enc.chave, url: sessao.url, total_cents: enc.total_cents }, 200, cors);
  }

  try {
    await gravarEncomenda(env, enc, { em });
  } catch (e) {
    console.error('ENCOMENDA NÃO GRAVADA', id, e.message);
    await libertarUso(env, enc);
    return json({ erro: `Não foi possível registar a encomenda agora. Tenta daqui a pouco ou ${SEM_INSTAGRAM}.` }, 503, cors);
  }
  // Os emails saem antes de responder (num waitUntil um erro não se vê: memória
  // erro-em-waituntil-nao-falha-nada). Uma falha do envio não apaga a encomenda, que já está
  // gravada: fica registada nela, e só então se grava outra vez. O email ao cliente tem travão por
  // endereço (qualquer pessoa pode encomendar com o email de outra): o da loja sai sempre.
  const extras = (await podeAvisarCliente(env, enc.cliente.email)) ? {} : { semCliente: 'travado: emails de mais para este endereço hoje' };
  const resultado = await avisar(env, 'registada', enc, extras);
  if (falhou(resultado) || extras.semCliente) {
    if (falhou(resultado)) console.error('EMAIL NÃO ENVIADO', id, JSON.stringify(resultado));
    try { await alterarEncomenda(env, id, (x) => { x.avisos = { ...(x.avisos || {}), registada: resultado }; }); } catch (e) { console.error('aviso por gravar', id, e.message); }
  }
  return json({ encomenda: id, chave: enc.chave, estado: enc.estado, total_cents: enc.total_cents }, 200, cors);
}

/* ---------------------------------------------------------------- GET /encomenda */

/* A pessoa aterra na página «obrigado» segundos depois de pagar, antes de o webhook chegar: a sessão
   da Stripe é a fonte mais fresca. Só promove o que se mostra (gravar é do webhook), e só para a
   frente: uma encomenda já reembolsada não volta a «paga». */
async function promoverPelaSessao(env, s, vista) {
  if (!env.STRIPE_SECRET_KEY) return;
  try {
    const sessao = await stripeFetch(env, `/checkout/sessions/${encodeURIComponent(s)}`, { method: 'GET' });
    if (sessao.payment_status && sessao.payment_status !== 'unpaid') vista.estado = 'paga';
  } catch (err) {
    console.error('sessão por ler', s, err.message);
  }
}

async function encomenda(url, env, cors) {
  const e = url.searchParams.get('e'), c = url.searchParams.get('c') || '', s = url.searchParams.get('s');
  const naoHa = () => json({ erro: 'Encomenda não encontrada.' }, 404, cors);
  if (e) {
    if (!RE_ID.test(e) || !RE_CHAVE.test(c)) return naoHa();
    const enc = await lerEncomenda(env, e);
    if (!enc || !iguais(enc.chave, c)) return naoHa();
    const vista = vistaPublica(enc);
    // de volta da Stripe (o success_url leva o número, a chave e a sessão): a sessão é a mais fresca
    if (vista.estado === 'pendente' && s && enc.stripe && enc.stripe.session_id === s) await promoverPelaSessao(env, s, vista);
    return json(vista, 200, cors);
  }
  if (s) {
    // Só por sessões que este Worker abriu (o índice session:): não serve de procurador à Stripe.
    if (!/^cs_[A-Za-z0-9_]{10,}$/.test(s)) return naoHa();
    const id = await env.ORDERS.get(`session:${s}`);
    const enc = id ? await lerEncomenda(env, id) : null;
    if (!enc) return naoHa();
    const vista = vistaPublica(enc);
    if (vista.estado === 'pendente') await promoverPelaSessao(env, s, vista);
    return json(vista, 200, cors);
  }
  return json({ erro: 'Falta o número da encomenda.' }, 400, cors);
}

/* ---------------------------------------------------------------- POST /encomenda/desistir
   A pessoa voltou da página da Stripe sem pagar («Voltar», ou o «voltar» do browser): a página dela
   fecha-se já, e a encomenda pendente fica «expirou», sem emails (a pessoa está no site; antes, a
   página ficava aberta uma hora — dava para pagar esta e a seguinte — e uma hora depois chegava-lhe
   «o pagamento não se concluiu», mesmo que entretanto tivesse pago outra). A página fecha-se
   PRIMEIRO: se a pessoa pagou nesse instante, a Stripe recusa, e a encomenda fica para o webhook.
   Pede o número e a chave da encomenda (só quem a fez os tem). */
async function desistir(request, env, cors) {
  const { corpo, resposta } = await lerCorpoJson(request, cors);
  if (resposta) return resposta;
  const e = String(corpo.e ?? ''), c = String(corpo.c ?? '');
  const naoHa = () => json({ erro: 'Encomenda não encontrada.' }, 404, cors);
  if (!RE_ID.test(e) || !RE_CHAVE.test(c)) return naoHa();
  const enc = await lerEncomenda(env, e);
  if (!enc || !iguais(enc.chave, c)) return naoHa();
  if (enc.estado !== 'pendente') return json({ estado: enc.estado }, 200, cors);
  const sessao = enc.stripe && enc.stripe.session_id;
  if (sessao && env.STRIPE_SECRET_KEY) {
    try {
      await stripeFetch(env, `/checkout/sessions/${encodeURIComponent(sessao)}/expire`, { method: 'POST' });
    } catch (err) {
      console.error('desistir: a página da Stripe não fechou (paga entretanto?)', e, err.status, err.message);
      return json({ estado: enc.estado }, 200, cors);
    }
  }
  const r = await alterarEncomenda(env, e, (x) => {
    if (x.estado !== 'pendente') return { parar: true };
    mudarEstado(x, 'expirou', { por: 'cliente', nota: 'Voltou da página de pagamento sem pagar.' });
    return { acerto: acertarCupao(x) };
  });
  if (r.enc && r.acerto) await fazerAcerto(env, r.acerto, r.enc);
  return json({ estado: r.enc ? r.enc.estado : 'expirou' }, 200, cors);
}

/* ---------------------------------------------------------------- POST /cupao
   O finalizar confere um código e mostra o desconto (a mesma conta do /checkout, que confere tudo outra
   vez). O mesmo travão do /checkout: não serve para adivinhar códigos. O «um por pessoa» e o limite só
   se conferem a sério no /checkout (aqui ainda não há email nem reserva). */
async function conferirCupao(request, env, cors) {
  const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
  if (await travado(env, ip)) return json({ erro: 'Demasiadas tentativas. Espera um minuto e tenta outra vez.' }, 429, cors);
  const { corpo, resposta } = await lerCorpoJson(request, cors);
  if (resposta) return resposta;
  const codigo = normalizarCodigo(corpo.codigo);
  if (!codigo) return json({ erro: 'Escreve o código do cupão como está (letras e algarismos).', campo: 'cupao' }, 400, cors);
  let lido, cat;
  try {
    [lido, cat] = await Promise.all([pedirCupoes(env, { op: 'ler', codigo }), lerCatalogo(env)]);
  } catch (e) {
    console.error('cupão por conferir', e.message);
    return json({ erro: 'Não conseguimos confirmar o cupão agora. Tenta daqui a um minuto.' }, 503, cors);
  }
  const regra = lido && lido.regra;
  const zona = (Array.isArray(cat.zonas) ? cat.zonas : []).find((z) => z && z.id === corpo.entrega) || null;
  let c = null;
  // as contas das linhas que o finalizar tem (sem elas, ou com um produto que já não se vende, só a regra)
  try { if (regra && zona) c = fazerContas(cat, corpo.linhas, zona, { cupao: regra }); } catch { c = null; }
  const razao = porQueNaoVale(regra, { hoje: hoje(), artigos_cents: c ? c.artigos_cents : null, usos: lido ? lido.usos : 0 })
    || (c && c.cupao_sem_efeito ? (regra.tipo === 'portes' ? `O cupão ${regra.codigo} é de portes grátis e não se aplica a esta entrega.` : `O cupão ${regra.codigo} não dá desconto nestes artigos.`) : null);
  if (razao) return json({ erro: razao, campo: 'cupao' }, 400, cors);
  return json({ cupao: publico(regra, cat.categorias || {}), desconto_cents: c ? c.desconto_cents : 0 }, 200, cors);
}

/* ---------------------------------------------------------------- POST /stripe/webhook
   Sem CORS, sem Origin, sem travão: a Stripe não é um browser, e um 403/429 provocava reentregas
   sem fim. O estado grava-se ANTES do 200 (num waitUntil, uma falha perdia o pagamento); a marca do
   evento grava-se DEPOIS de aplicar e de enviar (antes, uma reentrega encontrava a marca e engolia
   o evento). */
async function webhook(request, env) {
  if (request.method !== 'POST') return new Response('método', { status: 405 });
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response('webhook por ligar', { status: 503 });
  const bruto = await request.text();   // UMA vez: a assinatura é sobre os bytes crus
  let evento;
  try {
    evento = await verificarAssinatura(bruto, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000));
  } catch (e) {
    console.error('webhook rejeitado:', e.message);
    return new Response('assinatura inválida', { status: 400 });
  }
  const marca = `evt:${evento.id}`;
  if (await env.ORDERS.get(marca)) return new Response('repetido');

  const obj = (evento.data && evento.data.object) || {};
  const id = await idDoEvento(env, obj);
  const enc = id ? await lerEncomenda(env, id) : null;
  if (!enc) {
    if (id && RE_ID.test(id)) {
      // Sabemos a encomenda mas o KV ainda não a mostra (é eventualmente consistente, e a Stripe
      // entrega em segundos): pede-se reentrega em vez de deitar fora um pagamento.
      const idade = Math.floor(Date.now() / 1000) - (evento.created || 0);
      if (idade < JANELA_DE_REENTREGA_SEGUNDOS) return new Response('encomenda ainda não visível', { status: 409 });
      console.error('ENCOMENDA NÃO ENCONTRADA', id, evento.type, 'ao fim de', idade, 's');
    } else {
      console.log('evento sem encomenda nossa', evento.type, obj.id);
    }
    return new Response('sem encomenda');
  }

  /* O evento aplica-se à encomenda como está AGORA, e grava-se sem perder outra escrita
     (alterarEncomenda: se outra passou entretanto — o painel, outro evento —, relê-se e aplica-se
     outra vez; o aplicarEvento só depende do estado e do evento). O meio de pagamento, quando a
     sessão não o diz sem dúvida, pergunta-se à cobrança antes de gravar. */
  const em = agoraISO();
  const r = await alterarEncomenda(env, id, async (x) => {
    const antes = JSON.stringify(x);
    const { avisos } = aplicarEvento(x, evento, em);
    if (avisos.includes('paga') && !x.stripe.metodo) {
      const metodo = await metodoDaCobranca(env, x.stripe.payment_intent);
      if (metodo) x.stripe.metodo = metodo;
    }
    const acerto = acertarCupao(x);
    const mudou = JSON.stringify(x) !== antes;
    return mudou ? { avisos, mudou, acerto } : { avisos, mudou, parar: true };
  }, { em });
  if (!r.enc) return new Response('sem encomenda');
  if (r.acerto) await fazerAcerto(env, r.acerto, r.enc);
  // O índice pi: quando se fica a saber o pagamento (é por ele que um reembolso chega cá).
  const pi = r.enc.stripe && r.enc.stripe.payment_intent;
  if (pi && (await env.ORDERS.get(`pi:${pi}`)) !== id) await env.ORDERS.put(`pi:${pi}`, id, { expirationTtl: TTL_ENCOMENDA });

  // Cada aviso vai uma vez (a marca enc.avisos, lida da encomenda de agora). O resultado junta-se
  // às marcas sem perder outra escrita. O «expirou» ao cliente tem o travão por endereço.
  let enviou = false;
  for (const aviso of r.avisos) {
    const actual = (await lerEncomenda(env, id)) || r.enc;
    if (actual.avisos && actual.avisos[aviso]) continue;
    const extras = { origem: 'stripe' };
    if (aviso === 'expirou' && !(await podeAvisarCliente(env, actual.cliente && actual.cliente.email))) extras.semCliente = 'travado: emails de mais para este endereço hoje';
    const resultado = await avisar(env, aviso, actual, extras);
    if (falhou(resultado)) {
      console.error('EMAIL NÃO ENVIADO', aviso, id, JSON.stringify(resultado), '— 500 para a Stripe reentregar');
      return new Response('emails por enviar', { status: 500 });
    }
    await alterarEncomenda(env, id, (x) => { x.avisos = { ...(x.avisos || {}), [aviso]: resultado }; return {}; });
    enviou = true;
  }
  // A marca do evento só quando houve efeitos que não se querem repetir: cada escrita conta.
  if (r.mudou || enviou) await env.ORDERS.put(marca, '1', { expirationTtl: TTL_EVENTO });
  return new Response('ok');
}

/* ---------------------------------------------------------------- o encaminhador */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const caminho = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (caminho === '/stripe/webhook') return await webhook(request, env);
      if (caminho === '/painel' || caminho.startsWith('/painel/')) return await rotaPainel(request, env, url, caminho);

      const cors = corsDe(request, env);
      if (!cors) return json({ erro: 'Origem não autorizada.' }, 403);
      const publica = caminho === '/checkout' || caminho === '/encomenda' || caminho === '/encomenda/desistir' || caminho === '/cupao';
      if (request.method === 'OPTIONS') return publica ? new Response(null, { status: 204, headers: cors }) : json({ erro: 'Rota desconhecida.' }, 404, cors);
      if (caminho === '/checkout') return request.method === 'POST' ? await checkout(request, env, cors) : json({ erro: 'Método não permitido.' }, 405, cors);
      if (caminho === '/encomenda') return request.method === 'GET' ? await encomenda(url, env, cors) : json({ erro: 'Método não permitido.' }, 405, cors);
      if (caminho === '/encomenda/desistir') return request.method === 'POST' ? await desistir(request, env, cors) : json({ erro: 'Método não permitido.' }, 405, cors);
      if (caminho === '/cupao') return request.method === 'POST' ? await conferirCupao(request, env, cors) : json({ erro: 'Método não permitido.' }, 405, cors);
      if (caminho === '/') return json({ ok: true, servico: 'franjakids-encomendas' }, 200, cors);
      return json({ erro: 'Rota desconhecida.' }, 404, cors);
    } catch (e) {
      console.error('erro não previsto', caminho, e && e.stack ? e.stack : e);
      return json({ erro: 'Não conseguimos tratar o pedido agora. Tenta outra vez daqui a pouco.' }, 500);
    }
  },
};
