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

export const TITULO_INICIO = 'Roupa e presentes personalizados para bebé';

/* A posse do site nos motores de busca (10 nov 2026), na página inicial: o Google Search Console (propriedade
   «https://franjakids.com/», conta renato.lima.valente@gmail.com) e o Bing Webmaster Tools (a conta do Renato,
   entrada com o Google; o código é o da conta, o mesmo da Mimices). Tirar uma delas desvalida a propriedade. */
export const VERIFICACOES = Object.freeze({
  'google-site-verification': 'jw1EH9YxON3Q3i3G1Ode_bT4Dt04dntD07s0Kyf06yo',
  'msvalidate.01': 'DE1BA388910A8DC62D873CAEEF7B2BB8',
});

export const LINHAS = {
  personalizados: {
    titulo: 'Roupa personalizada para bebé e família',
    descricao: 'Bodies, t-shirts, camisolas e babetes com o nome, a data ou a frase que escolheres. Feitos por encomenda, com pré-visualização antes de produzir.',
  },
  bebe: {
    titulo: 'Roupa de bebé, mantas e primeira roupinha',
    descricao: 'Babygrows, conjuntos de malha e de algodão, mantas, toalhas com o nome e a bolsa da primeira roupinha, para os primeiros dias do bebé.',
  },
  presentes: {
    titulo: 'Presentes personalizados para bebés e família',
    descricao: 'A Box Franja para os primeiros dias, caixas surpresa para dar a notícia e placas de madeira para as primeiras datas.',
  },
};

export const CATEGORIAS = {
  bodies: { titulo: 'Bodies personalizados para bebé', frase: 'Bodies com o nome, a data ou a frase que escolheres: para anunciar a gravidez, pedir aos padrinhos ou dar a notícia aos avós.' },
  't-shirts': { titulo: 'T-shirts personalizadas para crianças e adultos', frase: 'T-shirts com o nome ou a frase que escolheres, para crianças e adultos, e para a família andar a condizer.' },
  camisolas: { titulo: 'Camisolas personalizadas com nome', frase: 'Camisolas com o nome ou a frase que escolheres, para crianças e adultos.' },
  babetes: { titulo: 'Babetes personalizados', frase: 'Babetes com frases para os avós, os tios e os padrinhos, e o nome que escolheres.' },
  babygrows: { titulo: 'Babygrows personalizados com nome', frase: 'Babygrows com o nome do bebé, para os primeiros meses.' },
  conjuntos: { titulo: 'Conjuntos de roupa para bebé', frase: 'Conjuntos de malha e de algodão para bebé, para os dias frios e para o verão.' },
  'mantas-e-toalhas': { titulo: 'Mantas e toalhas para bebé', frase: 'Mantas para o berço, o carrinho e o colo, e toalhas de banho com capuz e o nome do bebé.' },
  'primeira-roupinha': { titulo: 'Bolsa da primeira roupinha', frase: 'Para levar a primeira roupinha do bebé para a maternidade, e guardar depois.' },
  'box-franja': { titulo: 'Box Franja, a caixa dos primeiros dias', frase: 'Tudo para os primeiros dias do bebé numa caixa, com o nome dele, se quiseres.' },
  caixas: { titulo: 'Caixas surpresa personalizadas', frase: 'Caixas com a tua frase na tampa, para dar a notícia aos avós, aos padrinhos ou à família.' },
  placas: { titulo: 'Placas de madeira personalizadas', frase: 'Placas de madeira para as fotografias das primeiras datas: Dia do Pai, Dia da Mãe, aniversário ou Natal.' },
};

export const OCASIOES = {
  'bebe-a-caminho': { titulo: 'Anúncio de gravidez: bodies e presentes', frase: 'Bodies, t-shirts e caixas surpresa para contar a novidade à família.' },
  avos: { titulo: 'Presentes personalizados para os avós', frase: 'Para contar aos avós que vem aí um neto: bodies, babetes e caixas surpresa com a frase que escolheres.' },
  padrinhos: { titulo: 'Pedido aos padrinhos: bodies e caixas surpresa', frase: 'Para pedir aos padrinhos de uma forma que não esquecem: bodies, babetes e caixas surpresa.' },
  papa: { titulo: 'Presentes para o pai e para o Dia do Pai', frase: 'Para o Dia do Pai ou para qualquer dia: bodies, t-shirts, camisolas e placas para o pai e o bebé.' },
  mama: { titulo: 'Presentes para a mãe e para o Dia da Mãe', frase: 'Para o Dia da Mãe ou para qualquer dia: bodies, t-shirts e placas com o nome que escolheres.' },
  irmaos: { titulo: 'T-shirts e bodies para irmãos', frase: 'Para o irmão mais velho receber a notícia, ou para os irmãos andarem a condizer.' },
  'entre-paises': { titulo: 'Bodies para bebés de dois países', frase: 'Para os bebés de duas terras: as duas bandeiras, os dois mapas ou a frase que escolheres.' },
  natal: { titulo: 'Personalizados de Natal para bebé e família', frase: 'Para o primeiro Natal do bebé e para as fotografias de Natal da família.' },
  familia: { titulo: 'Presentes para tios e primos', frase: 'Bodies, t-shirts, camisolas e babetes para contar aos tios e aos primos, ou para a família andar a condizer.' },
};

/** Uma descrição até `max` caracteres, cortada numa palavra (com reticências se cortou). */
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
  const fim = p._pers ? 'A Franja Kids faz por encomenda, com o nome ou a frase que escolheres.' : 'A Franja Kids faz por encomenda e envia para todo o país.';
  return resumir(r.length < 110 ? `${r}${r && !/[.!?…]$/.test(r) ? '.' : ''} ${fim}`.trim() : r);
}

// ── Dados estruturados (schema.org) ─────────────────────────────────────────
const id = (marca) => absoluto('/') + '#' + marca;

/* As devoluções (Trocas e devoluções; a legal-comum: DL 24/2014). A livre resolução é de 14 dias, por correio, e
   os portes da devolução ficam com o cliente (a loja só devolve os do envio normal). Os artigos de personalização
   OBRIGATÓRIA não têm livre resolução (art. 17.º, n.º 1, c)): têm a política própria no Offer. */
const LINK_DEVOLUCOES = () => absoluto('/trocas-e-devolucoes/');
const devolucoes = () => ({
  '@type': 'MerchantReturnPolicy', applicableCountry: 'PT', returnPolicyCountry: 'PT',
  returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 14,
  returnMethod: 'https://schema.org/ReturnByMail', returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
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
   NewCondition, o sku, até 6 fotografias, e o preço que a ficha mostra ao abrir (o de base, sem acréscimos). */
export function ldProduto({ loja, catalogo }, p) {
  const pagina = absoluto(`/produtos/${p.slug}/`);
  return {
    '@context': 'https://schema.org', '@type': 'Product', '@id': pagina + '#produto', name: p.nome,
    description: descricaoDoProduto(p), sku: p.slug, category: catalogo.categorias[p.categoria],
    image: p.fotos.slice(0, 6).map(fotoJpg).filter(Boolean), brand: { '@type': 'Brand', name: loja.nome },
    offers: {
      '@type': 'Offer', url: pagina, price: p.preco.toFixed(2), priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': id('loja') },
      ...(p._pers?.obrigatoria ? { hasMerchantReturnPolicy: semDevolucao() } : {}),
    },
  };
}
