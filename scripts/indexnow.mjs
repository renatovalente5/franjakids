// Avisa o IndexNow (o Bing e a rede dele: Yandex, Seznam, Naver) das páginas do sitemap que está no ar.
// Corre-se À MÃO, depois de publicar em PRODUÇÃO (o dia em que o site abre ao Google, e depois de mudanças grandes):
//
//     node scripts/indexnow.mjs
//
// Não faz nada se o site no ar ainda tiver noindex (a pré-visualização) ou se a chave não estiver publicada.
// A resposta 200 ou 202 quer dizer «aceite». O Google não usa o IndexNow: para ele, o sitemap no Search Console.
import { INDEXNOW } from '../src/seo.mjs';

const SITE = 'https://franjakids.com';
const ler = async (caminho) => {
  const r = await fetch(`${SITE}${caminho}${caminho.includes('?') ? '&' : '?'}_=${Date.now()}`, { headers: { 'user-agent': 'franjakids-indexnow' } });
  if (!r.ok) throw new Error(`${caminho}: ${r.status}`);
  return r.text();
};
const inicio = await ler('/');
if (/<meta name="robots" content="noindex/.test(inicio)) throw new Error('o site no ar ainda tem noindex (pré-visualização): o aviso fica para quando abrir ao Google');
if ((await ler(`/${INDEXNOW}.txt`)).trim() !== INDEXNOW) throw new Error('a chave do IndexNow não está no ar');
const urls = [...(await ler('/sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urls.length) throw new Error('o sitemap no ar está vazio');
const r = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key: INDEXNOW, keyLocation: `${SITE}/${INDEXNOW}.txt`, urlList: urls }),
});
console.log(`IndexNow: ${r.status} ${r.statusText} — ${urls.length} páginas`);
if (![200, 202].includes(r.status)) process.exitCode = 1;
