// O www do domínio vai para o domínio sem www (301, o mesmo caminho e a mesma pesquisa).
// O DOMÍNIO é o do wrangler.jsonc (a cliente quer franjakids.com; compra-se no fim).
// Tudo o resto são os ficheiros do site (_site/), servidos pelo binding ASSETS, com a 404.html
// quando a morada não existe. É o único código do site: sem ele, o www mostrava o site inteiro
// numa segunda morada. (O Worker das encomendas é outro: worker/encomendas/.)
//
// Cada resposta leva os cabeçalhos de segurança e a cache certa para o que é (11 nov 2026, da
// revisão do site: não havia nenhum, e tudo voltava à rede em cada visita).
const DOMINIO = 'franjakids.com';

/* A SEGURANÇA, em todas as respostas:
   - HSTS: só por https, durante um ano;
   - nosniff: um ficheiro é o que o Content-Type diz que é;
   - nenhuma página se mostra dentro de outra (frame-ancestors e X-Frame-Options): ninguém põe o
     finalizar num iframe de outro sítio;
   - Referrer-Policy e Permissions-Policy (o site não usa a câmara, o microfone, a localização nem
     a API de pagamentos do browser: a Stripe é noutra página).
   A CSP fica nas regras que não tocam nos scripts nem nos estilos (o <head> tem 2 scripts e 1
   estilo em linha, e as imagens têm style="object-position…"; uma script-src estrita pedia os
   resumos de cada um, e um esquecido partia o site sem aviso). */
const SEGURANCA = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
};

/* A CACHE: as fotografias do site têm o resumo do conteúdo no nome (outra fotografia, outro
   nome: scripts/imagens.py), e o CSS e o JS vêm com ?v=<resumo dos dois> (build.mjs): guardam-se
   um ano sem voltar a perguntar. As «grande-…»/«pequena-…» do painel têm o nome fixo e ficam de
   fora. As letras mudam quase nunca (um mês); o logótipo e os ícones, um dia. O resto (as
   páginas, o catálogo do carrinho, o sitemap) pergunta sempre, como até aqui. */
const ANO = 'public, max-age=31536000, immutable';
const RE_FOTO_COM_RESUMO = /^\/assets\/img\/[a-z0-9-]+-[0-9a-f]{10}-\d+\.(avif|webp|jpg)$/;
export function cacheDe(url) {
  const c = url.pathname;
  if (RE_FOTO_COM_RESUMO.test(c)) return ANO;
  if (/^\/assets\/(css|js)\/[a-z0-9-]+\.(css|js)$/.test(c) && url.searchParams.has('v')) return ANO;
  if (c.startsWith('/assets/fontes/')) return 'public, max-age=2592000';
  if (c.startsWith('/assets/marca/')) return 'public, max-age=86400';
  return null;
}

/* Os cabeçalhos de uma resposta dos ficheiros, com a segurança e a cache. A cache só muda nas
   respostas 200 (um 304 ou um 404 ficam como vêm). */
export function comCabecalhos(resposta, url, estado = resposta.status) {
  const h = new Headers(resposta.headers);
  for (const [k, v] of Object.entries(SEGURANCA)) h.set(k, v);
  const cache = estado === 200 ? cacheDe(url) : null;
  if (cache) h.set('Cache-Control', cache);
  return new Response(resposta.body, { status: estado, statusText: estado === resposta.status ? resposta.statusText : '', headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === `www.${DOMINIO}`) {
      url.hostname = DOMINIO;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    // a própria página 404 também responde 404 (servida pelo nome, dava 200 e podia entrar no Google)
    if (url.pathname === '/404' || url.pathname === '/404.html') {
      const r = await env.ASSETS.fetch(new Request(new URL('/404', url), request));
      return comCabecalhos(r, url, r.status === 200 ? 404 : r.status);
    }
    return comCabecalhos(await env.ASSETS.fetch(request), url);
  },
};
