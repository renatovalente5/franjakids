// O QUE O GOOGLE LÊ: os títulos e as descrições das páginas de linha, de categoria e de ocasião, a frase de
// abertura de cada uma, e os dados estruturados (JSON-LD) da loja, do site, das migalhas e dos produtos.
//
// As linhas, as categorias e as ocasiões são fixas: o painel muda-lhes os nomes, não os ids (regras.mjs,
// mudancasBloqueadas). Por isso as frases daqui podem ser escritas à mão. Um id que não esteja aqui usa o
// nome e a frase do catálogo.
//
// Os títulos vão sem « · Franja Kids», que o layout junta. O testar.mjs confere que nenhum título passa de
// 65 caracteres e que as descrições ficam entre 50 e 160.
import { absoluto, fotoJpg } from './util.mjs';
import { precoMinimo } from './lib/regras.mjs';

export const TITULO_INICIO = 'Roupa e presentes personalizados para bebé';

/* A posse do site nos motores de busca (10 nov 2026), na página inicial: o Google Search Console (propriedade
   «https://franjakids.com/», conta renato.lima.valente@gmail.com) e o Bing Webmaster Tools (a conta do Renato,
   entrada com o Google; o código é o da conta, o mesmo da Mimices). Tirar uma delas desvalida a propriedade. */
export const VERIFICACOES = Object.freeze({
  'google-site-verification': 'jw1EH9YxON3Q3i3G1Ode_bT4Dt04dntD07s0Kyf06yo',
  'msvalidate.01': 'DE1BA388910A8DC62D873CAEEF7B2BB8',
});

/* OS TÍTULOS PARA O GOOGLE das secções do menu e das suas categorias (o <title>; a descrição é a `frase` de cada
   uma, no content/catalogo.json, que a dona muda no painel). Uma secção ou uma categoria que não está aqui (uma que
   a dona juntou) leva o nome dela, com a secção: «Gorros · Personalizados». */
export const SECCOES = {
  bebe: { titulo: 'Roupa de bebé, mantas e primeira roupinha', descricao: 'Bodies e babygrows, conjuntos de malha, mantas, toalhas e a bolsa da primeira roupinha, para os primeiros dias do bebé.' },
  personalizados: { titulo: 'Personalizados para bebé com nome', descricao: 'Bodies, babygrows, babetes e toalhas com o nome, a data ou a frase que escolheres. Feitos por encomenda, com pré-visualização antes de produzir.' },
  'crianca-e-familia': { titulo: 'T-shirts e sweatshirts personalizadas', descricao: 'T-shirts, sweatshirts e conjuntos a combinar, com o nome ou a frase que escolheres, para crianças e adultos.' },
  presentes: { titulo: 'Presentes personalizados para bebés e família', descricao: 'Para anunciar a gravidez, convidar os padrinhos, surpreender os avós e celebrar o nascimento: presentes com a frase que escolheres.' },
  colecoes: { titulo: 'Coleções: Natal, Dia da Mãe, Dia do Pai e mais' },
  promocoes: { titulo: 'Promoções e últimas unidades' },
};
export const TITULOS = {
  'personalizados/bodies': 'Bodies personalizados para bebé',
  'personalizados/babygrows': 'Babygrows personalizados com nome',
  'personalizados/babetes': 'Babetes personalizados',
  'personalizados/toalhas-de-banho': 'Toalhas de banho personalizadas com nome',
  'crianca-e-familia/t-shirts-de-crianca': 'T-shirts de criança personalizadas',
  'crianca-e-familia/t-shirts-de-adulto': 'T-shirts de adulto personalizadas',
  'crianca-e-familia/sweatshirts-de-crianca': 'Sweatshirts de criança personalizadas',
  'crianca-e-familia/sweatshirts-de-adulto': 'Sweatshirts de adulto personalizadas',
  'bebe/primeira-roupinha': 'Bolsa da primeira roupinha',
  'bebe/conjuntos-de-malha': 'Conjuntos de malha para bebé',
  'bebe/mantas-e-cobertores': 'Mantas e cobertores para bebé',
  'presentes/anunciar-gravidez': 'Anúncio de gravidez: bodies e presentes',
  'presentes/padrinhos': 'Pedido aos padrinhos: bodies e caixas surpresa',
  'presentes/avos-e-bisavos': 'Presentes personalizados para os avós',
  'presentes/papas': 'Presentes personalizados para o pai',
  'presentes/irmaos': 'T-shirts e bodies para irmãos',
  'presentes/caixas-presente': 'Caixas surpresa personalizadas',
  'colecoes/entre-paises': 'Bodies para bebés de dois países',
  'colecoes/natal': 'Personalizados de Natal para bebé e família',
  'colecoes/dia-da-mae': 'Presentes para o Dia da Mãe',
  'colecoes/dia-do-pai': 'Presentes para o Dia do Pai',
};

export function resumir(texto, max = 155) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  return corte.slice(0, corte.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
}

/** A descrição de um produto: o resumo dele, e o que vale para todos se o resumo for curto. */
export function descricaoDoProduto(p) {
  const r = String(p.resumo ?? '').trim();
  // sem género (o produto pode ser «o body» ou «a toalha»)
  const fim = p._pers ? 'A Franja Kids faz por encomenda, com o nome ou a frase que escolheres.' : p._porEncomenda === false ? 'Da Franja Kids, com envio para todo o país.' : 'A Franja Kids faz por encomenda e envia para todo o país.';
  return resumir(r.length < 110 ? `${r}${r && !/[.!?…]$/.test(r) ? '.' : ''} ${fim}`.trim() : r);
}

// ── Dados estruturados (schema.org) ─────────────────────────────────────────
const id = (marca) => absoluto('/') + '#' + marca;

/* As devoluções (Trocas e devoluções; a legal-comum: DL 24/2014). A livre resolução é de 14 dias, por correio, e
   quem paga os portes da devolução não vai aqui: as páginas não o dizem, e sem o dizer a lei põe-nos na loja
   (art. 13.º; a revisão de 20 nov 2026). Os artigos de personalização OBRIGATÓRIA não têm livre resolução (art. 17.º,
   n.º 1, c)): têm a política própria no Offer. */
const LINK_DEVOLUCOES = () => absoluto('/trocas-e-devolucoes/');
const devolucoes = () => ({
  '@type': 'MerchantReturnPolicy', applicableCountry: 'PT', returnPolicyCountry: 'PT',
  returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 14,
  returnMethod: 'https://schema.org/ReturnByMail',
  merchantReturnLink: LINK_DEVOLUCOES(),
});
const semDevolucao = () => ({
  '@type': 'MerchantReturnPolicy', applicableCountry: 'PT', returnPolicyCountry: 'PT',
  returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted', merchantReturnLink: LINK_DEVOLUCOES(),
});

/** O site (o nome que o Google mostra por cima dos resultados). */
export const ldSite = (loja) => ({
  '@context': 'https://schema.org', '@type': 'WebSite', '@id': id('site'), name: loja.nome, url: absoluto('/'),
  inLanguage: 'pt-PT', publisher: { '@id': id('loja') },
});

/** A loja. Os dados da empresa só entram quando a dona os escreve (em produção são obrigatórios). */
export function ldLoja(loja) {
  const e = loja.empresa || {};
  const so = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const nif = so(e.nif)?.replace(/\s/g, '');
  return {
    '@context': 'https://schema.org', '@type': 'OnlineStore', '@id': id('loja'), name: loja.nome, url: absoluto('/'),
    logo: absoluto('/assets/marca/logotipo-640.png'), description: loja.descricao,
    sameAs: [`https://www.instagram.com/${loja.instagram}/`],
    address: { '@type': 'PostalAddress', ...(so(e.morada) ? { streetAddress: so(e.morada) } : {}), addressLocality: loja.entrega.concelho, addressCountry: 'PT' },
    ...(so(e.nome) ? { legalName: so(e.nome) } : {}),
    ...(nif ? { vatID: 'PT' + nif } : {}),
    ...(so(e.email) ? { email: so(e.email) } : {}),
    ...(so(e.telefone) ? { telephone: so(e.telefone) } : {}),
    hasMerchantReturnPolicy: devolucoes(),
  };
}

/** As migalhas: [[nome, caminho], …], da raiz à página. */
export const ldMigalhas = (itens) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: itens.map(([name, caminho], i) => ({ '@type': 'ListItem', position: i + 1, name, item: absoluto(caminho) })),
});

/* Um produto com preço (sem preço não há Offer, e em produção ele nem está no site). Para as fichas de comerciante do
   Google: InStock e não MadeToOrder (que não é aceite; tudo aqui é feito por encomenda e está sempre à venda),
   NewCondition, o sku, até 6 fotografias, e o preço que a ficha mostra (o mais baixo que se pode pagar). */
export function ldProduto({ loja }, p) {
  const pagina = absoluto(`/produtos/${p.slug}/`);
  return {
    '@context': 'https://schema.org', '@type': 'Product', '@id': pagina + '#produto', name: p.nome,
    description: descricaoDoProduto(p), sku: p.slug, ...(p._nomeCategoria ? { category: p._nomeCategoria } : {}),
    image: p.fotos.slice(0, 6).map(fotoJpg).filter(Boolean), brand: { '@type': 'Brand', name: loja.nome },
    offers: {
      '@type': 'Offer', url: pagina, price: precoMinimo(p, p._tamanhos).toFixed(2), priceCurrency: 'EUR',
      availability: p._esgotado ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': id('loja') },
      ...(p._pers?.obrigatoria ? { hasMerchantReturnPolicy: semDevolucao() } : {}),
    },
  };
}
