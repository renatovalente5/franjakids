/* AS ENCOMENDAS NUM OBJECTO DURÁVEL (11 nov 2026, da revisão a fundo das encomendas).
 *
 * PORQUÊ: o KV é eventualmente consistente. Lida noutro sítio do mundo, uma encomenda pode vir com
 * até 60 s de atraso (medido: ~50 s, entre o webhook da Stripe e o painel). Ler-mudar-gravar sobre
 * isso perdia escritas:
 *   - uma nota do painel logo a seguir ao pagamento voltava a pôr «pendente» por cima do «paga»;
 *   - anular uma pendente fechava a página da Stripe, e o «expired», que chega num segundo, lia
 *     «pendente» e gravava «expirou» por cima da anulação, com emails;
 *   - duas mudanças de estado ao mesmo tempo davam 200 as duas, e uma perdia-se.
 *
 * AGORA cada encomenda tem um objecto (o nome é o id, na jurisdição da UE): a verdade é dele, e lê-se
 * sempre a de agora. Cada escrita leva a versão que leu (`versao`); se outra passou entretanto, o
 * objecto recusa (conflito) e quem escreve volta a ler e a fazer (encomenda.js, alterarEncomenda).
 * O KV fica com uma cópia de cada versão, escrita AQUI DENTRO e pela ordem das versões: é dela que se
 * faz a lista do painel (os metadados). As encomendas de antes do objecto lêem-se do KV até à
 * primeira escrita, que as passa para cá.
 *
 * O objecto apaga-se sozinho TTL_ENCOMENDA depois da última escrita (o mesmo prazo do KV: 400 dias),
 * com um alarme.
 *
 * O CONTADOR (a outra classe): quantos emails de encomendas por pagar recebeu um endereço hoje — o
 * travão para que ninguém use a loja para mandar emails a quem quiser (email.js). */

import { chaveKV, metadadosDe, TTL_ENCOMENDA } from './encomenda.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

/* A cópia no KV de uma versão da encomenda (com os metadados da lista do painel). */
export async function espelhar(env, enc) {
  await env.ORDERS.put(chaveKV(enc.encomenda), JSON.stringify(enc), { expirationTtl: TTL_ENCOMENDA, metadata: metadadosDe(enc) });
}

export class Encomenda {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    let corpo;
    try { corpo = await request.json(); } catch { return json({ erro: 'pedido' }, 400); }
    const s = this.ctx.storage;
    if (corpo.op === 'ler') return json({ enc: (await s.get('enc')) ?? null });
    if (corpo.op !== 'gravar' || !corpo.enc || typeof corpo.enc !== 'object') return json({ erro: 'operação' }, 400);
    /* Conferir a versão, gravar e copiar para o KV são um passo só: nenhum outro pedido entra a meio
       (sem isto, a cópia de uma versão antiga podia chegar ao KV depois da nova). */
    let resposta;
    await this.ctx.blockConcurrencyWhile(async () => {
      const actual = (await s.get('enc')) ?? null;
      const agora = actual ? Number(actual.versao) || 0 : 0;
      if ((Number(corpo.versao) || 0) !== agora) { resposta = { conflito: true, enc: actual }; return; }
      const novo = { ...corpo.enc, versao: agora + 1 };
      await s.put('enc', novo);
      await s.setAlarm(Date.now() + TTL_ENCOMENDA * 1000);
      let kv = true;
      try { await espelhar(this.env, novo); } catch (e) { kv = false; console.error('CÓPIA NO KV POR GRAVAR', novo.encomenda, e.message); }
      resposta = { enc: novo, kv };
    });
    return json(resposta);
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

/* Quantos se contaram hoje (o dia UTC) com este nome, e conta mais um se ainda não chegou ao `max`.
   → { ok, n } */
export class Contador {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    let corpo;
    try { corpo = await request.json(); } catch { return json({ erro: 'pedido' }, 400); }
    const max = Number(corpo.max) || 0;
    const dia = new Date().toISOString().slice(0, 10);
    let resposta;
    await this.ctx.blockConcurrencyWhile(async () => {
      const c = (await this.ctx.storage.get('c')) ?? { dia, n: 0 };
      const n = c.dia === dia ? c.n : 0;
      if (n >= max) { resposta = { ok: false, n }; return; }
      await this.ctx.storage.put('c', { dia, n: n + 1 });
      await this.ctx.storage.setAlarm(Date.now() + 2 * 86400 * 1000);
      resposta = { ok: true, n: n + 1 };
    });
    return json(resposta);
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

/* O objecto de um nome, na jurisdição da UE (os dados pessoais ficam na UE). O workerd local (o
   wrangler dev) não tem jurisdições: só aí (ENCOMENDAS_LOCAL=1, nunca no wrangler.toml) vai sem ela —
   memória do-jurisdicao-no-workerd. Em produção, uma recusa rebenta: nunca cai para fora da UE. */
export function objecto(env, binding, nome) {
  const ns = env[binding];
  if (!ns) throw new Error(`sem a ligação ${binding}`);
  let eu;
  try {
    eu = ns.jurisdiction('eu');
  } catch (e) {
    if (env.ENCOMENDAS_LOCAL !== '1') throw e;
    return ns.get(ns.idFromName(nome));
  }
  return eu.get(eu.idFromName(nome));
}

export async function pedirAoObjecto(env, binding, nome, corpo) {
  const r = await objecto(env, binding, nome).fetch('https://objecto.interno/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(`o objecto ${binding} respondeu ${r.status}`);
  return r.json();
}
