/* AS ROTAS DO PAINEL (§5 do contrato): o painel (renatovalente5/franjakids-painel) nunca lê o KV;
 * fala com estas rotas com `Authorization: Bearer <PAINEL_SEGREDO>` (o mesmo segredo nos dois
 * Workers). Sem o segredo, 401; sem CORS (é servidor a servidor).
 *
 *   GET  /painel/saude
 *   GET  /painel/encomendas?estado=&desde=&ate=&q=&pagina=
 *   GET  /painel/encomendas/<id>
 *   POST /painel/encomendas/<id>/estado   { estado, nota?, por, avisar? }
 *   POST /painel/encomendas/<id>/nota     { texto, por }
 */

import { json, lerCorpoJson } from './http.js';
import { lerEncomenda, alterarEncomenda, mudarEstado, razaoParaNao, resumoDeMetadados, RE_ID, iguais, agoraISO } from './encomenda.js';
import { lerCatalogo, modoDe } from './catalogo.js';
import { avisar } from './email.js';
import { limpar } from './contas.js';
import { stripeFetch } from './stripe.js';

const POR_PAGINA = 200;
/* As transições do painel que avisam o cliente (§6). «levantada» não manda nada. */
const AVISAM = ['paga', 'pronta', 'enviada', 'anulada'];

export async function rotaPainel(request, env, url, caminho) {
  if (!env.PAINEL_SEGREDO) return json({ erro: 'O painel não está ligado: falta o PAINEL_SEGREDO no Worker.' }, 503);
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  if (!m || !iguais(m[1].trim(), env.PAINEL_SEGREDO)) return json({ erro: 'Não autorizado.' }, 401);

  const resto = caminho.slice('/painel'.length);
  if (resto === '/saude') return request.method === 'GET' ? saude(env) : json({ erro: 'Método não permitido.' }, 405);
  if (resto === '/encomendas') return request.method === 'GET' ? listar(env, url) : json({ erro: 'Método não permitido.' }, 405);
  const r = /^\/encomendas\/([^/]+)(?:\/(estado|nota))?$/.exec(resto);
  if (!r) return json({ erro: 'Rota desconhecida.' }, 404);
  const id = r[1];
  if (!RE_ID.test(id)) return json({ erro: 'Encomenda não encontrada.' }, 404);
  if (!r[2]) {
    if (request.method !== 'GET') return json({ erro: 'Método não permitido.' }, 405);
    const enc = await lerEncomenda(env, id);
    return enc ? json(enc) : json({ erro: 'Encomenda não encontrada.' }, 404);
  }
  if (request.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  return r[2] === 'estado' ? mudar(request, env, id) : anotar(request, env, id);
}

/* ---------------------------------------------------------------- saúde
   O que está ligado (booleanos, nunca os valores), e se o catálogo publicado se lê: é a resposta
   que diz porque é que as encomendas pararam (memória wrangler-deploy-apaga-vars). */

async function saude(env) {
  const out = {
    ok: true,
    modo: null,
    stripe: Boolean(env.STRIPE_SECRET_KEY),
    webhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
    email: Boolean((env.EMAIL && typeof env.EMAIL.send === 'function') || env.RESEND_API_KEY),
    dona: Boolean(env.STORE_EMAIL),
    catalogo: 'ok',
  };
  try {
    out.modo = modoDe(await lerCatalogo(env), env);
  } catch (e) {
    out.catalogo = e.message;
    out.modo = env.MODO === 'encomenda' ? 'encomenda' : null;
  }
  return json(out);
}

/* ---------------------------------------------------------------- a lista */

/* Todas as chaves order:, com os metadados (o list() dá 1 000 de cada vez). A lista do painel
   faz-se SÓ dos metadados: ler cada encomenda esgotava os subpedidos de um pedido. Por isso uma
   mudança de estado pode levar até 60 s a aparecer na lista (o list() do KV atrasa-se); a ficha é a
   de agora (lê o objecto da encomenda: objecto.js). */
async function todasAsChaves(env) {
  const chaves = [];
  let cursor;
  do {
    const r = await env.ORDERS.list({ prefix: 'order:', cursor, limit: 1000 });
    chaves.push(...(r.keys || []));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return chaves;
}

/* Sem acentos nem maiúsculas, para a procura (\p{M}: as marcas que a NFD separa das letras). */
export const normalizar = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const soAlgarismos = (s) => String(s || '').replace(/\D/g, '');

export function corresponde(nome, m, texto) {
  const id = nome.replace(/^order:/, '');
  if (normalizar(id).includes(texto)) return true;
  if (!m) return false;
  if (normalizar(m.nome).includes(texto) || normalizar(m.email).includes(texto)) return true;
  const algarismos = soAlgarismos(texto);
  return algarismos.length >= 3 && soAlgarismos(m.telefone).includes(algarismos);
}

/* O dia (de Lisboa) de uma encomenda está no id: FK-AAAAMMDD-…. */
const diaDe = (nome) => { const r = /^order:FK-(\d{4})(\d{2})(\d{2})-/.exec(nome); return r ? `${r[1]}-${r[2]}-${r[3]}` : ''; };
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

async function listar(env, url) {
  const q = url.searchParams;
  const estado = q.get('estado') || '';
  const desde = RE_DIA.test(q.get('desde') || '') ? q.get('desde') : '';
  const ate = RE_DIA.test(q.get('ate') || '') ? q.get('ate') : '';
  const texto = normalizar(q.get('q'));
  const pagina = Math.max(1, parseInt(q.get('pagina') || '1', 10) || 1);

  let itens = (await todasAsChaves(env)).map((k) => ({ nome: k.name, m: k.metadata || null }));
  if (estado) itens = itens.filter((x) => x.m && x.m.estado === estado);
  if (desde) itens = itens.filter((x) => diaDe(x.nome) >= desde);
  if (ate) itens = itens.filter((x) => diaDe(x.nome) <= ate);
  if (texto) itens = itens.filter((x) => corresponde(x.nome, x.m, texto));
  // As mais recentes primeiro: pela hora de criação (o id só ordena por dia).
  itens.sort((a, b) => {
    const ca = (a.m && a.m.criada_em) || diaDe(a.nome), cb = (b.m && b.m.criada_em) || diaDe(b.nome);
    return cb < ca ? -1 : cb > ca ? 1 : (b.nome < a.nome ? -1 : 1);
  });
  const total = itens.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const fatia = itens.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  return json({ encomendas: fatia.map((x) => resumoDeMetadados(x.nome, x.m)), pagina, paginas, total });
}

/* ---------------------------------------------------------------- mudar o estado */

/* Uma encomenda «pendente» tem a página da Stripe aberta (dura uma hora). Quando a dona a anula, ou
   a marca paga por outro meio, a página fecha-se, para a pessoa não pagar uma encomenda anulada nem
   pagar duas vezes. Se a Stripe recusar (a página já fechou, ou a pessoa pagou nesse instante),
   segue na mesma: um pagamento que chegue a uma encomenda anulada tem o seu caminho no webhook (a
   loja é avisada para o devolver). */
async function fecharPaginaDaStripe(env, id, sessao) {
  if (!sessao || !env.STRIPE_SECRET_KEY) return;
  try {
    await stripeFetch(env, `/checkout/sessions/${encodeURIComponent(sessao)}/expire`, { method: 'POST' });
  } catch (e) {
    console.error('a página da Stripe não fechou', id, sessao, e.status, e.message);
  }
}

/* MUDAR O ESTADO, sem perder outra escrita (alterarEncomenda). A ordem importa (11 nov 2026, da
   revisão a fundo): primeiro GRAVA-SE o estado novo; só depois se fecha a página da Stripe (o
   «expired» que ela manda logo a seguir encontra a encomenda já anulada, ou paga, e não lhe mexe —
   antes, lia «pendente» e gravava «expirou» por cima, com emails); por fim, o email, cujo resultado
   se junta às marcas. Se a encomenda mudou entre a leitura e a escrita (outro aparelho, um pagamento
   que chegou), a mudança não se faz: 409, com o estado de agora — quem pediu decidiu sobre outro. */
async function mudar(request, env, id) {
  const { corpo, resposta } = await lerCorpoJson(request);
  if (resposta) return resposta;
  const novo = typeof corpo.estado === 'string' ? corpo.estado : '';
  const por = limpar(corpo.por, 160) || 'painel';
  const nota = limpar(corpo.nota, 1000, { linhas: true });
  const avisarCliente = !(corpo.avisar === false || corpo.avisar === 'false');
  const em = agoraISO();
  let visto = null;   // o estado da 1.ª leitura: foi sobre esse que se decidiu
  let antes = null;
  const r = await alterarEncomenda(env, id, (enc) => {
    if (visto === null) visto = enc.estado;
    else if (enc.estado !== visto) return { razao: `A encomenda mudou entretanto: está «${enc.estado}». Veja-a outra vez antes de a mudar.`, parar: true };
    const razao = razaoParaNao(enc, novo);
    if (razao) return { razao, parar: true };
    antes = { estado: enc.estado, sessao: enc.stripe && enc.stripe.session_id };
    mudarEstado(enc, novo, { por, nota, em });
    return {};
  }, { em });
  if (!r.enc) return json({ erro: 'Encomenda não encontrada.' }, 404);
  if (r.razao) return json({ erro: r.razao }, 409);

  if (antes.estado === 'pendente') await fecharPaginaDaStripe(env, id, antes.sessao);
  let enc = r.enc;
  // Um email que falhe não desfaz a mudança (a dona pediu-a): fica registado em `avisos`, e o painel mostra-o.
  if (avisarCliente && AVISAM.includes(novo)) {
    const resultado = await avisar(env, novo, enc, { nota, origem: 'painel' });
    // com a mesma hora da mudança: o email faz parte dela (actualizada_em continua a ser a da linha do histórico)
    const r2 = await alterarEncomenda(env, id, (x) => { x.avisos = { ...(x.avisos || {}), [novo]: resultado }; return {}; }, { em });
    if (r2.enc) enc = r2.enc;
  }
  return json(enc);
}

/* ---------------------------------------------------------------- uma nota */

async function anotar(request, env, id) {
  const { corpo, resposta } = await lerCorpoJson(request);
  if (resposta) return resposta;
  const texto = limpar(corpo.texto, 1000, { linhas: true });
  if (!texto) return json({ erro: 'Escreva a nota.', campo: 'texto' }, 400);
  const por = limpar(corpo.por, 160) || 'painel';
  const em = agoraISO();
  // a nota junta-se à encomenda de AGORA (antes, gravada por cima de uma leitura atrasada, apagava um pagamento)
  const r = await alterarEncomenda(env, id, (enc) => { enc.notas_painel = [...(enc.notas_painel || []), { em, por, texto }]; return {}; }, { em });
  if (!r.enc) return json({ erro: 'Encomenda não encontrada.' }, 404);
  return json(r.enc);
}
