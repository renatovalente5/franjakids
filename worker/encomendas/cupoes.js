/* OS CUPÕES (11 nov 2026: «Já implementaste um sistema de cupões?» → «Sim, avança»). Como os da LF Mobile
 * (lfmobile/worker/encomendas/cupoes.js), mas guardados num OBJECTO DURÁVEL (Cupoes, um só, na UE) e não
 * no KV: o uso confere-se e conta-se num passo só, e dois clientes ao mesmo tempo nunca passam o limite
 * (o KV não tem escrita condicional — memória kv-ler-mudar-gravar-perde-escritas). O código nunca vai
 * para o site (o repositório é público): a dona cria-os no painel (/painel/cupoes).
 *
 * A REGRA: { codigo, tipo: 'percentagem' | 'valor' | 'portes', valor (% ou €; 0 nos portes),
 *   minimo?: € em artigos, desde?/ate?: 'AAAA-MM-DD' (dia de Lisboa), limite?: usos, porCliente?: bool,
 *   categorias?: [slug] (vazio: a loja toda), ativo: bool, nota?: da dona, criado_em, actualizado_em }
 *
 * O PERCURSO: o finalizar confere o código (POST /cupao) e mostra o desconto; o /checkout lê a regra, faz
 * as contas com ela (descontoDoCupao) e RESERVA um uso (atómico: se o limite acabou entretanto, recusa);
 * em modo «online» a Stripe recebe um cupão de uso único com o valor já calculado (stripe.js). O uso volta
 * quando a encomenda não se faz (expirou, falhou, a pessoa desistiu, a dona anulou-a); uma que se paga
 * depois de expirar volta a contar (sem limite: o dinheiro entrou).
 *
 * No objecto: `regra:<CÓDIGO>` → a regra; `usos:<CÓDIGO>` → o número; `cliente:<CÓDIGO>:<resumo>` → a
 * encomenda que o usou, quando é «um por cliente» (o resumo SHA-256 do email, nunca o email). */

import { pedirAoObjecto } from './objecto.js';

export const RE_CODIGO = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;
export const TIPOS = Object.freeze({ percentagem: 'Percentagem', valor: 'Valor fixo', portes: 'Portes grátis' });
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const eObjecto = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

/* O código como se guarda: maiúsculas, sem espaços. Inválido: ''. */
export function normalizarCodigo(c) {
  const s = String(c == null ? '' : c).trim().toUpperCase().replace(/\s+/g, '');
  return RE_CODIGO.test(s) ? s : '';
}

const eur = (v) => `${Number(v).toLocaleString('pt-PT', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })} €`;
const dia = (d) => d.split('-').reverse().join('/');

/* A frase do cupão, para o finalizar e para o painel: «10% de desconto em Bodies, nas compras a partir de
   20 €». `nomes`: { slug: nome } das categorias (do catálogo publicado). */
export function descricaoDe(r, nomes = {}) {
  const base = r.tipo === 'portes' ? 'portes grátis' : r.tipo === 'percentagem' ? `${r.valor}% de desconto` : `${eur(r.valor)} de desconto`;
  const cats = (Array.isArray(r.categorias) ? r.categorias : []).map((c) => nomes[c] || c);
  const onde = cats.length ? ` em ${cats.length > 1 ? `${cats.slice(0, -1).join(', ')} e ${cats[cats.length - 1]}` : cats[0]}` : '';
  const minimo = typeof r.minimo === 'number' && r.minimo > 0 ? `, nas compras a partir de ${eur(r.minimo)}` : '';
  return `${base}${onde}${minimo}`;
}

/* O que o site pode saber de um cupão (sem os usos, as datas nem a nota da dona). */
export function publico(r, nomes = {}) {
  return {
    codigo: r.codigo, tipo: r.tipo, valor: r.tipo === 'portes' ? 0 : r.valor,
    minimo: typeof r.minimo === 'number' && r.minimo > 0 ? r.minimo : null,
    categorias: Array.isArray(r.categorias) ? r.categorias : [],
    descricao: descricaoDe(r, nomes),
  };
}

/* Confere a regra que o painel manda gravar. `categorias`: os slugs que existem (do catálogo), ou null
   (sem catálogo não se confere a lista). → { regra } ou { erro, campo } */
export function validarRegra(bruto, { categorias = null } = {}) {
  const b = eObjecto(bruto) ? bruto : {};
  const codigo = normalizarCodigo(b.codigo);
  if (!codigo) return { erro: 'O código tem de 3 a 30 letras ou algarismos (pode ter - e _), sem espaços.', campo: 'codigo' };
  if (!Object.prototype.hasOwnProperty.call(TIPOS, b.tipo)) return { erro: 'Escolha o tipo do cupão: percentagem, valor fixo ou portes grátis.', campo: 'tipo' };
  const r = { codigo, tipo: b.tipo, ativo: b.ativo !== false };
  if (b.tipo === 'percentagem') {
    if (!Number.isInteger(b.valor) || b.valor < 1 || b.valor > 90) return { erro: 'A percentagem é um número inteiro de 1 a 90.', campo: 'valor' };
    r.valor = b.valor;
  } else if (b.tipo === 'valor') {
    if (typeof b.valor !== 'number' || !Number.isFinite(b.valor) || b.valor < 0.5 || b.valor > 1000 || Math.abs(Math.round(b.valor * 100) - b.valor * 100) > 1e-6) return { erro: 'O desconto é um valor em euros, de 0,50 a 1000 (ex.: 5 ou 7,50).', campo: 'valor' };
    r.valor = b.valor;
  } else r.valor = 0;
  if (b.minimo !== undefined && b.minimo !== null && b.minimo !== '') {
    if (typeof b.minimo !== 'number' || !Number.isFinite(b.minimo) || b.minimo < 0 || b.minimo > 100000) return { erro: 'A compra mínima é um valor em euros (ou fica vazia).', campo: 'minimo' };
    if (b.minimo > 0) r.minimo = b.minimo;
  }
  for (const k of ['desde', 'ate']) {
    if (b[k] === undefined || b[k] === null || b[k] === '') continue;
    if (typeof b[k] !== 'string' || !RE_DIA.test(b[k])) return { erro: `A data ${k === 'desde' ? 'de início' : 'de fim'} não é uma data válida.`, campo: k };
    r[k] = b[k];
  }
  if (r.desde && r.ate && r.desde > r.ate) return { erro: 'O cupão acaba antes de começar: confira as datas.', campo: 'ate' };
  if (b.limite !== undefined && b.limite !== null && b.limite !== '') {
    if (!Number.isInteger(b.limite) || b.limite < 1 || b.limite > 100000) return { erro: 'O limite de usos é um número inteiro (ou fica vazio: sem limite).', campo: 'limite' };
    r.limite = b.limite;
  }
  if (b.porCliente === true) r.porCliente = true;
  if (b.categorias !== undefined && b.categorias !== null) {
    if (!Array.isArray(b.categorias) || !b.categorias.every((c) => typeof c === 'string' && /^[a-z0-9-]{1,60}$/.test(c))) return { erro: 'As categorias do cupão não se reconhecem.', campo: 'categorias' };
    if (categorias) { const fora = b.categorias.find((c) => !categorias.includes(c)); if (fora) return { erro: `A categoria «${fora}» não existe na loja.`, campo: 'categorias' }; }
    if (b.categorias.length) r.categorias = [...new Set(b.categorias)];
  }
  if (typeof b.nota === 'string' && b.nota.trim()) r.nota = b.nota.trim().replace(/\s+/g, ' ').slice(0, 200);
  return { regra: r };
}

/* O email como pessoa, para o «um por cliente»: sem invisíveis nem maiúsculas, sem o que vem depois de um
   «+» (ana+1@… é a ana@…), e no Gmail sem os pontos (a.na@gmail.com é a ana@gmail.com). */
export function emailCanonico(email) {
  const e = String(email || '').replace(/[\p{Cc}\p{Cf}\s]/gu, '').toLowerCase();
  const i = e.lastIndexOf('@');
  if (i < 1) return e;
  const local = e.slice(0, i).split('+')[0];
  const dominio = e.slice(i + 1);
  if (dominio === 'gmail.com' || dominio === 'googlemail.com') return `${local.replace(/\./g, '')}@gmail.com`;
  return `${local}@${dominio}`;
}
export async function resumoDoEmail(email) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`franjakids-cupao:${emailCanonico(email)}`));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/* Porque é que este cupão não vale agora (a frase para o site), ou null. `usos`: os que já tem; `usado`:
   esta pessoa já o usou (só conta nos «um por cliente»); `artigos_cents` null não confere o mínimo. */
export function porQueNaoVale(r, { hoje, artigos_cents = null, usos = 0, usado = false } = {}) {
  if (!r || r.ativo === false) return 'Este cupão não existe ou já não vale.';
  if (r.desde && hoje < r.desde) return `O cupão ${r.codigo} só vale a partir de ${dia(r.desde)}.`;
  if (r.ate && hoje > r.ate) return `O cupão ${r.codigo} acabou a ${dia(r.ate)}.`;
  if (typeof r.minimo === 'number' && r.minimo > 0 && artigos_cents !== null && artigos_cents < Math.round(r.minimo * 100)) return `O cupão ${r.codigo} é para compras a partir de ${eur(r.minimo)}.`;
  if (r.limite && usos >= r.limite) return `O cupão ${r.codigo} já foi usado o número de vezes que podia.`;
  if (r.porCliente && usado) return `O cupão ${r.codigo} só se usa uma vez por pessoa, e já foi usado com este email.`;
  return null;
}

/* O DESCONTO (a mesma conta do finalizar, site.js): em cêntimos, sobre os artigos das categorias do cupão
   (todos, sem categorias); a percentagem arredonda ao cêntimo; o valor fixo nunca passa dos artigos a que
   se aplica. O de portes grátis tira os portes (desconto zero nos artigos), e com categorias só quando a
   encomenda é toda delas. `linhas`: [{ total_cents, categoria }]. → { cents, portes } */
export function descontoDoCupao(regra, linhas) {
  const cats = Array.isArray(regra.categorias) ? regra.categorias : [];
  const daCategoria = (l) => !cats.length || cats.includes(l.categoria);
  if (regra.tipo === 'portes') return { cents: 0, portes: linhas.length > 0 && linhas.every(daCategoria) };
  const base = linhas.filter(daCategoria).reduce((s, l) => s + l.total_cents, 0);
  if (regra.tipo === 'percentagem') return { cents: Math.round((base * regra.valor) / 100), portes: false };
  if (regra.tipo === 'valor') return { cents: Math.min(Math.round(regra.valor * 100), base), portes: false };
  return { cents: 0, portes: false };
}

/* ---------------------------------------------------------------- o objecto durável */

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

export class Cupoes {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    let c;
    try { c = await request.json(); } catch { return json({ erro: 'pedido' }, 400); }
    const s = this.ctx.storage;
    const codigo = normalizarCodigo(c.codigo);
    let resposta = { erro: 'operação' };
    // tudo num passo: ler, conferir e escrever sem outro pedido a meio
    await this.ctx.blockConcurrencyWhile(async () => {
      if (c.op === 'listar') {
        const regras = [...(await s.list({ prefix: 'regra:' })).values()];
        const usos = await s.get(regras.map((r) => `usos:${r.codigo}`));
        resposta = { cupoes: regras.map((r) => ({ ...r, usos: usos.get(`usos:${r.codigo}`) || 0 })) };
        return;
      }
      if (!codigo) { resposta = { erro: 'código' }; return; }
      const regra = (await s.get(`regra:${codigo}`)) ?? null;
      const usos = (await s.get(`usos:${codigo}`)) || 0;
      if (c.op === 'ler') { resposta = { regra, usos }; return; }
      if (c.op === 'gravar') {
        const agora = new Date().toISOString();
        const nova = { ...c.regra, codigo, criado_em: regra ? regra.criado_em : agora, actualizado_em: agora };
        await s.put(`regra:${codigo}`, nova);
        resposta = { regra: { ...nova, usos } };
        return;
      }
      if (c.op === 'apagar') {
        if (!regra) { resposta = { naoHa: true }; return; }
        await s.delete(`regra:${codigo}`);   // os usos e as marcas ficam: um cupão novo com o mesmo código continua a contar
        resposta = { ok: true };
        return;
      }
      const marca = c.cliente ? `cliente:${codigo}:${c.cliente}` : null;
      if (c.op === 'reservar' || c.op === 'contar') {
        const de = marca ? await s.get(marca) : null;
        if (c.op === 'reservar') {
          const erro = porQueNaoVale(regra, { hoje: c.hoje, artigos_cents: c.artigos_cents ?? null, usos, usado: Boolean(de && de !== c.encomenda) });
          if (erro) { resposta = { erro }; return; }
        }
        await s.put(`usos:${codigo}`, usos + 1);
        if (marca && regra && regra.porCliente) await s.put(marca, c.encomenda || '1');
        resposta = { ok: true, regra, usos: usos + 1 };
        return;
      }
      if (c.op === 'libertar') {
        await s.put(`usos:${codigo}`, Math.max(0, usos - 1));
        if (marca && (await s.get(marca)) === c.encomenda) await s.delete(marca);
        resposta = { ok: true, usos: Math.max(0, usos - 1) };
      }
    });
    return json(resposta, resposta.erro === 'pedido' || resposta.erro === 'operação' || resposta.erro === 'código' ? 400 : 200);
  }
}

/* Um pedido ao objecto dos cupões (um só para a loja toda). */
export const pedirCupoes = (env, corpo) => pedirAoObjecto(env, 'CUPOES', 'cupoes', corpo);

/* O uso de uma encomenda que acabou sem se fazer volta (uma vez: a marca cupao_contado sai na escrita que a
   fecha). Nunca rebenta quem chama: um uso que não volta vê-se no painel. */
export async function libertarUso(env, enc) {
  if (!enc || !enc.cupao) return;
  try {
    await pedirCupoes(env, { op: 'libertar', codigo: enc.cupao, cliente: await resumoDoEmail((enc.cliente || {}).email), encomenda: enc.encomenda });
  } catch (e) {
    console.error('o uso do cupão não voltou', enc.encomenda, enc.cupao, e.message);
  }
}
export async function contarUso(env, enc) {
  if (!enc || !enc.cupao) return;
  try {
    await pedirCupoes(env, { op: 'contar', codigo: enc.cupao, cliente: await resumoDoEmail((enc.cliente || {}).email), encomenda: enc.encomenda });
  } catch (e) {
    console.error('o uso do cupão não se contou', enc.encomenda, enc.cupao, e.message);
  }
}

/* Depois de a encomenda mudar de estado: o uso do cupão volta quando ela acaba sem se fazer (expirou,
   falhou, anulada) e volta a contar quando se paga depois disso. Muda `cupao_contado` (grava-se com a
   mudança) e diz o que fazer DEPOIS de gravar: 'libertar', 'contar' ou null. */
export function acertarCupao(x) {
  if (!x || !x.cupao) return null;
  const semEfeito = ['expirou', 'falhou', 'anulada'].includes(x.estado);
  if (semEfeito && x.cupao_contado) { x.cupao_contado = false; return 'libertar'; }
  if (!semEfeito && !['registada', 'pendente'].includes(x.estado) && !x.cupao_contado) { x.cupao_contado = true; return 'contar'; }
  return null;
}
export async function fazerAcerto(env, acerto, enc) {
  if (acerto === 'libertar') await libertarUso(env, enc);
  else if (acerto === 'contar') await contarUso(env, enc);
}
