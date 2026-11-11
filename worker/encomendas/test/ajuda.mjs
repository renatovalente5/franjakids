/* As peças comuns dos testes: o catálogo, um KV de faz-de-conta, um env, uma rede de faz-de-conta
   (o catálogo, a Stripe e o Resend respondem daqui; tudo o resto é proibido) e um pedido ao Worker.

   O CATÁLOGO: o _site/assets/catalogo.json gerado, se existir; senão a cópia test/catalogo.json (a do
   CI, onde não há _site/). O gerado é o da dona e muda no painel — preços, portes, produtos que se
   escondem —, por isso os cenários NÃO afirmam nada sobre ele (memória
   testes-do-site-com-conteudo-de-ensaio): correm sobre catalogoDeEnsaio(), que lhe põe por cima as
   zonas e os portes do cenário e produtos congelados (cópias dos verdadeiros a 9 nov 2026, com os
   preços de então, e um inventado com acréscimos). Do catálogo lido só se usa a forma, e um teste
   prova que cada produto que o site vende hoje se encomenda no Worker. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Encomenda, Contador } from '../objecto.js';
import { Cupoes } from '../cupoes.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const clone = (o) => JSON.parse(JSON.stringify(o));

export const FICHEIRO_GERADO = path.resolve(AQUI, '../../../_site/assets/catalogo.json');
export function catalogoBase() {
  for (const f of [FICHEIRO_GERADO, path.join(AQUI, 'catalogo.json')]) {
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  throw new Error('sem catálogo de teste');
}

/* Os produtos dos cenários (a forma de cada entrada do catálogo publicado: src/build.mjs,
   paraCarrinho). */
export const PRODUTOS_DE_ENSAIO = Object.freeze({
  'babygrow-com-nome': {
    nome: 'Babygrow', categoria: 'babygrows', preco: 16.9, tamanhos: ['0 meses', '1 mês', '3 meses'],
    cores: [{ nome: 'Rosa', foto: 'babygrow-com-nome-1' }, { nome: 'Azul', foto: 'babygrow-com-nome-2' }, { nome: 'Cinzento', foto: 'babygrow-com-nome-3' }],
    opcoes: [],
    personalizacao: { rotulo: 'Nome a bordar', pista: 'Até 15 letras', max: 15, obrigatoria: false, opcional: 'Bordar um nome', suplemento: 3 },
  },
  't-shirt-adulto': {
    nome: 'T-shirt de adulto personalizada', categoria: 't-shirts', preco: 15, tamanhos: ['S', 'M', 'L', 'XL'],
    cores: [{ nome: 'Branco' }, { nome: 'Preto' }, { nome: 'Azul-escuro' }], opcoes: [],
    personalizacao: { rotulo: 'Frase ou nome', pista: 'Diz-nos a ideia; mandamos a pré-visualização', max: 80, obrigatoria: true, opcional: null, suplemento: 0 },
  },
  't-shirt-promovido-a-irmao': {
    nome: 'T-shirt «Fui promovido a irmão mais velho»', categoria: 't-shirts', preco: 12, tamanhos: ['2 anos', '4 anos', '6 anos', '8 anos', '10 anos', '12 anos', '14 anos'],
    cores: [], opcoes: [{ nome: 'Texto', valores: [{ nome: 'Irmão mais velho', suplemento: 0 }, { nome: 'Irmã mais velha', suplemento: 0 }] }],
    personalizacao: { rotulo: 'Data ou nome', pista: 'Opcional', max: 30, obrigatoria: false, opcional: null, suplemento: 0 },
  },
  'manta-remalhada': {
    nome: 'Manta remalhada', categoria: 'mantas-e-toalhas', preco: 21.9, tamanhos: [], cores: [{ nome: 'Rosa maquilhagem' }, { nome: 'Areia' }, { nome: 'Azul cobalto' }], opcoes: [], personalizacao: null,
  },
  'caixa-surpresa': {
    nome: 'Caixa surpresa personalizada', categoria: 'caixas', preco: 3.5, tamanhos: [], cores: [], opcoes: [],
    personalizacao: { rotulo: 'Frase da tampa', pista: 'Por exemplo: Vais ser avó', max: 120, obrigatoria: true, opcional: null, suplemento: 0 },
  },
  // Inventado: nenhum produto verdadeiro tem (ainda) uma opção com acréscimo. O «Embrulho» começa
  // por um valor COM acréscimo: o que vale quando falta é o primeiro SEM acréscimo («Saco»).
  'conjunto-de-ensaio': {
    nome: 'Conjunto de ensaio', categoria: 'conjuntos', preco: 24.5, tamanhos: ['1 mês', '3 meses'], cores: [{ nome: 'Branco' }],
    opcoes: [
      { nome: 'Peças', valores: [{ nome: 'Body e calças', suplemento: 0 }, { nome: 'Body, calças e babete', suplemento: 6.5 }] },
      { nome: 'Embrulho', valores: [{ nome: 'Caixa', suplemento: 2 }, { nome: 'Saco', suplemento: 0 }] },
    ],
    personalizacao: { rotulo: 'Nome', pista: '', max: 12, obrigatoria: false, opcional: 'Bordar o nome', suplemento: 4.25 },
  },
});

export const ZONAS_DE_ENSAIO = Object.freeze([
  { id: 'continente', nome: 'Portugal continental', portes: 3.9, morada: true },
  { id: 'ilhas', nome: 'Açores e Madeira', portes: null, morada: true },
  { id: 'estrangeiro', nome: 'Fora de Portugal', portes: null, morada: true },
  { id: 'mao', nome: 'Entrega em mão em Valongo', portes: 0, morada: false },
]);

/* O catálogo de um cenário: o lido, com os produtos de ensaio por cima, as zonas de ensaio (os
   `portes` mudam-se por id: { continente: null }) e os portes grátis a partir de 50 €. */
export function catalogoDeEnsaio({ modo = 'encomenda', portes = {}, gratisAPartirDe = 50 } = {}) {
  const cat = clone(catalogoBase());
  cat.modo = modo;
  cat.gratisAPartirDe = gratisAPartirDe;
  cat.zonas = ZONAS_DE_ENSAIO.map((z) => ({ ...z, portes: Object.hasOwn(portes, z.id) ? portes[z.id] : z.portes }));
  cat.produtos = { ...cat.produtos, ...clone(PRODUTOS_DE_ENSAIO) };
  cat.categorias = { babygrows: 'Babygrows', 't-shirts': 'T-shirts', 'mantas-e-toalhas': 'Mantas e toalhas', caixas: 'Caixas', conjuntos: 'Conjuntos', bodies: 'Bodies', ...(cat.categorias || {}) };
  return cat;
}

/* Um KV com a API que o Worker usa (get, put com metadata, delete, list com prefixo e cursor).
   Como o da Cloudflare, recusa metadados acima de 1 024 bytes. */
export function kvFalso() {
  const m = new Map();
  return {
    dados: m,
    escritas: 0,
    async get(k) { const e = m.get(k); return e ? e.valor : null; },
    async put(k, v, o = {}) {
      if (o.metadata && new TextEncoder().encode(JSON.stringify(o.metadata)).length > 1024) throw new Error('KV PUT failed: 413 Metadata length exceeds limit');
      this.escritas += 1;
      m.set(k, { valor: v, metadata: o.metadata || null });
    },
    async delete(k) { m.delete(k); },
    async list({ prefix = '', cursor, limit = 1000 } = {}) {
      const chaves = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      const inicio = cursor ? Number(cursor) : 0;
      const fatia = chaves.slice(inicio, inicio + limit);
      const fim = inicio + fatia.length >= chaves.length;
      return { keys: fatia.map((name) => ({ name, metadata: m.get(name).metadata })), list_complete: fim, cursor: fim ? undefined : String(inicio + limit) };
    },
  };
}

export const SITE = 'https://renatovalente5.github.io/franjakids';
export const CATALOGO_URL = `${SITE}/assets/catalogo.json`;
export const SEGREDO = 'segredo-do-painel-de-teste';
export const ORIGEM = 'https://renatovalente5.github.io';

/* OS OBJECTOS DURÁVEIS DE FAZ-DE-CONTA (objecto.js): uma instância por nome, com um storage em memória e o
   blockConcurrencyWhile como uma fila (como na Cloudflare: o que corre lá dentro não se mistura). A
   jurisdição devolve o mesmo espaço (aqui não há sítios). `instancias` deixa os testes ver dentro. */
function ctxFalso() {
  const m = new Map();
  let fila = Promise.resolve();
  return {
    dados: m,
    storage: {
      // como o da Cloudflare: uma lista de chaves dá um Map com as que existem
      async get(k) { if (Array.isArray(k)) return new Map(k.filter((x) => m.has(x)).map((x) => [x, structuredClone(m.get(x))])); return m.has(k) ? structuredClone(m.get(k)) : undefined; },
      async put(k, v) { m.set(k, structuredClone(v)); },
      async delete(k) { return m.delete(k); },
      async list({ prefix = '' } = {}) { return new Map([...m.keys()].filter((x) => x.startsWith(prefix)).sort().map((x) => [x, structuredClone(m.get(x))])); },
      async deleteAll() { m.clear(); },
      async setAlarm() { /* o prazo não corre nos testes */ },
    },
    blockConcurrencyWhile(fn) { const p = fila.then(fn); fila = p.catch(() => {}); return p; },
  };
}
export function objectosFalsos(Classe, env) {
  const instancias = new Map();
  const ns = {
    instancias,
    jurisdiction() { return ns; },
    idFromName(n) { return String(n); },
    get(id) {
      if (!instancias.has(id)) instancias.set(id, new Classe(ctxFalso(), env));
      const o = instancias.get(id);
      return { fetch: (url, init) => o.fetch(new Request(url, init)) };
    },
  };
  return ns;
}

export function envFalso(extra = {}) {
  const env = {
    ORDERS: kvFalso(),
    TRAVAO_CHECKOUT: { limit: async () => ({ success: true }) },
    SITE_URL: SITE,
    LOGO_URL: `${SITE}/assets/marca/logotipo-320.png`,
    ALLOWED_ORIGINS: 'https://renatovalente5.github.io,http://127.0.0.1:8985,http://localhost:8985',
    STORE_NAME: 'Franja Kids',
    STORE_INSTAGRAM: 'franjakids',
    STORE_EMAIL: '',
    MAIL_FROM: 'Franja Kids <onboarding@resend.dev>',
    STRIPE_API_VERSION: '2026-07-29.dahlia',
    PAINEL_SEGREDO: SEGREDO,
    ...extra,
  };
  if (!('ENCOMENDA' in extra)) env.ENCOMENDA = objectosFalsos(Encomenda, env);
  if (!('CONTADOR' in extra)) env.CONTADOR = objectosFalsos(Contador, env);
  if (!('CUPOES' in extra)) env.CUPOES = objectosFalsos(Cupoes, env);
  return env;
}

/* A rede: `catalogo` é o objecto (ou uma função que o devolve, para o mudar a meio); `stripe` e
   `resend` são respostas por omissão ou funções (url, init) → Response. As chamadas ficam em
   `chamadas` ({ url, init, corpo }). */
export function redeFalsa({ catalogo, stripe, resend } = {}) {
  const chamadas = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    const corpo = init.body ? String(init.body) : '';
    chamadas.push({ url, init, corpo });
    if (url === CATALOGO_URL) {
      const cat = typeof catalogo === 'function' ? catalogo() : catalogo;
      if (!cat) return new Response('não há', { status: 404 });
      return Response.json(cat);
    }
    if (url.startsWith('https://api.stripe.com/')) {
      if (typeof stripe === 'function') return stripe(url, init);
      if (url.endsWith('/checkout/sessions') && init.method === 'POST') return Response.json({ id: 'cs_test_a1b2c3d4e5f6', url: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6', payment_status: 'unpaid' });
      return Response.json(stripe || {});
    }
    if (url.startsWith('https://api.resend.com/')) {
      if (typeof resend === 'function') return resend(url, init);
      return Response.json({ id: `re_${chamadas.length}` });
    }
    throw new Error(`rede proibida nos testes: ${url}`);
  };
  return {
    chamadas,
    stripe: () => chamadas.filter((c) => c.url.startsWith('https://api.stripe.com/')),
    resend: () => chamadas.filter((c) => c.url.startsWith('https://api.resend.com/')).map((c) => JSON.parse(c.corpo)),
    repor() { globalThis.fetch = original; },
  };
}

/* Cada pedido vem de um IP diferente, salvo quando o teste diz o seu: o travão de memória do Worker
   é por IP e vive no módulo, e os testes do mesmo ficheiro partilham-no. */
let ipSeguinte = 1;
export async function pedir(worker, env, metodo, caminho, { corpo, cabecalhos = {} } = {}) {
  const init = { method: metodo, headers: { 'CF-Connecting-IP': `10.0.${Math.floor(ipSeguinte / 256)}.${ipSeguinte++ % 256}`, ...cabecalhos } };
  if (corpo !== undefined) { init.body = typeof corpo === 'string' ? corpo : JSON.stringify(corpo); init.headers['content-type'] = 'application/json'; }
  const r = await worker.fetch(new Request(`https://franjakids-encomendas.test${caminho}`, init), env);
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* texto simples */ }
  return { status: r.status, json, texto, headers: r.headers };
}

export const bearer = (segredo = SEGREDO) => ({ Authorization: `Bearer ${segredo}` });

/* O pedido-padrão do site, o do contrato (§2): um babygrow de 1 mês, rosa, com o nome «Clara»
   bordado (16,90 € + 3 €), com entrega em mão (sem portes nem morada). */
export function pedidoValido(sobre = {}) {
  return {
    linhas: [{ produto: 'babygrow-com-nome', tamanho: '1 mês', cor: 'Rosa', opcoes: {}, personalizar: true, texto: 'Clara', qtd: 1 }],
    entrega: 'mao',
    cliente: { nome: 'Maria Fernanda Silva', email: 'Maria@Exemplo.pt', telefone: '912 345 678' },
    oferta: false,
    termos: true,
    total_cents: 1990,
    ...sobre,
  };
}
export const clienteValido = (sobre = {}) => ({ ...pedidoValido().cliente, ...sobre });
export const moradaValida = () => ({ morada: 'Rua das Flores, 10, 2.º Esq.', codigoPostal: '4440-503', localidade: 'Valongo' });
/* O mesmo pedido, com envio por CTT para o continente: 19,90 € + 3,90 € de portes. */
export const pedidoPorCorreio = (sobre = {}) => pedidoValido({ entrega: 'continente', cliente: clienteValido(moradaValida()), total_cents: 2380, ...sobre });

/* Uma encomenda registada pelo /checkout, pronta para os testes do painel e da Stripe. */
export async function registar(worker, env, sobre = {}) {
  const r = await pedir(worker, env, 'POST', '/checkout', { corpo: pedidoValido(sobre) });
  if (r.status !== 200) throw new Error(`checkout falhou nos testes: ${r.status} ${r.texto}`);
  return r.json;
}

/* A frase que o Renato não quer em lado nenhum (memória sem-obrigacao-de-pagar), montada por
   pedaços para nem este ficheiro a ter; procura-se sem acentos nem maiúsculas. */
export const semAcentos = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const FRASE_PROIBIDA = new RegExp(['obrigacao', 'de', 'pagar'].join('\\s+'));
