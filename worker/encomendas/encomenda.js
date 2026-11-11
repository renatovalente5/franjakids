/* A ENCOMENDA: a forma (docs/ENCOMENDAS.md, §4), os ids, a chave, os estados e as vistas.
 *
 * A VERDADE DE CADA ENCOMENDA ESTÁ NO OBJECTO DURÁVEL DELA (objecto.js, desde 11 nov 2026): lê-se
 * sempre a de agora, e cada escrita confere a versão. O KV guarda uma cópia, para a lista do painel.
 *
 * Chaves do namespace ORDERS (só este Worker escreve; o painel lê pelas rotas /painel/…):
 *   order:<id>       a cópia da encomenda, com os metadados da lista, 400 dias (cada escrita renova)
 *   session:<cs_…>   → <id>   (modo «online»: a página da Stripe que a abriu)
 *   pi:<pi_…>        → <id>   (modo «online»: o pagamento; é por ele que um reembolso chega cá)
 *   evt:<evt_…>      → 1, 30 dias (um webhook repetido não repete emails)
 *
 * Cada escrita conta para a quota do KV, que é da conta inteira (1 000 por dia no plano gratuito):
 * grava-se o menos possível, e nunca por pedidos que não dão em nada.
 */

import { cortar } from './contas.js';
import { pedirAoObjecto } from './objecto.js';

export const TTL_ENCOMENDA = 400 * 86400;
export const TTL_EVENTO = 30 * 86400;

/* Sem 0/O/1/I: os ids dizem-se por mensagem e escrevem-se à mão. */
export const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const RE_ID = /^FK-\d{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
export const RE_CHAVE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{20}$/;

/* 256 = 8 × 32: o resto por 32 não favorece nenhuma letra. */
export function aleatorio(n) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join('');
}
/* FK-AAAAMMDD-XXXXXX: a data (de Lisboa) à frente faz os ids ordenarem por dia no list(). */
export const novoId = (hoje) => `FK-${String(hoje).replace(/-/g, '')}-${aleatorio(6)}`;
export const novaChave = () => aleatorio(20);

/* Comparação em tempo constante: a chave de uma encomenda (e o segredo do painel) não se adivinha
   letra a letra pelo tempo de resposta. */
export function iguais(a, b) {
  const x = String(a ?? ''), y = String(b ?? '');
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

export const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';
export const agoraISO = () => new Date().toISOString();

/* ---------------------------------------------------------------- estados */

export const ESTADOS = Object.freeze(['registada', 'pendente', 'paga', 'pronta', 'enviada', 'levantada', 'anulada', 'reembolsada', 'falhou', 'expirou']);

/* As transições que o painel pode pedir (§4). As da Stripe são do webhook (stripe.js,
   aplicarEvento). Os finais (levantada, anulada, reembolsada) não mudam mais. Ao contrário da LF
   Mobile, «registada» não passa a «pronta»: a Franja Kids só produz depois do pagamento. */
export const TRANSICOES_PAINEL = Object.freeze({
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

/* A entrega em mão (a zona sem morada) fica «pronta» e é «levantada»; as outras são «enviada»
   pelos CTT. */
export const ENTREGA_EM_MAO = 'mao';
const SO_EM_MAO = ['pronta', 'levantada'];
const SO_POR_CORREIO = ['enviada'];

/* A razão de uma transição do painel não se poder fazer, ou null quando pode. As frases são para
   a dona, no painel. */
export function razaoParaNao(enc, novo) {
  if (!ESTADOS.includes(novo)) return 'Esse estado não existe.';
  const emMao = enc.entrega === ENTREGA_EM_MAO;
  if (novo === 'pronta' && !emMao) return 'Só uma encomenda com entrega em mão fica «pronta»; uma que segue pelos CTT marca-se «enviada».';
  if (novo === 'levantada' && !emMao) return 'Só uma encomenda com entrega em mão se marca «levantada».';
  if (novo === 'enviada' && emMao) return 'Uma encomenda com entrega em mão não se marca «enviada»: marque-a «pronta» e, depois, «levantada».';
  if (enc.estado === novo) return `A encomenda já está «${novo}».`;
  // Só as transições que fazem sentido para ESTA entrega: a mensagem lista-as.
  const permitidas = (TRANSICOES_PAINEL[enc.estado] || []).filter((e) => !(emMao ? SO_POR_CORREIO : SO_EM_MAO).includes(e));
  if (!permitidas.includes(novo)) {
    return permitidas.length
      ? `De «${enc.estado}» só se passa a ${permitidas.map((e) => `«${e}»`).join(', ')}.`
      : `Uma encomenda «${enc.estado}» não muda mais de estado.`;
  }
  return null;
}

/* Muda o estado e acrescenta a linha ao histórico (`por`: site, stripe, ou o email de quem marcou
   no painel; `nota` opcional). */
export function mudarEstado(enc, estado, { por, nota = '', em = agoraISO() } = {}) {
  enc.estado = estado;
  const linha = { em, estado, por: por || 'painel' };
  if (nota) linha.nota = nota;
  enc.historico = [...(enc.historico || []), linha];
  enc.actualizada_em = em;
  return enc;
}

/* Uma linha no histórico sem mudar o estado (um reembolso parcial, um pagamento que chega a uma
   encomenda já anulada): é informação, não um estado. */
export function anotarHistorico(enc, { por, nota, em = agoraISO() }) {
  enc.historico = [...(enc.historico || []), { em, estado: enc.estado, por, nota }];
  return enc;
}

/* ---------------------------------------------------------------- a encomenda */

/* A encomenda nova, com a forma do §4. `pedido` vem de contas.js (validarPedido). Os opcionais
   ausentes ficam ausentes (as `notas` sem texto não se gravam). */
export function criarEncomenda({ id, chave, modo, estado, pedido, termosPagina, em = agoraISO() }) {
  const { zona, contas, cliente, oferta, notas } = pedido;
  return {
    v: 1,
    encomenda: id,
    chave,
    modo,
    estado,
    entrega: zona.id,
    linhas: contas.linhas,
    artigos_cents: contas.artigos_cents,
    portes_cents: contas.portes_cents,
    portes_por_confirmar: contas.portes_por_confirmar,
    // o cupão: o código, o desconto e se tirou os portes; cupao_contado = o uso está reservado (cupoes.js)
    ...(contas.cupao ? { cupao: contas.cupao, desconto_cents: contas.desconto_cents, ...(contas.cupao_portes ? { cupao_portes: true } : {}), cupao_contado: true } : {}),
    total_cents: contas.total_cents,
    cliente,
    oferta,
    ...(notas ? { notas } : {}),
    termos: { aceites_em: em, pagina: termosPagina },
    historico: [{ em, estado, por: 'site' }],
    criada_em: em,
    actualizada_em: em,
  };
}

/* ---------------------------------------------------------------- guardar (o objecto e o KV) */

export const chaveKV = (id) => `order:${id}`;

/* A encomenda como está AGORA: a do objecto dela (objecto.js); uma de antes do objecto, do KV (até à
   primeira escrita, que a passa para o objecto). Traz `versao`, que a escrita seguinte devolve. */
export async function lerEncomenda(env, id) {
  const { enc } = await pedirAoObjecto(env, 'ENCOMENDA', id, { op: 'ler' });
  if (enc) return enc;
  const bruto = await env.ORDERS.get(chaveKV(id));
  return bruto ? JSON.parse(bruto) : null;
}

/* Os metadados da chave: o que a lista do painel precisa SEM ler cada encomenda (uma leitura por
   encomenda esgotava os subpedidos de um pedido do Worker). A Cloudflare aceita 1 024 BYTES de
   metadados — bytes de UTF-8, e não o .length (um «ã» ou um «»» são 2 bytes, um emoji 4): mede-se
   com o TextEncoder, corta-se o que for preciso e diz-se quantas linhas ficaram de fora. */
export const MAX_METADADOS = 1000;
const bytesDe = (o) => new TextEncoder().encode(JSON.stringify(o)).length;
export function metadadosDe(enc) {
  const c = enc.cliente || {};
  const base = {
    estado: enc.estado,
    modo: enc.modo,
    entrega: enc.entrega,
    total_cents: enc.total_cents,
    criada_em: enc.criada_em,
    actualizada_em: enc.actualizada_em,
    nome: cortar(c.nome || '', 60),
    telefone: cortar(c.telefone || '', 20),
    email: cortar(c.email || '', 80),
  };
  const todas = (enc.linhas || []).map((l) => [cortar(l.nome || '', 50), l.qtd]);
  let m = { ...base, linhas: todas };
  for (let n = todas.length - 1; n >= 0 && bytesDe(m) > MAX_METADADOS; n--) {
    m = { ...base, linhas: todas.slice(0, n), mais: todas.length - n };
  }
  return m;
}

/* Outra escrita passou entre a leitura e esta escrita: volta-se a ler e a fazer (alterarEncomenda). */
export class Conflito extends Error {
  constructor(id) { super(`a encomenda ${id} mudou entretanto`); this.name = 'Conflito'; }
}

/* Grava a encomenda SE ninguém a mudou desde que se leu (a `versao` que trouxe; uma nova vai com 0).
   O objecto copia-a para o KV. Lança Conflito quando outra escrita passou primeiro. */
export async function gravarEncomenda(env, enc, { em = agoraISO() } = {}) {
  enc.actualizada_em = em;
  const r = await pedirAoObjecto(env, 'ENCOMENDA', enc.encomenda, { op: 'gravar', enc, versao: Number(enc.versao) || 0 });
  if (r.conflito) throw new Conflito(enc.encomenda);
  enc.versao = r.enc.versao;
  return enc;
}

/* LER, MUDAR E GRAVAR SEM PERDER A ESCRITA DE OUTRO: `fn(enc)` muda a encomenda (a de agora) e devolve
   o que quiser; com `{ parar: true }` não se grava nada. Se outra escrita passou entretanto, lê-se
   outra vez e repete-se o `fn` (até 6 vezes). → { enc, ...o que o fn devolveu }; { enc: null } se a
   encomenda não existe. O `fn` pode repetir-se: não deve mandar emails nem mudar nada fora dela. */
export async function alterarEncomenda(env, id, fn, { em } = {}) {
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const enc = await lerEncomenda(env, id);
    if (!enc) return { enc: null };
    const r = (await fn(enc)) || {};
    if (r.parar) return { ...r, enc };
    try {
      await gravarEncomenda(env, enc, { em: em || agoraISO() });
      return { ...r, enc };
    } catch (e) {
      if (!(e instanceof Conflito)) throw e;
    }
  }
  throw new Error(`a encomenda ${id} não se gravou: escritas ao mesmo tempo de mais`);
}

/* Um id que ainda não existe (uma colisão em 32^6 por dia é improvável, mas uma leitura custa pouco
   e evita gravar por cima da encomenda de outra pessoa; a escrita nova também confere: versão 0). */
export async function idLivre(env, hoje) {
  for (let i = 0; i < 5; i++) {
    const id = novoId(hoje);
    if (!(await lerEncomenda(env, id))) return id;
  }
  throw new Error('não se arranjou um id livre');
}

/* ---------------------------------------------------------------- vistas */

/* O que o site lê (§3): só o que a pessoa já sabe. Sem email, telefone, morada, NIF, notas nem a
   chave; do nome, só o primeiro. */
export function vistaPublica(enc) {
  return {
    encomenda: enc.encomenda,
    estado: enc.estado,
    modo: enc.modo,
    entrega: enc.entrega,
    portes_por_confirmar: Boolean(enc.portes_por_confirmar),
    linhas: (enc.linhas || []).map((l) => ({ nome: l.nome, qtd: l.qtd, total_cents: l.total_cents, escolhas: l.escolhas || [] })),
    artigos_cents: enc.artigos_cents,
    portes_cents: enc.portes_cents,
    ...(enc.cupao ? { cupao: enc.cupao, desconto_cents: enc.desconto_cents || 0, ...(enc.cupao_portes ? { cupao_portes: true } : {}) } : {}),
    total_cents: enc.total_cents,
    cliente: { nome: primeiroNome((enc.cliente || {}).nome) },
  };
}

/* O resumo da lista do painel (§5), feito dos metadados da chave. */
export function resumoDeMetadados(nome, m) {
  const id = nome.replace(/^order:/, '');
  if (!m) return { encomenda: id };
  const r = {
    encomenda: id,
    estado: m.estado,
    modo: m.modo,
    entrega: m.entrega,
    total_cents: m.total_cents,
    cliente: { nome: m.nome || '', telefone: m.telefone || '' },
    criada_em: m.criada_em,
    actualizada_em: m.actualizada_em,
    linhas: (m.linhas || []).map(([n, qtd]) => ({ nome: n, qtd })),
  };
  if (m.mais) r.linhas_a_mais = m.mais;
  return r;
}
