// O www do domínio vai para o domínio sem www (301, o mesmo caminho e a mesma pesquisa).
// O DOMÍNIO é o do wrangler.jsonc (a cliente quer franjakids.com; compra-se no fim).
// Tudo o resto são os ficheiros do site (_site/), servidos pelo binding ASSETS, com a 404.html
// quando a morada não existe. É o único código do site: sem ele, o www mostrava o site inteiro
// numa segunda morada. (O Worker das encomendas é outro: worker/encomendas/.)
const DOMINIO = 'franjakids.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === `www.${DOMINIO}`) {
      url.hostname = DOMINIO;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
