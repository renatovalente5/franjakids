/* O AVISO DE STOCK (20 nov 2026). O Samuel, no WhatsApp: «os clientes podem receber um email quando uma peça
 * esgotada voltar?»; o Renato: sim, «com um botão ao lado do stock no Backoffice para escolher notificar, porque
 * pode haver vezes que não queiras notificar». O contrato está em docs/MENU-E-CATEGORIAS.md, §6.
 *
 * O SITE: na ficha de um produto esgotado (ou com um tamanho, uma cor ou uma escolha esgotados), a cliente deixa o
 * email: POST /aviso { produto, variante: { grupo, valor } | null, email } (index.js). O pedido só se guarda se o
 * que se pede existe e está mesmo esgotado no catálogo publicado (o que já há, compra-se).
 *
 * O PAINEL: vê quantos esperam por produto e por escolha (GET /painel/avisos, sem os emails) e, quando a loja
 * quiser, avisa (POST /painel/avisos/<produto>/enviar): só quem pediu o que JÁ NÃO está esgotado no catálogo
 * publicado; cada um recebe um email (email.js, emailDeStock) e o pedido apaga-se. Os que falharem ficam para a
 * próxima vez. Uma escolha que continua esgotada fica à espera.
 *
 * O OBJECTO DURÁVEL (Avisos, um só, na UE — objecto.js): os pedidos e os contadores mudam num passo só, sem outro
 * pedido a meio. Os travões (a revisão de 20 nov 2026: sem eles, um script enchia o objecto e um clique mandava
 * milhares de emails): um email pede cada coisa uma vez (repetir não junta nada); MAX_POR_EMAIL pedidos à espera
 * por email, contado como pessoa (emailCanonico: ana+1@gmail.com é a ana@gmail.com); MAX_POR_PRODUTO por produto
 * e MAX_TOTAL no objecto; o travão por IP do /checkout (outra chave; no IPv6, a rede /64 inteira); e cada clique
 * no painel manda no máximo MAX_POR_ENVIO emails (os outros ficam para o clique seguinte). Cada pedido sai logo a
 * seguir ao seu email: um envio que pára a meio não repete os que já foram. Um pedido dura DURACAO_DIAS (6 meses):
 * os mais velhos apagam-se no primeiro pedido de cada dia. O email guarda-se só para o aviso (a política de
 * privacidade di-lo) e nunca vai para o painel.
 *
 * No objecto: `p:<produto>:<id>` → { produto, variante, email, em, a_enviar? } (o id: o resumo do email e da
 * escolha, que não deixa repetir), `e:<resumo do email>` → quantos à espera, `total`, `limpo_em`. */

import { pedirAoObjecto } from './objecto.js';
import { emailCanonico } from './cupoes.js';

export const MAX_POR_EMAIL = 10;
export const MAX_POR_PRODUTO = 300;
export const MAX_TOTAL = 3000;
export const MAX_POR_ENVIO = 50;
export const DURACAO_DIAS = 183;
const DIA_MS = 24 * 3600 * 1000;
/* Um envio que começou e não acabou (o painel fechou a meio) não prende os pedidos para sempre. */
const RESERVA_MS = 10 * 60 * 1000;
const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const eObjecto = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const temProprio = (o, k) => eObjecto(o) && Object.prototype.hasOwnProperty.call(o, k);

/* A escolha de um pedido, limpa: null (o produto inteiro) ou { grupo, valor } com textos curtos. Lixo → undefined. */
export function varianteDe(v) {
  if (v === null || v === undefined) return null;
  if (!eObjecto(v) || typeof v.grupo !== 'string' || typeof v.valor !== 'string') return undefined;
  const grupo = v.grupo.trim().slice(0, 60);
  const valor = v.valor.trim().slice(0, 80);
  return grupo && valor ? { grupo, valor } : undefined;
}

/* A escolha existe no produto (a entrada do catálogo publicado)? */
export function existe(p, variante) {
  if (!eObjecto(p)) return false;
  if (!variante) return true;
  const { grupo, valor } = variante;
  if (grupo === 'Tamanho') return Array.isArray(p.tamanhos) && p.tamanhos.includes(valor);
  if (grupo === 'Cor') return (Array.isArray(p.cores) ? p.cores : []).some((c) => eObjecto(c) && c.nome === valor);
  const g = (Array.isArray(p.opcoes) ? p.opcoes : []).find((x) => eObjecto(x) && x.nome === grupo);
  return Boolean(g && Array.isArray(g.valores) && g.valores.some((x) => eObjecto(x) && x.nome === valor));
}

/* Compra-se agora (o produto à venda, com preço, sem estar esgotado, e a escolha também)? É o que decide quem
   recebe o aviso. */
export function disponivel(p, variante) {
  if (!eObjecto(p) || typeof p.preco !== 'number' || p.esgotado === true || !existe(p, variante)) return false;
  if (!variante) return true;
  const { grupo, valor } = variante;
  if (grupo === 'Tamanho') return !(Array.isArray(p.tamanhosEsgotados) ? p.tamanhosEsgotados : []).includes(valor);
  if (grupo === 'Cor') return p.cores.some((c) => eObjecto(c) && c.nome === valor && c.esgotado !== true);
  return p.opcoes.find((x) => eObjecto(x) && x.nome === grupo).valores.some((x) => eObjecto(x) && x.nome === valor && x.esgotado !== true);
}

/* O resumo de um texto (SHA-256, em hexadecimal): o id de um pedido e a chave do contador de um email, sem o email. */
async function resumo(texto, n = 32) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, n);
}
/* O email como pessoa (cupoes.js, emailCanonico): o contador e o id do pedido não se enganam com «+1» nem com pontos
   no Gmail. Guarda-se o email como foi escrito, para o aviso. */
export const resumoDoEmail = (email) => resumo(`franjakids-aviso:${emailCanonico(email)}`);
export const idDoPedido = async (email, variante) => resumo(`${emailCanonico(email)}|${variante ? `${variante.grupo}=${variante.valor}` : '*'}`, 24);

/* ---------------------------------------------------------------- o objecto durável */

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

export class Avisos {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    let c;
    try { c = await request.json(); } catch { return json({ erro: 'pedido' }, 400); }
    const s = this.ctx.storage;
    const agora = Number.isFinite(c.agora) ? c.agora : Date.now();
    let resposta = { erro: 'operação' };
    await this.ctx.blockConcurrencyWhile(async () => {
      const baixar = async (pedido) => {
        const k = `e:${await resumoDoEmail(pedido.email)}`;
        const n = ((await s.get(k)) || 1) - 1;
        if (n > 0) await s.put(k, n); else await s.delete(k);
        await s.put('total', Math.max(0, ((await s.get('total')) || 1) - 1));
      };
      // os pedidos com mais de DURACAO_DIAS saem (uma vez por dia, no primeiro pedido)
      if ((await s.get('limpo_em') || 0) < agora - DIA_MS) {
        for (const [k, v] of await s.list({ prefix: 'p:' })) {
          if (!eObjecto(v) || Date.parse(v.em) < agora - DURACAO_DIAS * DIA_MS) { await s.delete(k); if (eObjecto(v)) await baixar(v); }
        }
        await s.put('limpo_em', agora);
      }

      if (c.op === 'pedir') {
        if (typeof c.produto !== 'string' || !RE_SLUG.test(c.produto) || typeof c.email !== 'string') { resposta = { erro: 'pedido' }; return; }
        const k = `p:${c.produto}:${await idDoPedido(c.email, c.variante)}`;
        if (await s.get(k)) { resposta = { ok: true, ja: true }; return; }
        const ke = `e:${await resumoDoEmail(c.email)}`;
        const doEmail = (await s.get(ke)) || 0;
        const total = (await s.get('total')) || 0;
        if (doEmail >= MAX_POR_EMAIL) { resposta = { erro: 'cheio', de: 'email' }; return; }
        if (total >= MAX_TOTAL || (await s.list({ prefix: `p:${c.produto}:`, limit: MAX_POR_PRODUTO })).size >= MAX_POR_PRODUTO) { resposta = { erro: 'cheio', de: 'loja' }; return; }
        await s.put(k, { produto: c.produto, variante: c.variante || null, email: c.email, em: new Date(agora).toISOString() });
        await s.put(ke, doEmail + 1);
        await s.put('total', total + 1);
        resposta = { ok: true };
        return;
      }
      if (c.op === 'contar') {
        // quantos esperam, por produto e por escolha (sem os emails); sem protótipo: um produto «constructor» é um produto
        const avisos = Object.create(null);
        for (const [, v] of await s.list({ prefix: 'p:' })) {
          if (!eObjecto(v)) continue;
          const lista = (avisos[v.produto] ||= []);
          const g = v.variante ? v.variante.grupo : null;
          const val = v.variante ? v.variante.valor : null;
          const x = lista.find((y) => y.grupo === g && y.valor === val);
          if (x) x.n += 1; else lista.push({ grupo: g, valor: val, n: 1 });
        }
        resposta = { avisos };
        return;
      }
      if (c.op === 'reservar') {
        // os pedidos do produto que se podem avisar agora (`disponiveis`: as escolhas que já não estão esgotadas,
        // como [grupo, valor], e null para o produto inteiro), no máximo `max`, marcados para este envio; os de um
        // envio a decorrer ficam de fora. `faltam`: os que se podiam avisar e ficaram para o clique seguinte.
        if (typeof c.produto !== 'string' || !RE_SLUG.test(c.produto) || !Array.isArray(c.disponiveis)) { resposta = { erro: 'pedido' }; return; }
        const max = Number.isInteger(c.max) && c.max > 0 ? c.max : MAX_POR_ENVIO;
        const pode = (v) => c.disponiveis.some((d) => (d === null ? v === null : Array.isArray(d) && v && d[0] === v.grupo && d[1] === v.valor));
        const reservados = [];
        let esperam = 0;
        let faltam = 0;
        for (const [k, v] of await s.list({ prefix: `p:${c.produto}:` })) {
          if (!eObjecto(v)) continue;
          if (!pode(v.variante || null) || (v.a_enviar && v.a_enviar > agora - RESERVA_MS)) { esperam += 1; continue; }
          if (reservados.length >= max) { faltam += 1; continue; }
          await s.put(k, { ...v, a_enviar: agora });
          reservados.push({ id: k.slice(`p:${c.produto}:`.length), email: v.email, variante: v.variante || null });
        }
        resposta = { reservados, esperam, faltam };
        return;
      }
      if (c.op === 'fechar') {
        // depois do envio: os avisados saem; os que falharam ficam, sem a marca
        if (typeof c.produto !== 'string' || !RE_SLUG.test(c.produto)) { resposta = { erro: 'pedido' }; return; }
        for (const id of Array.isArray(c.enviados) ? c.enviados : []) {
          const k = `p:${c.produto}:${id}`;
          const v = await s.get(k);
          if (!eObjecto(v)) continue;
          await s.delete(k);
          await baixar(v);
        }
        for (const id of Array.isArray(c.falharam) ? c.falharam : []) {
          const k = `p:${c.produto}:${id}`;
          const v = await s.get(k);
          if (eObjecto(v)) { const { a_enviar, ...resto } = v; await s.put(k, resto); }
        }
        resposta = { ok: true, esperam: (await s.list({ prefix: `p:${c.produto}:` })).size };
      }
    });
    return json(resposta, resposta.erro === 'pedido' || resposta.erro === 'operação' ? 400 : 200);
  }
}

/* Um pedido ao objecto dos avisos (um só para a loja toda). */
export const pedirAvisos = (env, corpo) => pedirAoObjecto(env, 'AVISOS', 'avisos', corpo);
