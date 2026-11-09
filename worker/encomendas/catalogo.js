/* O CATÁLOGO PUBLICADO (assets/catalogo.json; a forma é a de `paraCarrinho` em src/build.mjs):
 * o modo, as zonas de entrega com os portes, os portes grátis e os produtos que se compram, cada
 * um com a forma que R.conferirEscolha() espera (preco, tamanhos, cores, opcoes, personalizacao).
 * Lê-se de CATALOGO_URL (por omissão SITE_URL/assets/catalogo.json) com a cache da Cloudflare a
 * 60 s no máximo: um preço mudado no painel vale no Worker um minuto depois de o site se publicar,
 * e um pico de pedidos não martela o site. Um .json não entra na cache por omissão, daí o
 * cacheEverything. */

export const CACHE = Object.freeze({ cf: Object.freeze({ cacheTtl: 60, cacheEverything: true }) });

/* A versão da forma que este Worker sabe ler. Uma versão nova no build.mjs (outra forma dos
   produtos ou das zonas) pára as encomendas com um 503 e o motivo na /painel/saude, em vez de
   as contas saírem de uma forma que o Worker não conhece. Mudar as duas juntas. */
export const VERSAO_CATALOGO = 2;

export const siteUrl = (env) => String(env.SITE_URL || '').replace(/\/+$/, '');
export const urlDoCatalogo = (env) => String(env.CATALOGO_URL || `${siteUrl(env)}/assets/catalogo.json`);

const eObjecto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

export async function lerCatalogo(env) {
  const url = urlDoCatalogo(env);
  const r = await fetch(url, CACHE);
  if (!r.ok) throw new Error(`catálogo ${url}: HTTP ${r.status}`);
  const cat = await r.json();
  if (!eObjecto(cat)) throw new Error(`catálogo ${url}: sem a forma esperada`);
  if (cat.v !== VERSAO_CATALOGO) throw new Error(`catálogo ${url}: versão ${cat.v}, e o Worker só conhece a ${VERSAO_CATALOGO}`);
  if (!eObjecto(cat.produtos) || !Array.isArray(cat.zonas) || !cat.zonas.length) throw new Error(`catálogo ${url}: sem a forma esperada`);
  return cat;
}

/* O modo vem do catálogo (content/loja.json → pagamentos.modo); a var MODO só o pode forçar para
   «encomenda», como travão de emergência — nunca o contrário. */
export const modoDe = (cat, env) => (env.MODO === 'encomenda' ? 'encomenda' : (cat && cat.modo === 'online' ? 'online' : 'encomenda'));
