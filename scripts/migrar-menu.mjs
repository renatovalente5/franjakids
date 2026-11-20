// A MIGRAÇÃO DO MENU (20 nov 2026; docs/MENU-E-CATEGORIAS.md): o content/ do modelo antigo (linhas, categorias e
// ocasiões; `categoria` e `ocasioes` nos produtos; quatro zonas) para o novo (secções com categorias; `categorias`
// nos produtos; cinco zonas, `preparacao` e `fotoHistoria` na loja). Corre-se uma vez, e outra vez por cima do que a
// dona gravar entretanto (o que já está no modelo novo fica como está):
//   node scripts/migrar-menu.mjs [pasta do site]
// Os ficheiros ficam escritos como o painel os escreve (2 espaços, a mesma terminação, as chaves pela ordem do
// formulário), para o primeiro «Gravar» da dona não mudar nada que ela não mexeu.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = resolve(process.argv[2] || '.');
const R = await import(pathToFileURL(join(RAIZ, 'src/lib/regras.mjs')).href);
const ler = (f) => { const t = readFileSync(join(RAIZ, f), 'utf8'); return { t, o: JSON.parse(t) }; };
const escrever = (f, o, t) => writeFileSync(join(RAIZ, f), R.serializar(o, R.terminacaoDe(t)));
const mudados = [];

/* ---------------------------------------------------------------- o catálogo */
const SECCOES = [
  { id: 'bebe', nome: 'Bebé', deLinha: 'bebe', itens: [
    ['bodies-e-babygrows', 'Bodies e babygrows'], ['primeira-roupinha', 'Primeira roupinha', 'primeira-roupinha'],
    ['conjuntos-de-malha', 'Conjuntos de malha', 'conjuntos'], ['mantas-e-cobertores', 'Mantas e cobertores'],
    ['lencois-de-cama', 'Lençóis de cama'], ['toalhas-de-banho-e-fraldinhas', 'Toalhas de banho e fraldinhas'], ['outros', 'Outros']] },
  { id: 'personalizados', nome: 'Personalizados', deLinha: 'personalizados', itens: [
    ['bodies', 'Bodies', 'bodies'], ['babygrows', 'Babygrows', 'babygrows'], ['fraldinhas', 'Fraldinhas'], ['babetes', 'Babetes', 'babetes'],
    ['gorros', 'Gorros'], ['toalhas-de-banho', 'Toalhas de banho'], ['tapa-ovos', 'Tapa-ovos']] },
  { id: 'crianca-e-familia', nome: 'Criança e Família Personalizados', frase: 'T-shirts, sweatshirts e conjuntos a combinar, com o nome ou a frase que escolheres, para crianças e adultos.', itens: [
    ['t-shirts-de-crianca', 'T-shirts de criança personalizadas', 't-shirts'], ['t-shirts-de-adulto', 'T-shirts de adulto personalizadas', 't-shirts'],
    ['sweatshirts-de-crianca', 'Sweatshirts de criança personalizadas', 'camisolas'], ['sweatshirts-de-adulto', 'Sweatshirts de adulto personalizadas', 'camisolas'],
    ['conjuntos-a-combinar', 'Conjuntos a combinar personalizados']] },
  { id: 'presentes', nome: 'Presentes', deLinha: 'presentes', frase: 'Presentes personalizados para anunciar a gravidez, convidar os padrinhos e surpreender a família.', itens: [
    ['anunciar-gravidez', 'Anunciar uma gravidez', null, 'bebe-a-caminho'], ['padrinhos', 'Convites para padrinhos', null, 'padrinhos'],
    ['avos-e-bisavos', 'Presentes para avós e bisavós', null, 'avos'], ['papas', 'Presentes para papás', null, 'papa'],
    ['irmaos', 'Presentes para irmãos', null, 'irmaos'], ['caixas-presente', 'Caixas presente', 'caixas'], ['nascimento', 'Presentes de nascimento', null, 'nascimento']] },
  { id: 'colecoes', nome: 'Coleções', frase: 'As nossas coleções: do Natal ao Dia da Mãe e ao Dia do Pai, e as edições especiais.', fotoDeOcasiao: 'natal', itens: [
    ['baby-2027', 'Baby 2027'], ['entre-paises', 'Entre Países', null, 'entre-paises'], ['desporto-e-clubes', 'Desporto e Clubes'],
    ['natal', 'Natal', null, 'natal'], ['dia-da-mae', 'Dia da Mãe', null, 'mama'], ['dia-do-pai', 'Dia do Pai'], ['edicoes-especiais', 'Edições especiais']] },
  { id: 'promocoes', nome: 'Promoções', frase: 'Últimas unidades e campanhas especiais da Franja Kids.', itens: [
    ['ultimas-unidades', 'Últimas unidades'], ['campanhas-especiais', 'Campanhas especiais']] },
];
/* As frases das antigas categorias e ocasiões (o src/seo.mjs de antes): passam para os itens, onde a dona as muda. */
const FRASE_CATEGORIA = {
  bodies: 'Bodies com o nome, a data ou a frase que escolheres: para anunciar a gravidez, pedir aos padrinhos ou dar a notícia aos avós.',
  't-shirts': 'T-shirts com o nome ou a frase que escolheres, para crianças e adultos, e para a família andar a condizer.',
  camisolas: 'Sweatshirts com o nome ou a frase que escolheres, para crianças e adultos.',
  babetes: 'Babetes com frases para os avós, os tios e os padrinhos, e o nome que escolheres.',
  babygrows: 'Babygrows com o nome do bebé, para os primeiros meses.',
  conjuntos: 'Conjuntos de malha e de algodão para bebé, para os dias frios e para o verão.',
  'primeira-roupinha': 'Para levar a primeira roupinha do bebé para a maternidade, e guardar depois.',
  caixas: 'Caixas com a tua frase na tampa, para dar a notícia aos avós, aos padrinhos ou à família.',
};
const FRASE_OCASIAO = {
  'bebe-a-caminho': 'Bodies, t-shirts e caixas surpresa para contar a novidade à família.',
  avos: 'Para contar aos avós que vem aí um neto: bodies, babetes e caixas surpresa com a frase que escolheres.',
  padrinhos: 'Para pedir aos padrinhos de uma forma que não esquecem: bodies, babetes e caixas surpresa.',
  papa: 'Para o Dia do Pai ou para qualquer dia: bodies, t-shirts, sweatshirts e placas para o pai e o bebé.',
  mama: 'Para o Dia da Mãe ou para qualquer dia: bodies, t-shirts e placas com o nome que escolheres.',
  irmaos: 'Para o irmão mais velho receber a notícia, ou para os irmãos andarem a condizer.',
  'entre-paises': 'Para os bebés de duas terras: as duas bandeiras, os dois mapas ou a frase que escolheres.',
  natal: 'Para o primeiro Natal do bebé e para as fotografias de Natal da família.',
};

const cat = ler(R.FICHEIROS.catalogo);
if (!Array.isArray(cat.o.seccoes)) {
  const antes = cat.o;
  const linha = (id) => (Array.isArray(antes.linhas) ? antes.linhas.find((l) => l && l.id === id) : null) || {};
  const ocasiao = (id) => (Array.isArray(antes.ocasioes) ? antes.ocasioes.find((o) => o && o.id === id) : null) || {};
  const seccoes = SECCOES.map((s) => {
    const l = s.deLinha ? linha(s.deLinha) : {};
    const foto = l.foto || (s.fotoDeOcasiao ? ocasiao(s.fotoDeOcasiao).foto : null) || null;
    return {
      id: s.id, nome: s.nome, frase: s.frase || l.frase || '', ...(foto ? { foto } : {}),
      itens: s.itens.map(([id, nome, deCat, deOc]) => {
        const frase = (deOc && FRASE_OCASIAO[deOc]) || (deCat && FRASE_CATEGORIA[deCat]) || '';
        const fotoI = deOc ? ocasiao(deOc).foto : null;
        return { id, nome, ...(frase ? { frase } : {}), ...(fotoI ? { foto: fotoI } : {}) };
      }),
    };
  });
  const novo = { seccoes, tamanhos: antes.tamanhos, cores: antes.cores };
  escrever(R.FICHEIROS.catalogo, novo, cat.t);
  mudados.push(R.FICHEIROS.catalogo);
}

/* ---------------------------------------------------------------- os produtos */
const DE_OCASIAO = {
  'bebe-a-caminho': ['presentes/anunciar-gravidez'], avos: ['presentes/avos-e-bisavos'], padrinhos: ['presentes/padrinhos'],
  papa: ['presentes/papas', 'colecoes/dia-do-pai'], mama: ['colecoes/dia-da-mae'], irmaos: ['presentes/irmaos'],
  'entre-paises': ['colecoes/entre-paises'], natal: ['colecoes/natal'], nascimento: ['presentes/nascimento'],
};
function daCategoria(a) {
  const nome = String(a.nome || '').toLowerCase();
  const pers = Boolean(a.personalizacao);
  switch (a.categoria) {
    case 'bodies': return ['personalizados/bodies'];
    case 't-shirts': return a.tamanhos === 'crianca' ? ['crianca-e-familia/t-shirts-de-crianca'] : a.tamanhos === 'adulto' ? ['crianca-e-familia/t-shirts-de-adulto'] : ['crianca-e-familia/t-shirts-de-crianca', 'crianca-e-familia/t-shirts-de-adulto'];
    case 'camisolas': return a.tamanhos === 'crianca' ? ['crianca-e-familia/sweatshirts-de-crianca'] : a.tamanhos === 'adulto' ? ['crianca-e-familia/sweatshirts-de-adulto'] : ['crianca-e-familia/sweatshirts-de-crianca', 'crianca-e-familia/sweatshirts-de-adulto'];
    case 'babetes': return ['personalizados/babetes'];
    case 'babygrows': return ['bebe/bodies-e-babygrows', ...(pers ? ['personalizados/babygrows'] : [])];
    case 'conjuntos': return [nome.includes('malha') ? 'bebe/conjuntos-de-malha' : 'bebe/outros'];
    case 'mantas-e-toalhas': return nome.includes('toalha') ? [...(pers ? ['personalizados/toalhas-de-banho'] : []), 'bebe/toalhas-de-banho-e-fraldinhas'] : ['bebe/mantas-e-cobertores'];
    case 'primeira-roupinha': return ['bebe/primeira-roupinha'];
    case 'box-franja': case 'caixas': return ['presentes/caixas-presente'];
    default: return ['bebe/outros'];
  }
}
const pasta = R.PASTAS.artigos;
for (const f of readdirSync(join(RAIZ, pasta)).filter((x) => x.endsWith('.json')).sort()) {
  const { t, o: a } = ler(`${pasta}/${f}`);
  if (Array.isArray(a.categorias) && !('categoria' in a) && !('ocasioes' in a)) continue;
  const lista = [...daCategoria(a), ...(Array.isArray(a.ocasioes) ? a.ocasioes : []).flatMap((x) => DE_OCASIAO[x] || [])];
  if (/2027/.test(String(a.nome || ''))) lista.push('colecoes/baby-2027');
  const categorias = [...new Set(lista)];
  // `categorias` no lugar da `categoria`; as `ocasioes` saem
  const novo = {};
  for (const [k, v] of Object.entries(a)) {
    if (k === 'categoria') novo.categorias = categorias;
    else if (k !== 'ocasioes') novo[k] = v;
  }
  if (!('categorias' in novo)) Object.assign(novo, R.ordenarComo(novo, { ...novo, categorias }));
  escrever(`${pasta}/${f}`, R.ordenarComo(a, novo), t);
  mudados.push(`${pasta}/${f}`);
}

/* ---------------------------------------------------------------- a loja */
const loja = ler(R.FICHEIROS.loja);
const zs = loja.o.entrega && Array.isArray(loja.o.entrega.zonas) ? loja.o.entrega.zonas : [];
if (!zs.some((z) => z && z.id === 'ue')) {
  const z = (id) => zs.find((x) => x && x.id === id) || {};
  const est = z('estrangeiro');
  loja.o.entrega.zonas = [
    { id: 'continente', nome: z('continente').nome || 'Portugal continental', portes: z('continente').portes ?? null },
    { id: 'ilhas', nome: z('ilhas').nome || 'Açores e Madeira', portes: z('ilhas').portes ?? null },
    // a «Europa» que a dona tinha posto a 8 € no «estrangeiro» passa a ser a União Europeia
    { id: 'ue', nome: 'União Europeia', portes: typeof est.portes === 'number' ? est.portes : 8 },
    { id: 'estrangeiro', nome: 'Restantes países', portes: null },
    { id: 'mao', nome: 'Levantamento em mão — Valongo', portes: 0 },
  ];
  mudados.push(R.FICHEIROS.loja);
}
if (!('preparacao' in loja.o) || !('fotoHistoria' in loja.o)) {
  const novo = {};
  for (const [k, v] of Object.entries(loja.o)) {
    novo[k] = v;
    if (k === 'producao') { if (!('preparacao' in loja.o)) novo.preparacao = '2 a 3 dias úteis'; if (!('fotoHistoria' in loja.o)) novo.fotoHistoria = R.FOTO_HISTORIA; }
  }
  loja.o = novo;
  if (!mudados.includes(R.FICHEIROS.loja)) mudados.push(R.FICHEIROS.loja);
}
if (mudados.includes(R.FICHEIROS.loja)) escrever(R.FICHEIROS.loja, loja.o, loja.t);

console.log(mudados.length ? `${mudados.length} ficheiros migrados:\n- ${mudados.join('\n- ')}` : 'nada a migrar: o content/ já está no modelo novo');
