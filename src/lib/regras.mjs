/* AS REGRAS DOS DADOS DA FRANJA KIDS, NUM SÓ SÍTIO.
 *
 * Quatro leitores, e os quatro têm de ouvir o mesmo:
 *   · o gerador do site (src/build.mjs), antes de escrever as páginas;
 *   · o painel, no browser (o erro aparece por baixo do campo, antes de gravar);
 *   · o Worker do painel, ao gravar (recusa os problemas NOVOS que não sejam lembretes);
 *   · o Worker das encomendas (worker/encomendas/), que refaz as contas de cada encomenda.
 * O painel usa uma CÓPIA BYTE A BYTE deste ficheiro (estatico/js/regras.js no repositório
 * franjakids-painel), com um teste de SHA-256 que falha se divergirem. Por isso é um ES module
 * puro: nenhum import, nada de node:*, fs, process ou require. Corre tal e qual no browser, num
 * Worker e no Node. (A forma vem das regras da LF Mobile, que vieram da Mimices e da Pokóto.)
 *
 * CADA PROBLEMA TEM UMA CLASSE:
 *   · bloqueia   — a publicação pára e o site fica como estava. Só a estrutura (um JSON que não
 *                  se lê, um ficheiro sem a forma que o gerador precisa) e o que todas as páginas
 *                  usam (a marca, as zonas de entrega, as linhas da loja). Em PRODUÇÃO, também os
 *                  dados que a lei pede (identificação, NIF, morada, email — DL 7/2004, art. 10.º;
 *                  os portes — DL 24/2014, art. 4.º).
 *   · neutraliza — um produto, só na cópia que o gerador lê (o ficheiro do repositório não muda —
 *                  ver neutralizar()): sem nome, sem frase, sem fotografia, numa categoria que não
 *                  existe — e, em produção, sem preço — fica escondido do site; uma fotografia que
 *                  não existe não aparece. Um problema de UM produto nunca pára os outros.
 *   · avisa      — só aviso. No painel, os que não são lembrete são erro de campo (valor fora da
 *                  lista, número fora dos limites, texto comprido de mais): o painel não os deixa
 *                  gravar. Os LEMBRETES (lembrete: true) não são erro de ninguém: o painel grava na
 *                  mesma e mostra-os no Início.
 *
 * dados = {
 *   loja:     texto | objecto | null,               content/loja.json
 *   catalogo: texto | objecto | null,               content/catalogo.json
 *   fotos:    texto | objecto | null,               content/fotos.json
 *   artigos:  { <nome>: texto | objecto | null },   content/produtos/<nome>.json
 *   ficheirosFotos: [nome],  os nomes (sem .jpg) dos ficheiros em media/fotos/
 * }
 *   <nome> é o nome do ficheiro sem «.json», que é o endereço da página (/produtos/<nome>/).
 *   texto = o conteúdo do ficheiro; null = não existe. Uma chave de topo AUSENTE não se confere (o
 *   painel pode conferir só um produto); presente e null é «falta o ficheiro».
 *   (Os produtos chamam-se «artigos» no código, como nos outros painéis; no ecrã são «Produtos».)
 *
 * problema = {
 *   classe:   'bloqueia' | 'neutraliza' | 'avisa',
 *   chave:    estável ('artigo:<slug>:<regra>', 'loja:<campo>[:<regra>]'…). O Worker compara as
 *             chaves do HEAD com as da gravação e recusa só as novas; por isso UMA CHAVE TEM SEMPRE
 *             A MESMA CLASSE (o que muda com a produção tem uma chave própria, com «:producao» ou
 *             «:previa»).
 *   ficheiro: o caminho do ficheiro;
 *   ecra:     o ecrã do painel onde se corrige («Produtos › Babygrow»);
 *   mensagem: para a dona, em português simples, sem caminhos de JSON;
 *   campo?:   o campo onde o painel mostra o erro ('preco', 'opcoes.0.nome');
 *   efeito?:  só nos «neutraliza»: 'esconder' | 'sem_fotografia';
 *   slug?, foto?, indice?, lembrete?
 * }
 *
 * «NÃO FOI DITO» E NULL SÃO O MESMO. E o vazio testa-se ANTES de converter: Number(null) é 0, e 0
 * é uma escolha (memória numero-zero-nao-e-nao-foi-dito).
 */

/* ------------------------------------------------------------------ */
/* Onde estão as coisas                                                */
/* ------------------------------------------------------------------ */

export const FICHEIROS = Object.freeze({
  loja: 'content/loja.json',
  catalogo: 'content/catalogo.json',
  fotos: 'content/fotos.json',
});
export const PASTAS = Object.freeze({ artigos: 'content/produtos', fotos: 'media/fotos' });
export const ficheiroDoArtigo = (nome) => `${PASTAS.artigos}/${nome}.json`;
export const ficheiroDaFoto = (nome) => `${PASTAS.fotos}/${nome}.jpg`;

/* As fotografias que as páginas usam pelo nome (a capa da página inicial, o «Do nosso Instagram»,
   o Sobre nós): estão em src/paginas.mjs e nunca saem da biblioteca. As das linhas e das ocasiões
   vêm do content/catalogo.json. */
export const FOTOS_FIXAS = Object.freeze(['vais-ser-avo', 'mercadinho', 'donas', 'ig-forro-fado', 'ig-sonho', 'ig-mapa', 'ig-maior-sonho', 'ig-coracao']);

/* AS ZONAS DE ENTREGA (content/loja.json, entrega.zonas): sempre estas quatro, por esta ordem. Os
   portes são da encomenda, não de cada produto. Uma zona com os portes por escrever (null) fica
   «por confirmar»: em modo «encomenda» a encomenda segue e a loja diz os portes antes do
   pagamento; em modo «online» a zona não aparece no finalizar (não se cobra o que não se sabe). A
   entrega em mão não leva morada. Os portes grátis valem só para Portugal continental. */
export const ZONAS = Object.freeze(['continente', 'ilhas', 'estrangeiro', 'mao']);
export const NOMES_ZONAS = Object.freeze({ continente: 'Portugal continental', ilhas: 'Açores e Madeira', estrangeiro: 'Fora de Portugal', mao: 'Entrega em mão' });
export const ZONA_GRATIS = 'continente';
export const zonaComMorada = (id) => id !== 'mao';

/* Os campos de um produto, PELA ORDEM DO FORMULÁRIO. Uma chave nova entra por esta ordem
   (ordenarComo()); as que já estão no ficheiro ficam onde estão. */
export const CAMPOS_ARTIGO = Object.freeze([
  'nome', 'categoria', 'ocasioes', 'preco', 'resumo', 'fotos',
  'tamanhos', 'cores', 'opcoes', 'personalizacao', 'detalhes',
  'destaque', 'publicado', 'ordem',
]);
/* Sempre escritos pelo painel, com o valor explícito. Ausentes valem o valor por omissão (é o que
   o gerador faz). */
export const BOOLEANOS_ARTIGO = Object.freeze(['destaque', 'publicado']);
export const POR_OMISSAO = Object.freeze({ publicado: true, destaque: false, ordem: 500 });

export const NOMES_CAMPOS = Object.freeze({
  nome: 'Nome do produto', categoria: 'Categoria', ocasioes: 'Ocasiões', preco: 'Preço', resumo: 'Frase curta', fotos: 'Fotografias',
  tamanhos: 'Tamanhos', cores: 'Cores', opcoes: 'Escolhas', personalizacao: 'Personalização', detalhes: 'Detalhes',
  destaque: 'Em «Mais pedidos» na página inicial', publicado: 'Publicado no site', ordem: 'Posição na lista',
});

/* ------------------------------------------------------------------ */
/* Limites                                                             */
/* ------------------------------------------------------------------ */

/* Os números: [mínimo, máximo]. */
export const LIMITES = Object.freeze({ preco: [0.01, 10000], suplemento: [0, 1000], portes: [0, 1000], gratis: [0, 10000], ordem: [0, 9999], max: [1, 200] });
/* Tamanhos máximos dos textos, em caracteres (e das listas, em linhas). */
export const TAMANHOS = Object.freeze({
  nome: 100, resumo: 300, detalhes: 12, detalhe: 120,
  opcoes: 4, valores: 16, opcaoNome: 40, valorNome: 60,
  cores: 16, corNome: 30, ocasioes: 12, fotos: 12, nomeFoto: 120, alt: 300,
  rotulo: 60, pista: 100, opcional: 60,
  slogan: 120, descricao: 300, instagram: 30, producao: 60, prazo: 60, concelho: 60,
  empresaNome: 160, nif: 20, morada: 200, email: 160, telefone: 20, zonaNome: 60,
  linhaNome: 40, frase: 200, catNome: 40, ocasiaoNome: 40,
  conjuntos: 20, conjuntoNome: 60, tamanhoValores: 20, tamanhoValor: 30, paleta: 60,
});
/* O que o Worker do painel aceita gravar (recusa acima); aqui só se lembra, a partir de 80 %. */
export const TECTOS = Object.freeze({ artigoBytes: 64 * 1024, aviso: 0.8 });

/* As palavras que a lei só deixa usar com prova (Diretiva (UE) 2024/825, aplicável desde 27 set
   2026: alegações ambientais genéricas) e as certificações que a loja não nos mostrou. */
export const RE_ALEGACOES = /\b(ecol[óo]gic[oa]s?|sustent[áa]ve(l|is)|sustentabilidade|amig[oa]s? do ambiente|eco-?friendly|biodegrad[áa]ve(l|is)|neutr[oa]s? em carbono|certificad[oa]s?)\b/i;

/* Os modos da loja online: «encomenda» (o site regista a encomenda e a loja combina o pagamento
   com o cliente) e «online» (paga-se na Stripe, no próprio site: cartão e MB WAY). O Worker das
   encomendas lê o mesmo valor do catálogo publicado. */
export const MODOS_PAGAMENTO = Object.freeze({ encomenda: 'Encomenda (a loja confirma e combina o pagamento)', online: 'Pagamento no site (Stripe: cartão e MB WAY)' });

/* ------------------------------------------------------------------ */
/* Ajudantes que o painel e os Workers também usam                     */
/* ------------------------------------------------------------------ */

const eObjecto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const ausente = (x) => x === null || x === undefined;
const vazio = (x) => ausente(x) || (typeof x === 'string' && x.trim() === '') || (Array.isArray(x) && x.length === 0);
const temTexto = (x) => typeof x === 'string' && x.trim() !== '';
const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const duasCasas = (n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
const bytesDe = (s) => new TextEncoder().encode(s).length;
const numeroEm = (n, [min, max]) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max && duasCasas(n);

export const terminacaoDe = (texto) => (typeof texto === 'string' && texto.endsWith('\n') ? '\n' : '');
/* Como os ficheiros estão escritos: 2 espaços e a terminação de cada um (todos com \n no fim).
   Abrir e gravar sem mexer deixa o ficheiro igual, byte a byte. */
export function serializar(obj, terminacao = '\n') { return JSON.stringify(obj, null, 2) + (terminacao || ''); }

/* O endereço da página, a partir do nome do ficheiro — IGUAL ao do gerador, que usa o nome tal e
   qual. */
export const slugDoFicheiro = (nome) => String(nome).replace(/\.json$/, '');
const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugValido = (s) => typeof s === 'string' && s.length <= 100 && RE_SLUG.test(s);

/* NIF português: 9 algarismos (com ou sem espaços), o primeiro nunca é 0, e o de controlo
   (módulo 11). */
export function nifValido(nif) {
  const s = String(nif ?? '').replace(/\s/g, '');
  if (!/^[1-9][0-9]{8}$/.test(s)) return false;
  let soma = 0;
  for (let i = 0; i < 8; i++) soma += Number(s[i]) * (9 - i);
  const resto = soma % 11;
  return (resto < 2 ? 0 : 11 - resto) === Number(s[8]);
}

/* O SLUG DE UM PRODUTO NOVO: gerado UMA vez, ao criar, a partir do nome, e nunca mais muda — é o
   endereço da página que a loja partilha no Instagram. Minúsculas, sem acentos, o resto passa a
   hífen («Body «Olá mundo»» → body-ola-mundo). Repetido: -2, -3… */
export function gerarSlug(nome, existentes = []) {
  const ja = existentes instanceof Set ? existentes : new Set(existentes);
  let base = String(ausente(nome) ? '' : nome)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 80).replace(/-+$/, '');
  if (!base) base = 'produto';
  let slug = base;
  for (let n = 2; ja.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/* O NOME DE UMA FOTOGRAFIA: o do ficheiro em media/fotos/, sem «.jpg». Só minúsculas, algarismos
   e hífens (um espaço num nome parte o srcset — memória srcset-nome-com-espaco). */
export const nomeDeFotoValido = (n) => typeof n === 'string' && n.length <= TAMANHOS.nomeFoto && RE_SLUG.test(n);

/* Caracteres de controlo, por escape e nunca literais no código. */
const RE_CONTROLO_LINHA = /[\u0000-\u001F\u007F]/;
const RE_CONTROLO_TEXTO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
/* «</script» e «<!--»: dentro de um <script> do JSON-LD, um fecha o elemento a meio e o outro
   muda a forma como o browser o lê. Não há texto honesto que os precise. */
const RE_PARTE_A_PAGINA = /<\/script|<!--/i;

export const RE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const emailValido = (v) => typeof v === 'string' && v.length <= TAMANHOS.email && RE_EMAIL.test(v.trim());

/* Um número português de 9 algarismos, ou com o indicativo (+351, 00351, 351). → os 9
   algarismos, ou null. */
export function numeroPortugues(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  let d = String(v).replace(/[\s.-]/g, '');
  if (d.startsWith('+351')) d = d.slice(4); else if (d.startsWith('00351')) d = d.slice(5); else if (/^351\d{9}$/.test(d)) d = d.slice(3);
  return /^[29]\d{8}$/.test(d) ? d : null;
}
export const eTelemovel = (v) => /^9[1236]\d{7}$/.test(numeroPortugues(v) ?? '');
const RE_INSTAGRAM = /^[A-Za-z0-9._]{1,30}$/;
const RE_HEX = /^#[0-9A-Fa-f]{6}$/;
const RE_FOCO = /^(\d{1,3})% (\d{1,3})%$/;
export const focoValido = (f) => { const m = RE_FOCO.exec(String(f ?? '')); return Boolean(m) && Number(m[1]) <= 100 && Number(m[2]) <= 100; };

/* Em cêntimos inteiros: 0.1 + 0.2 !== 0.3 em vírgula flutuante. */
export const centimos = (v) => Math.round(v * 100);

/* Igualdade de valores lidos de JSON, com null ≡ ausente e sem ligar à ordem das chaves. */
export function mesmoValor(a, b) {
  if (ausente(a) && ausente(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => mesmoValor(x, b[i]));
  }
  if (eObjecto(a) || eObjecto(b)) {
    if (!eObjecto(a) || !eObjecto(b)) return false;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!mesmoValor(a[k], b[k])) return false;
    return true;
  }
  return a === b;
}

/* Os textos de um valor (em profundidade), com o caminho de cada um. */
function textosDe(v, caminho = '') {
  if (typeof v === 'string') return [[caminho, v]];
  const filhos = Array.isArray(v) ? Array.from(v, (x, i) => [i, x]) : eObjecto(v) ? Object.entries(v) : [];
  return filhos.flatMap(([k, x]) => textosDe(x, caminho ? `${caminho}.${k}` : String(k)));
}

/* Lê um ficheiro: o TEXTO (string), o objecto já lido, ou null/undefined. */
function lerJson(valor) {
  if (ausente(valor)) return { ausente: true };
  if (typeof valor !== 'string') return { obj: valor, texto: null };
  try { return { obj: JSON.parse(valor), texto: valor }; } catch (e) { return { ilegivel: String((e && e.message) || e).slice(0, 120), texto: valor }; }
}

/* As fotografias que existem para o site: as que têm ficheiro em media/fotos/ E entrada em
   content/fotos.json (o gerador precisa das duas: o ficheiro para as versões web, a entrada para o
   texto alternativo). → Set de nomes, ou null se não se sabe (sem a lista dos ficheiros). */
export function fotosQueExistem(dados) {
  const d = eObjecto(dados) ? dados : {};
  if (!Array.isArray(d.ficheirosFotos)) return null;
  const f = lerJson(d.fotos);
  const meta = eObjecto(f.obj) ? f.obj : {};
  return new Set(d.ficheirosFotos.filter((n) => eObjecto(meta[n])));
}

/* ------------------------------------------------------------------ */
/* O catálogo: linhas, categorias, ocasiões, tamanhos e cores          */
/* ------------------------------------------------------------------ */

/* O que o resto das regras precisa do catálogo, já limpo (ou null, se não se lê):
   { categorias: [id], ocasioes: [id], tamanhos: { id: [valores] }, cores: { nome: '#hex' } } */
export function catalogoDe(valor) {
  const l = lerJson(valor);
  const c = l.obj;
  if (!eObjecto(c)) return null;
  const linhas = Array.isArray(c.linhas) ? c.linhas.filter((x) => eObjecto(x) && Array.isArray(x.categorias)) : [];
  const categorias = linhas.flatMap((x) => x.categorias.filter((id) => typeof id === 'string' && eObjecto(c.categorias) && temTexto(c.categorias[id])));
  const ocasioes = Array.isArray(c.ocasioes) ? c.ocasioes.filter((o) => eObjecto(o) && temTexto(o.id)).map((o) => o.id) : [];
  const tamanhos = {};
  if (eObjecto(c.tamanhos)) for (const [id, t] of Object.entries(c.tamanhos)) if (eObjecto(t) && Array.isArray(t.valores)) tamanhos[id] = t.valores.filter(temTexto).map((v) => v.trim());
  const cores = eObjecto(c.cores) ? Object.fromEntries(Object.entries(c.cores).filter(([, h]) => RE_HEX.test(String(h)))) : {};
  return { categorias, ocasioes, tamanhos, cores };
}

/* A linha (Personalizados, Bebé, Presentes) de uma categoria. */
export function linhaDaCategoria(catalogo, categoria) {
  const c = lerJson(catalogo).obj;
  if (!eObjecto(c) || !Array.isArray(c.linhas)) return null;
  const l = c.linhas.find((x) => eObjecto(x) && Array.isArray(x.categorias) && x.categorias.includes(categoria));
  return l ? l.id : null;
}

/* ------------------------------------------------------------------ */
/* Um produto: o que se escolhe e quanto custa                         */
/* ------------------------------------------------------------------ */

/* O preço de um produto. Sem promoções (a Franja Kids não as tem): a mesma forma das outras lojas
   para o painel. Sem preço (ainda por dizer), atual é null. */
export function precoDe(p) {
  return { atual: eObjecto(p) && typeof p.preco === 'number' && Number.isFinite(p.preco) ? p.preco : null, anterior: null, ate: '' };
}

/* As escolhas de um produto (a manga, o desenho, as peças), já limpas: só os grupos com nome e
   com dois valores ou mais, e só os valores com nome. Cada valor tem o suplemento (0 se não foi
   dito). O primeiro valor SEM suplemento é o que a ficha marca à partida: assim o preço anunciado
   é o que se paga (memória preco-anunciado-tem-de-ser-obtenivel). */
export function opcoesDe(a) {
  if (!eObjecto(a) || !Array.isArray(a.opcoes)) return [];
  return a.opcoes
    .filter((g) => eObjecto(g) && temTexto(g.nome) && Array.isArray(g.valores))
    .map((g) => ({
      nome: g.nome.trim(),
      valores: g.valores.filter((v) => eObjecto(v) && temTexto(v.nome)).map((v) => ({
        nome: v.nome.trim(),
        suplemento: typeof v.suplemento === 'number' && Number.isFinite(v.suplemento) && v.suplemento > 0 ? v.suplemento : 0,
      })),
    }))
    .filter((g) => g.valores.length >= 2);
}

/* Os tamanhos de um produto: os do conjunto que ele escolheu no catálogo (content/catalogo.json,
   tamanhos), ou nenhum. `cat` é o catalogoDe(). */
export function tamanhosDe(a, cat) {
  if (!eObjecto(a) || !temTexto(a.tamanhos) || !cat || !eObjecto(cat.tamanhos)) return [];
  return cat.tamanhos[a.tamanhos] || [];
}

/* As cores de um produto: [{ nome, foto? }] (a fotografia que a ficha mostra quando se escolhe a
   cor; só se for uma das fotografias do produto). */
export function coresDe(a) {
  if (!eObjecto(a) || !Array.isArray(a.cores)) return [];
  const fotos = Array.isArray(a.fotos) ? a.fotos : [];
  const vistas = new Set();
  const out = [];
  for (const c of a.cores) {
    if (!eObjecto(c) || !temTexto(c.nome)) continue;
    const nome = c.nome.trim();
    if (vistas.has(nome.toLowerCase())) continue;
    vistas.add(nome.toLowerCase());
    out.push(temTexto(c.foto) && fotos.includes(c.foto) ? { nome, foto: c.foto } : { nome });
  }
  return out;
}

/* A personalização de um produto, já limpa, ou null:
   { rotulo, pista, max, obrigatoria, opcional, suplemento }
     · opcional (texto da caixa, ex.: «Bordar um nome»): a personalização é uma caixa que se marca,
       com o acréscimo `suplemento`; marcada, o texto é obrigatório;
     · sem `opcional`: o campo de texto está sempre à vista; `obrigatoria` diz se é preciso. */
export function personalizacaoDe(a) {
  const ps = eObjecto(a) ? a.personalizacao : null;
  if (!eObjecto(ps) || !temTexto(ps.rotulo)) return null;
  const opcional = temTexto(ps.opcional) ? ps.opcional.trim() : null;
  const max = Number.isInteger(ps.max) && ps.max >= LIMITES.max[0] && ps.max <= LIMITES.max[1] ? ps.max : 40;
  const suplemento = opcional && typeof ps.suplemento === 'number' && Number.isFinite(ps.suplemento) && ps.suplemento > 0 ? ps.suplemento : 0;
  return { rotulo: ps.rotulo.trim(), pista: temTexto(ps.pista) ? ps.pista.trim() : '', max, obrigatoria: !opcional && ps.obrigatoria === true, opcional, suplemento };
}

/* «Desde»: só quando alguma escolha pode fazer o preço subir. */
export const temSuplementos = (a) => opcoesDe(a).some((g) => g.valores.some((v) => v.suplemento > 0)) || (personalizacaoDe(a)?.suplemento || 0) > 0;

/* No site, como o gerador decide: tudo menos `publicado: false`. */
export const noSite = (a) => eObjecto(a) && a.publicado !== false;
/* Compra-se no site (vai para o carrinho)? Publicado e com preço. */
export const compravel = (a) => noSite(a) && typeof a.preco === 'number' && Number.isFinite(a.preco);

/* O nome que o ecrã mostra, numa linha só, cortado a 80. */
export const nomeDoArtigo = (a, slug) => {
  const n = eObjecto(a) && temTexto(a.nome) ? a.nome.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const curto = n.length > 80 ? `${n.slice(0, 79)}…` : n;
  return curto || slug || 'produto sem nome';
};
const ecraDoArtigo = (a, slug) => `Produtos › ${nomeDoArtigo(a, slug)}`;

/* A ESCOLHA DE UMA LINHA DO CARRINHO, conferida e com o preço de uma unidade. A mesma conta no
   carrinho do site (assets/js/site.js), no gerador (o catálogo publicado) e no Worker das
   encomendas — o site, o carrinho e a Stripe nunca discordam.
     a       — o produto (o ficheiro, ou a entrada do catálogo publicado, que tem a mesma forma);
     escolha — { tamanho?, cor?, opcoes?: { <grupo>: <valor> }, personalizar?, texto? }
     cat     — o catalogoDe() (para os tamanhos), ou, numa entrada do catálogo publicado, nada
               (a entrada já traz `tamanhos` como lista).
   → { ok: true, unidade_cents, escolhas: ['Tamanho: 1 mês', …], texto, personalizada }
   | { ok: false, campo, mensagem }   (a frase vai tal e qual para o site) */
export function conferirEscolha(a, escolha = {}, cat = null) {
  const e = eObjecto(escolha) ? escolha : {};
  const nome = nomeDoArtigo(a, '');
  if (!compravel(a)) return { ok: false, campo: 'produto', mensagem: `«${nome}» já não se vende no site.` };
  const escolhas = [];
  let cents = centimos(a.preco);

  const tamanhos = Array.isArray(a.tamanhos) ? a.tamanhos : tamanhosDe(a, cat);
  if (tamanhos.length) {
    if (!tamanhos.includes(e.tamanho)) return { ok: false, campo: 'tamanho', mensagem: `Escolhe o tamanho de «${nome}».` };
    escolhas.push(`Tamanho: ${e.tamanho}`);
  }
  const cores = coresDe(a).map((c) => c.nome);
  if (cores.length) {
    const cor = cores.length === 1 && ausente(e.cor) ? cores[0] : e.cor;
    if (!cores.includes(cor)) return { ok: false, campo: 'cor', mensagem: `Escolhe a cor de «${nome}».` };
    escolhas.push(`Cor: ${cor}`);
  }
  const pedidas = eObjecto(e.opcoes) ? e.opcoes : {};
  for (const g of opcoesDe(a)) {
    // só as chaves do próprio pedido («constructor» não é uma escolha)
    const pedida = Object.hasOwn(pedidas, g.nome) ? pedidas[g.nome] : undefined;
    let v = g.valores.find((x) => x.nome === pedida);
    if (!v && !ausente(pedida)) return { ok: false, campo: 'opcoes', mensagem: `«${pedida}» já não é uma escolha de «${nome}». Escolhe outra vez.` };
    if (!v) v = g.valores.find((x) => !x.suplemento) || g.valores[0];
    escolhas.push(`${g.nome}: ${v.nome}`);
    cents += centimos(v.suplemento);
  }
  const ps = personalizacaoDe(a);
  let texto = '';
  let personalizada = false;
  if (ps) {
    /* Os invisíveis (espaços de largura zero, marcas de direcção) saem antes do trim, que não os tira:
       um nome feito só deles não é um nome, e não se cobra (memória trim-nao-tira-invisiveis). */
    const t = typeof e.texto === 'string' ? e.texto.replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim() : '';
    if (ps.opcional) {
      if (e.personalizar === true) {
        if (!t) return { ok: false, campo: 'texto', mensagem: `Escreve «${ps.rotulo}» de «${nome}», ou tira a personalização.` };
        texto = t; personalizada = true;
        cents += centimos(ps.suplemento);
      }
    } else {
      if (ps.obrigatoria && !t) return { ok: false, campo: 'texto', mensagem: `Escreve «${ps.rotulo}» de «${nome}».` };
      texto = t; personalizada = Boolean(t);
    }
    if (texto.length > ps.max) return { ok: false, campo: 'texto', mensagem: `«${ps.rotulo}» de «${nome}» tem mais de ${ps.max} caracteres.` };
    if (RE_CONTROLO_LINHA.test(texto) || RE_PARTE_A_PAGINA.test(texto)) return { ok: false, campo: 'texto', mensagem: `«${ps.rotulo}» de «${nome}» tem caracteres que não se podem usar.` };
    if (personalizada) escolhas.push(`${ps.rotulo}: ${texto}`);
  }
  return { ok: true, unidade_cents: cents, escolhas, texto, personalizada };
}

/* Os portes de uma encomenda, em cêntimos, ou null quando estão por confirmar (a zona sem
   portes). `zona` = { id, portes }; os portes grátis só valem para Portugal continental. */
export function portesDe(zona, artigosCents, gratisAPartirDe) {
  if (!eObjecto(zona) || typeof zona.portes !== 'number') return null;
  if (zona.id === ZONA_GRATIS && typeof gratisAPartirDe === 'number' && artigosCents >= centimos(gratisAPartirDe)) return 0;
  return centimos(zona.portes);
}

/* ------------------------------------------------------------------ */
/* Os problemas de um produto                                          */
/* ------------------------------------------------------------------ */

/* Os problemas de UM produto. O painel usa-o campo a campo.
   ctx = { nome, catalogo?: catalogoDe() | null, fotos?: Set | null (as que existem), producao? }
   O que falta no ctx não se confere. */
export function problemasDoArtigo(a, ctx = {}) {
  const nome = typeof ctx.nome === 'string' ? ctx.nome : '';
  const slug = slugDoFicheiro(nome);
  const ficheiro = ficheiroDoArtigo(nome);
  const cat = ctx.catalogo && typeof ctx.catalogo === 'object' ? ctx.catalogo : null;
  const fotosExistem = ctx.fotos instanceof Set ? ctx.fotos : null;
  const out = [];
  const ecra = ecraDoArtigo(a, slug);
  const base = { ficheiro, ecra, slug };
  const chave = (regra) => `artigo:${slug}:${regra}`;
  const neutraliza = (regra, efeito, campo, mensagem, extra = {}) => out.push({ classe: 'neutraliza', chave: chave(regra), campo, efeito, mensagem, ...base, ...extra });
  const avisa = (regra, campo, mensagem, extra = {}) => out.push({ classe: 'avisa', chave: chave(regra), campo, mensagem, ...base, ...extra });
  const lembra = (regra, campo, mensagem, extra = {}) => avisa(regra, campo, mensagem, { lembrete: true, ...extra });
  if (!eObjecto(a)) return out;   // a forma do ficheiro é do problemas(): bloqueia

  // --- neutraliza: o que o site não pode mostrar --------------------------
  for (const [campo, falta, genero] of [['nome', 'o nome do produto', 'o'], ['resumo', 'a frase curta', 'a']]) {
    const x = a[campo];
    if (vazio(x)) neutraliza(campo, 'esconder', campo, `Falta ${falta}: o produto fica escondido do site até estar preenchid${genero}.`);
    else if (typeof x !== 'string') neutraliza(campo, 'esconder', campo, `«${NOMES_CAMPOS[campo]}» tem de ser texto: o produto fica escondido do site até ser corrigido.`);
  }
  const categoria = a.categoria;
  if (vazio(categoria)) neutraliza('categoria', 'esconder', 'categoria', 'Falta a categoria: o produto fica escondido do site até escolher uma.');
  else if (typeof categoria !== 'string' || (cat && !cat.categorias.includes(categoria))) neutraliza('categoria', 'esconder', 'categoria', 'A categoria não é nenhuma das do site: o produto fica escondido até escolher uma da lista.');

  /* O preço: sem ele, o cartão e o carrinho não têm o que mostrar. Na pré-visualização aparece
     «preço por confirmar» e a ficha pede por mensagem; no site a sério fica escondido até haver um
     (DL 138/90: um produto à venda tem de ter o preço). */
  const p = a.preco;
  if (vazio(p)) {
    if (ctx.producao) neutraliza('preco:producao', 'esconder', 'preco', 'Falta o preço: o produto fica escondido do site até o escrever.');
    else lembra('preco:previa', 'preco', 'Falta o preço: na pré-visualização aparece «preço por confirmar», e no site a sério o produto fica escondido até o escrever.');
  } else if (!numeroEm(p, LIMITES.preco)) {
    neutraliza('preco', 'esconder', 'preco', 'O preço é só o número, sem € (ex.: 12 ou 16,90): o produto fica escondido do site até ser corrigido.');
  }

  const partem = [];
  for (const [caminho, t] of textosDe(a)) if (RE_PARTE_A_PAGINA.test(t)) partem.push(caminho.split('.')[0]);
  if (partem.length) {
    const campos = [...new Set(partem)];
    neutraliza('partia-a-pagina', 'esconder', campos[0], `${campos.map((c) => `«${NOMES_CAMPOS[c] || c}»`).join(', ')}: tem «</script» ou «<!--», que não podem ir para o site. O produto fica escondido do site até isso ser corrigido.`, { campos });
  }
  const alegam = [];
  for (const [caminho, t] of textosDe(a)) { const m = t.match(RE_ALEGACOES); if (m) alegam.push([caminho.split('.')[0], m[0]]); }
  if (alegam.length) {
    neutraliza('alegacoes', 'esconder', alegam[0][0], `«${alegam[0][1]}» é uma palavra que a lei só deixa usar com prova (ou uma certificação que não temos): o produto fica escondido do site até a tirar.`, { campos: [...new Set(alegam.map((x) => x[0]))] });
  }

  // --- fotografias ---------------------------------------------------------
  const fotos = a.fotos;
  const lista = Array.isArray(fotos) ? fotos : [];
  if (!ausente(fotos) && !Array.isArray(fotos)) avisa('fotos', 'fotos', 'As fotografias não estão gravadas como uma lista. Escolha-as outra vez.');
  const vistos = new Set();
  let boas = 0;
  lista.forEach((f, indice) => {
    const extra = { foto: f, indice };
    if (!nomeDeFotoValido(f)) {
      neutraliza(`foto-invalida:${String(f).slice(0, 80)}`, 'sem_fotografia', 'fotos', `«${String(f).slice(0, 60)}» não é uma fotografia da biblioteca: não aparece no site. Tire-a do produto e escolha-a outra vez.`, extra);
      return;
    }
    if (vistos.has(f)) { avisa(`foto-repetida:${f}`, 'fotos', 'Há uma fotografia duas vezes no produto. Tire uma delas.', extra); return; }
    vistos.add(f);
    if (fotosExistem && !fotosExistem.has(f)) {
      neutraliza(`foto-em-falta:${f}`, 'sem_fotografia', 'fotos', 'Uma das fotografias já não está na biblioteca: não aparece no site. Tire-a do produto, ou carregue-a outra vez.', extra);
      return;
    }
    boas++;
  });
  if (lista.length > TAMANHOS.fotos) avisa('fotos-a-mais', 'fotos', `O produto tem ${lista.length} fotografias; o máximo é ${TAMANHOS.fotos}. Tire as que estão a mais.`);
  /* Sem nenhuma fotografia boa, o cartão da loja não tem imagem: o produto fica escondido até ter
     uma. */
  if (!boas) neutraliza('sem-fotos', 'esconder', 'fotos', 'O produto não tem fotografias: fica escondido do site até ter pelo menos uma (a primeira é a capa).');

  // --- interruptores, números e listas fechadas ------------------------------------
  for (const b of BOOLEANOS_ARTIGO) {
    if (!ausente(a[b]) && typeof a[b] !== 'boolean') avisa(b, b, `«${NOMES_CAMPOS[b]}» tem de ser sim ou não.`);
  }
  const o = a.ordem;
  if (!ausente(o) && o !== '' && (typeof o !== 'number' || !Number.isInteger(o) || o < LIMITES.ordem[0] || o > LIMITES.ordem[1])) {
    avisa('ordem', 'ordem', `A posição é um número inteiro de 0 a ${LIMITES.ordem[1]} (mais baixo aparece primeiro).`);
  }
  const oc = a.ocasioes;
  if (!ausente(oc)) {
    if (!Array.isArray(oc)) avisa('ocasioes', 'ocasioes', 'As ocasiões não estão gravadas como uma lista. Escolha-as outra vez.');
    else {
      if (oc.length > TAMANHOS.ocasioes) avisa('ocasioes:quantas', 'ocasioes', `O produto tem ${oc.length} ocasiões; o máximo é ${TAMANHOS.ocasioes}.`);
      if (new Set(oc).size !== oc.length) avisa('ocasioes:repetida', 'ocasioes', 'Há uma ocasião repetida. Tire uma delas.');
      for (const id of oc) {
        if (typeof id !== 'string' || (cat && !cat.ocasioes.includes(id))) { avisa(`ocasioes:${String(id).slice(0, 40)}`, 'ocasioes', `«${String(id).slice(0, 40)}» não é uma das ocasiões do site. Tire-a e escolha da lista.`); }
      }
    }
  }
  const t = a.tamanhos;
  if (!ausente(t) && t !== '' && (typeof t !== 'string' || (cat && !tem(cat.tamanhos, t)))) avisa('tamanhos', 'tamanhos', 'Os tamanhos escolhidos já não existem: escolha outros da lista (ou nenhuns).');

  // --- detalhes (uma linha cada) -------------------------------------------------
  const det = a.detalhes;
  if (!ausente(det)) {
    if (!Array.isArray(det)) avisa('detalhes', 'detalhes', '«Detalhes» não está gravado como uma lista. Escreva-o outra vez.');
    else {
      if (det.length > TAMANHOS.detalhes) avisa('detalhes:quantos', 'detalhes', `«Detalhes» tem ${det.length} linhas; o máximo é ${TAMANHOS.detalhes}.`);
      det.forEach((x, i) => {
        if (typeof x !== 'string' || !x.trim()) avisa(`detalhes.${i}`, 'detalhes', `A linha ${i + 1} de «Detalhes» está vazia: escreva-a ou tire-a.`);
        else if (x.length > TAMANHOS.detalhe) avisa(`detalhes.${i}:tamanho`, 'detalhes', `A linha ${i + 1} de «Detalhes» tem mais de ${TAMANHOS.detalhe} caracteres.`);
        else if (RE_CONTROLO_LINHA.test(x)) avisa(`detalhes.${i}:controlo`, 'detalhes', `A linha ${i + 1} de «Detalhes» tem caracteres invisíveis. Escreva-a outra vez.`);
      });
    }
  }

  // --- cores ---------------------------------------------------------------------
  const cs = a.cores;
  if (!ausente(cs)) {
    if (!Array.isArray(cs)) avisa('cores', 'cores', 'As cores não estão gravadas como uma lista. Escreva-as outra vez.');
    else {
      if (cs.length > TAMANHOS.cores) avisa('cores:quantas', 'cores', `O produto tem ${cs.length} cores; o máximo é ${TAMANHOS.cores}.`);
      const nomes = new Set();
      cs.forEach((c, i) => {
        const onde = `cores.${i}`;
        if (!eObjecto(c) || !temTexto(c.nome)) { avisa(`${onde}.nome`, `${onde}.nome`, `A cor ${i + 1} não tem nome.`); return; }
        if (c.nome.length > TAMANHOS.corNome) avisa(`${onde}.nome:tamanho`, `${onde}.nome`, `O nome da cor ${i + 1} tem mais de ${TAMANHOS.corNome} caracteres.`);
        const k = c.nome.trim().toLowerCase();
        if (nomes.has(k)) avisa(`${onde}.nome:repetido`, `${onde}.nome`, `A cor «${c.nome.trim()}» está repetida.`);
        nomes.add(k);
        if (!ausente(c.foto) && c.foto !== '' && !lista.includes(c.foto)) avisa(`${onde}.foto`, `${onde}.foto`, `A fotografia da cor «${c.nome.trim()}» já não é uma das fotografias do produto: escolha outra, ou nenhuma.`);
        if (cat && !tem(cat.cores, c.nome.trim()) && noSite(a)) lembra(`cor-sem-amostra:${k}`, `${onde}.nome`, `A cor «${c.nome.trim()}» não tem amostra: na ficha aparece só o nome. Pode juntá-la em Categorias › Cores.`);
      });
    }
  }

  // --- escolhas (a manga, o desenho; com ou sem acréscimo) ----------------------------
  const ops = a.opcoes;
  if (!ausente(ops)) {
    if (!Array.isArray(ops)) avisa('opcoes', 'opcoes', 'As escolhas não estão gravadas como uma lista. Escreva-as outra vez.');
    else {
      if (ops.length > TAMANHOS.opcoes) avisa('opcoes:quantas', 'opcoes', `O produto tem ${ops.length} escolhas; o máximo é ${TAMANHOS.opcoes}.`);
      const nomesG = new Set();
      ops.forEach((g, i) => {
        const onde = `A escolha ${i + 1}`;
        if (!eObjecto(g) || !Array.isArray(g.valores)) { avisa(`opcoes.${i}`, `opcoes.${i}`, `${onde} não está como deve ser: escreva-a outra vez.`); return; }
        if (!temTexto(g.nome)) avisa(`opcoes.${i}.nome`, `opcoes.${i}.nome`, `${onde} não tem nome (ex.: Manga).`);
        else {
          if (g.nome.length > TAMANHOS.opcaoNome) avisa(`opcoes.${i}.nome:tamanho`, `opcoes.${i}.nome`, `O nome da escolha ${i + 1} tem mais de ${TAMANHOS.opcaoNome} caracteres.`);
          const k = g.nome.trim().toLowerCase();
          if (['tamanho', 'cor'].includes(k)) avisa(`opcoes.${i}.nome:reservado`, `opcoes.${i}.nome`, `«${g.nome.trim()}» já tem o seu campo no produto (Tamanhos, Cores): use-o em vez de uma escolha.`);
          if (nomesG.has(k)) avisa(`opcoes.${i}.nome:repetido`, `opcoes.${i}.nome`, `Há duas escolhas com o nome «${g.nome.trim()}».`);
          nomesG.add(k);
        }
        if (g.valores.length < 2) avisa(`opcoes.${i}:poucos`, `opcoes.${i}.valores`, `${onde} tem de ter pelo menos dois valores para escolher (com um só não aparece).`);
        if (g.valores.length > TAMANHOS.valores) avisa(`opcoes.${i}:muitos`, `opcoes.${i}.valores`, `${onde} tem ${g.valores.length} valores; o máximo é ${TAMANHOS.valores}.`);
        /* Uma escolha sem nenhum valor sem acréscimo faria o preço anunciado impossível de pagar. */
        if (g.valores.length && g.valores.every((v) => eObjecto(v) && typeof v.suplemento === 'number' && v.suplemento > 0)) {
          avisa(`opcoes.${i}:sem-base`, `opcoes.${i}.valores`, `${onde}: pelo menos um valor tem de ser sem acréscimo (o preço do produto é o desse valor).`);
        }
        const nomesV = new Set();
        g.valores.forEach((v, j) => {
          const ondeV = `opcoes.${i}.valores.${j}`;
          if (!eObjecto(v) || !temTexto(v.nome)) { avisa(`${ondeV}.nome`, ondeV, `${onde}: o valor ${j + 1} não tem nome.`); return; }
          if (v.nome.length > TAMANHOS.valorNome) avisa(`${ondeV}.nome:tamanho`, ondeV, `${onde}: o valor «${v.nome.slice(0, 30)}» tem mais de ${TAMANHOS.valorNome} caracteres.`);
          const kv = v.nome.trim().toLowerCase();
          if (nomesV.has(kv)) avisa(`${ondeV}.nome:repetido`, ondeV, `${onde}: o valor «${v.nome.trim()}» está repetido.`);
          nomesV.add(kv);
          const s = v.suplemento;
          if (!ausente(s) && s !== '' && !numeroEm(s, LIMITES.suplemento)) {
            avisa(`${ondeV}.suplemento`, `${ondeV}.suplemento`, `${onde}: o acréscimo de «${v.nome.trim()}» é só o número, sem € (ex.: 5), ou fica vazio (sem acréscimo).`);
          }
        });
      });
    }
  }

  // --- personalização ----------------------------------------------------------------
  const ps = a.personalizacao;
  if (!ausente(ps)) {
    if (!eObjecto(ps)) avisa('personalizacao', 'personalizacao', 'A personalização não está gravada como deve ser: escreva-a outra vez.');
    else {
      const campoTexto = (k, max, rotulo) => {
        const x = ps[k];
        if (ausente(x) || x === '') return;
        if (typeof x !== 'string' || x.length > max || RE_CONTROLO_LINHA.test(x)) avisa(`personalizacao.${k}`, `personalizacao.${k}`, `«${rotulo}» tem de ser um texto numa linha, até ${max} caracteres.`);
      };
      if (!temTexto(ps.rotulo)) avisa('personalizacao.rotulo', 'personalizacao.rotulo', 'Falta o nome do campo da personalização (ex.: Nome a bordar).');
      campoTexto('rotulo', TAMANHOS.rotulo, 'Nome do campo');
      campoTexto('pista', TAMANHOS.pista, 'Exemplo por baixo do campo');
      campoTexto('opcional', TAMANHOS.opcional, 'Texto da caixa');
      if (!ausente(ps.max) && ps.max !== '' && (!Number.isInteger(ps.max) || ps.max < LIMITES.max[0] || ps.max > LIMITES.max[1])) avisa('personalizacao.max', 'personalizacao.max', `O máximo de letras é um número inteiro de ${LIMITES.max[0]} a ${LIMITES.max[1]}.`);
      if (!ausente(ps.obrigatoria) && typeof ps.obrigatoria !== 'boolean') avisa('personalizacao.obrigatoria', 'personalizacao.obrigatoria', '«Obrigatória» tem de ser sim ou não.');
      if (temTexto(ps.opcional) && ps.obrigatoria === true) avisa('personalizacao:opcional-e-obrigatoria', 'personalizacao.obrigatoria', 'A personalização não pode ser ao mesmo tempo opcional (com a caixa) e obrigatória: escolha uma.');
      const s = ps.suplemento;
      if (!ausente(s) && s !== '') {
        if (!numeroEm(s, LIMITES.suplemento)) avisa('personalizacao.suplemento', 'personalizacao.suplemento', 'O acréscimo da personalização é só o número, sem € (ex.: 3), ou fica vazio.');
        else if (s > 0 && !temTexto(ps.opcional)) avisa('personalizacao.suplemento:sem-caixa', 'personalizacao.suplemento', 'O acréscimo só vale quando a personalização é opcional (a caixa que se marca). Sem caixa, ponha o valor no preço.');
      }
    }
  }

  // --- textos -------------------------------------------------------------
  const texto = (campo, max, { linha = true } = {}) => {
    const x = a[campo];
    if (ausente(x) || typeof x !== 'string') return;
    if (x.length > max) avisa(`${campo}:tamanho`, campo, `«${NOMES_CAMPOS[campo]}» tem mais de ${max} caracteres (tem ${x.length}).`);
    if ((linha ? RE_CONTROLO_LINHA : RE_CONTROLO_TEXTO).test(x)) avisa(`${campo}:controlo`, campo, `«${NOMES_CAMPOS[campo]}» tem caracteres invisíveis${linha ? ' (ex.: uma mudança de linha)' : ''}. Escreva-o outra vez.`);
  };
  texto('nome', TAMANHOS.nome);
  texto('resumo', TAMANHOS.resumo, { linha: false });
  return out;
}

/* ------------------------------------------------------------------ */
/* content/loja.json                                                   */
/* ------------------------------------------------------------------ */

export const SECCOES_LOJA = Object.freeze({ marca: 'A marca', entrega: 'Entregas e portes', pagamentos: 'Pagamento', empresa: 'Dados legais' });
/* O que o painel nunca muda: o nome da marca (nos textos legais e no Google), o concelho (o centro
   de arbitragem dos Termos depende dele) e as zonas de entrega (os ids e a ordem: o finalizar e o
   Worker conhecem-nas pelo id). Os portes e os nomes das zonas mudam-se. */
export const BLOQUEADOS_LOJA = Object.freeze(['nome', 'entrega.concelho']);
const CAMPOS_LOJA = Object.freeze(['nome', 'slogan', 'descricao', 'instagram', 'producao', 'entrega', 'pagamentos', 'empresa']);

export function problemasDaLoja(d, { producao = false } = {}) {
  const ficheiro = FICHEIROS.loja;
  const out = [];
  const ecraDe = (s) => `Dados da loja › ${SECCOES_LOJA[s] || s}`;
  const bloqueia = (chave, s, campo, mensagem) => out.push({ classe: 'bloqueia', chave: `loja:${chave}`, ficheiro, ecra: ecraDe(s), campo, mensagem });
  const avisa = (chave, s, campo, mensagem, extra = {}) => out.push({ classe: 'avisa', chave: `loja:${chave}`, ficheiro, ecra: ecraDe(s), campo, mensagem, ...extra });
  const legal = (chave, s, campo, mensagem) => (producao ? bloqueia(`${chave}:producao`, s, campo, mensagem) : avisa(chave, s, campo, mensagem, { lembrete: true }));
  if (!eObjecto(d)) { bloqueia('forma', 'marca', undefined, 'Os dados da loja não têm a forma certa. Só o Renato os pode corrigir.'); return out; }

  if (!temTexto(d.nome)) bloqueia('nome', 'marca', 'nome', 'Falta o nome da marca. Só o Renato o pode repor.');
  const linha = (k, s, max, rotulo, { obrigatorio = false } = {}) => {
    const x = d[k];
    if (vazio(x)) { if (obrigatorio) avisa(k, s, k, `Falta «${rotulo}».`); return; }
    if (typeof x !== 'string' || x.length > max || RE_CONTROLO_LINHA.test(x)) avisa(`${k}:forma`, s, k, `«${rotulo}» tem de ser um texto numa linha, até ${max} caracteres.`);
  };
  linha('slogan', 'marca', TAMANHOS.slogan, 'Frase da marca');
  linha('descricao', 'marca', TAMANHOS.descricao, 'Descrição para o Google', { obrigatorio: true });
  linha('producao', 'entrega', TAMANHOS.producao, 'Tempo de produção', { obrigatorio: true });
  if (!vazio(d.instagram) && !(typeof d.instagram === 'string' && RE_INSTAGRAM.test(d.instagram))) avisa('instagram', 'marca', 'instagram', 'O Instagram é só o nome da conta, sem @ nem endereço (ex.: franjakids).');

  // --- entrega ------------------------------------------------------------------------
  const e = d.entrega;
  if (!eObjecto(e)) bloqueia('entrega:forma', 'entrega', 'entrega', 'A secção «Entregas e portes» não está gravada, e sem ela o site não se consegue gerar. Só o Renato a pode repor.');
  else {
    const zonas = e.zonas;
    if (!Array.isArray(zonas) || zonas.length !== ZONAS.length || zonas.some((z, i) => !eObjecto(z) || z.id !== ZONAS[i])) {
      bloqueia('entrega.zonas:forma', 'entrega', 'entrega.zonas', 'As zonas de entrega não estão como o site precisa. Só o Renato as pode repor.');
    } else {
      zonas.forEach((z, i) => {
        const onde = `entrega.zonas.${i}`;
        if (!temTexto(z.nome) || z.nome.length > TAMANHOS.zonaNome || RE_CONTROLO_LINHA.test(z.nome)) avisa(`${onde}.nome`, 'entrega', `${onde}.nome`, `O nome da entrega ${i + 1} tem de ser um texto numa linha, até ${TAMANHOS.zonaNome} caracteres.`);
        if (!ausente(z.portes) && z.portes !== '' && !numeroEm(z.portes, LIMITES.portes)) avisa(`${onde}.portes`, 'entrega', `${onde}.portes`, 'Os portes são só o número, sem € (ex.: 3,50), 0 para grátis, ou ficam vazios (por confirmar).');
        if (z.id === 'mao' && typeof z.portes === 'number' && z.portes > 0) avisa(`${onde}.portes:mao`, 'entrega', `${onde}.portes`, 'A entrega em mão é sem custo: deixe 0.');
      });
      const continente = zonas[0];
      if (ausente(continente.portes) || continente.portes === '') legal('entrega.zonas.0.portes', 'entrega', 'entrega.zonas.0.portes', 'Faltam os portes para Portugal continental: o site diz «por confirmar» e a lei pede-os antes da encomenda (DL 24/2014, art. 4.º).');
    }
    const g = e.gratisAPartirDe;
    if (!ausente(g) && g !== '' && !numeroEm(g, LIMITES.gratis)) avisa('entrega.gratisAPartirDe', 'entrega', 'entrega.gratisAPartirDe', 'O valor dos portes grátis é só o número, sem € (ex.: 50), ou fica vazio (sem portes grátis).');
    for (const [k, max, rotulo] of [['prazoContinente', TAMANHOS.prazo, 'Prazo dos CTT'], ['concelho', TAMANHOS.concelho, 'Concelho']]) {
      const x = e[k];
      if (vazio(x)) avisa(`entrega.${k}`, 'entrega', `entrega.${k}`, `Falta «${rotulo}».`);
      else if (typeof x !== 'string' || x.length > max || RE_CONTROLO_LINHA.test(x)) avisa(`entrega.${k}:forma`, 'entrega', `entrega.${k}`, `«${rotulo}» tem de ser um texto numa linha, até ${max} caracteres.`);
    }
  }

  // --- pagamento ----------------------------------------------------------------------
  const pg = d.pagamentos;
  if (!ausente(pg) && (!eObjecto(pg) || (!ausente(pg.modo) && !tem(MODOS_PAGAMENTO, pg.modo)))) avisa('pagamentos.modo', 'pagamentos', 'pagamentos.modo', 'O modo da loja online tem de ser um da lista.');

  // --- dados legais ---------------------------------------------------------------------
  const em = d.empresa;
  if (!eObjecto(em)) bloqueia('empresa:forma', 'empresa', 'empresa', 'A secção «Dados legais» não está gravada, e sem ela os Termos não se conseguem gerar. Só o Renato a pode repor.');
  else {
    const texto = (k, max, rotulo) => {
      const x = em[k];
      if (vazio(x)) return false;
      if (typeof x !== 'string' || x.length > max || RE_CONTROLO_LINHA.test(x)) { avisa(`empresa.${k}:forma`, 'empresa', `empresa.${k}`, `«${rotulo}» tem de ser um texto numa linha, até ${max} caracteres.`); return false; }
      return true;
    };
    if (!texto('nome', TAMANHOS.empresaNome, 'Nome ou firma')) { if (vazio(em.nome)) legal('empresa.nome', 'empresa', 'empresa.nome', 'Falta o nome de quem vende (a firma, ou o nome do empresário): a lei pede-o no site (DL 7/2004, art. 10.º).'); }
    if (!texto('morada', TAMANHOS.morada, 'Morada')) { if (vazio(em.morada)) legal('empresa.morada', 'empresa', 'empresa.morada', 'Falta a morada: a lei pede-a no site (DL 7/2004, art. 10.º).'); }
    if (vazio(em.nif)) legal('empresa.nif', 'empresa', 'empresa.nif', 'Falta o NIF: a lei pede-o no site (DL 7/2004, art. 10.º).');
    else if (!nifValido(em.nif)) avisa('empresa.nif:invalido', 'empresa', 'empresa.nif', 'O NIF não está certo (9 algarismos, e o último é de controlo).');
    if (vazio(em.email)) legal('empresa.email', 'empresa', 'empresa.email', 'Falta o email da loja: a lei pede um contacto por email no site (DL 7/2004, art. 10.º), e os clientes respondem para lá.');
    else if (!emailValido(em.email)) avisa('empresa.email:invalido', 'empresa', 'empresa.email', 'O email não parece estar certo (ex.: ola@franjakids.com).');
    if (!vazio(em.telefone) && !numeroPortugues(em.telefone)) avisa('empresa.telefone', 'empresa', 'empresa.telefone', 'O telefone tem de ser um número português de 9 algarismos.');
  }
  for (const k of Object.keys(d)) if (!CAMPOS_LOJA.includes(k)) avisa(`chave:${k.slice(0, 40)}`, 'marca', undefined, `Os dados da loja têm um campo que o site não conhece («${k.slice(0, 40)}»). Só o Renato o pode tirar.`);
  return out;
}

/* ------------------------------------------------------------------ */
/* content/catalogo.json                                               */
/* ------------------------------------------------------------------ */

export const SECCOES_CATALOGO = Object.freeze({ linhas: 'Linhas', categorias: 'Categorias', ocasioes: 'Ocasiões', tamanhos: 'Tamanhos', cores: 'Cores' });
/* As linhas da loja são três, fixas (cada uma é uma página: /personalizados/, /bebe/,
   /presentes/), e as categorias de cada linha também (os filtros têm endereço: ?categoria=). Os
   nomes, as frases e as fotografias mudam-se; as ocasiões, os conjuntos de tamanhos e as cores
   da paleta são da dona (entram e saem). */
export const LINHAS = Object.freeze(['personalizados', 'bebe', 'presentes']);

export function problemasDoCatalogo(c, { fotos = null } = {}) {
  const ficheiro = FICHEIROS.catalogo;
  const out = [];
  const ecraDe = (s) => `Categorias › ${SECCOES_CATALOGO[s] || s}`;
  const bloqueia = (chave, s, campo, mensagem) => out.push({ classe: 'bloqueia', chave: `catalogo:${chave}`, ficheiro, ecra: ecraDe(s), campo, mensagem });
  const avisa = (chave, s, campo, mensagem, extra = {}) => out.push({ classe: 'avisa', chave: `catalogo:${chave}`, ficheiro, ecra: ecraDe(s), campo, mensagem, ...extra });
  const fotoBoa = (f) => nomeDeFotoValido(f) && (!(fotos instanceof Set) || fotos.has(f));
  const textoNumaLinha = (x, max) => typeof x === 'string' && x.trim() !== '' && x.length <= max && !RE_CONTROLO_LINHA.test(x);
  if (!eObjecto(c)) { bloqueia('forma', 'linhas', undefined, 'O catálogo não tem a forma certa. Só o Renato o pode corrigir.'); return out; }

  // --- linhas e categorias: a estrutura das páginas -----------------------------------
  const cats = eObjecto(c.categorias) ? c.categorias : null;
  if (!cats) bloqueia('categorias:forma', 'categorias', 'categorias', 'As categorias não estão gravadas como o site precisa. Só o Renato as pode repor.');
  const linhas = c.linhas;
  if (!Array.isArray(linhas) || linhas.length !== LINHAS.length || linhas.some((l, i) => !eObjecto(l) || l.id !== LINHAS[i] || !Array.isArray(l.categorias))) {
    bloqueia('linhas:forma', 'linhas', 'linhas', 'As linhas da loja não estão como o site precisa. Só o Renato as pode repor.');
  } else {
    const vistas = new Set();
    linhas.forEach((l, i) => {
      if (!textoNumaLinha(l.nome, TAMANHOS.linhaNome)) avisa(`linhas.${i}.nome`, 'linhas', `linhas.${i}.nome`, `O nome da linha ${i + 1} tem de ser um texto numa linha, até ${TAMANHOS.linhaNome} caracteres.`);
      if (!textoNumaLinha(l.frase, TAMANHOS.frase)) avisa(`linhas.${i}.frase`, 'linhas', `linhas.${i}.frase`, `A frase da linha «${temTexto(l.nome) ? l.nome.trim() : l.id}» tem de ser um texto numa linha, até ${TAMANHOS.frase} caracteres.`);
      if (!fotoBoa(l.foto)) avisa(`linhas.${i}.foto`, 'linhas', `linhas.${i}.foto`, `A fotografia da linha «${temTexto(l.nome) ? l.nome.trim() : l.id}» não está na biblioteca: escolha outra.`);
      if (!l.categorias.length) bloqueia(`linhas.${i}:vazia`, 'linhas', `linhas.${i}.categorias`, `A linha «${l.id}» não tem categorias. Só o Renato a pode corrigir.`);
      for (const id of l.categorias) {
        if (vistas.has(id)) bloqueia(`categoria:${String(id).slice(0, 40)}:repetida`, 'categorias', 'categorias', `A categoria «${String(id).slice(0, 40)}» está em duas linhas. Só o Renato a pode corrigir.`);
        vistas.add(id);
        if (cats && !textoNumaLinha(cats[id], TAMANHOS.catNome)) {
          if (typeof id === 'string' && tem(cats, id)) avisa(`categorias.${id}`, 'categorias', `categorias.${id}`, `O nome da categoria «${id}» tem de ser um texto numa linha, até ${TAMANHOS.catNome} caracteres.`);
          else bloqueia(`categoria:${String(id).slice(0, 40)}:sem-nome`, 'categorias', 'categorias', `A categoria «${String(id).slice(0, 40)}» não está na lista dos nomes. Só o Renato a pode corrigir.`);
        }
      }
    });
    if (cats) for (const id of Object.keys(cats)) if (!vistas.has(id)) avisa(`categoria:${id.slice(0, 40)}:sem-linha`, 'categorias', 'categorias', `A categoria «${id.slice(0, 40)}» não está em nenhuma linha: não aparece no site.`, { lembrete: true });
  }

  // --- ocasiões ---------------------------------------------------------------------
  const ocs = c.ocasioes;
  if (!Array.isArray(ocs)) bloqueia('ocasioes:forma', 'ocasioes', 'ocasioes', 'As ocasiões não estão gravadas como uma lista. Só o Renato as pode repor.');
  else {
    const ids = new Set();
    ocs.forEach((o, i) => {
      if (!eObjecto(o) || !slugValido(o.id)) { bloqueia(`ocasioes.${i}:id`, 'ocasioes', `ocasioes.${i}`, `A ocasião ${i + 1} não tem um endereço válido. Só o Renato a pode corrigir.`); return; }
      if (ids.has(o.id)) bloqueia(`ocasioes.${o.id}:repetida`, 'ocasioes', `ocasioes.${i}`, `Há duas ocasiões com o endereço «${o.id}». Só o Renato a pode corrigir.`);
      ids.add(o.id);
      if (!textoNumaLinha(o.nome, TAMANHOS.ocasiaoNome)) avisa(`ocasioes.${i}.nome`, 'ocasioes', `ocasioes.${i}.nome`, `O nome da ocasião ${i + 1} tem de ser um texto numa linha, até ${TAMANHOS.ocasiaoNome} caracteres.`);
      /* Sem fotografia, a ocasião não aparece na página inicial (só no filtro dos Personalizados). */
      if (!ausente(o.foto) && o.foto !== '' && !fotoBoa(o.foto)) avisa(`ocasioes.${i}.foto`, 'ocasioes', `ocasioes.${i}.foto`, `A fotografia da ocasião «${temTexto(o.nome) ? o.nome.trim() : o.id}» não está na biblioteca: escolha outra, ou nenhuma.`);
    });
  }

  // --- tamanhos ---------------------------------------------------------------------
  const ts = c.tamanhos;
  if (!eObjecto(ts)) bloqueia('tamanhos:forma', 'tamanhos', 'tamanhos', 'Os tamanhos não estão gravados como o site precisa. Só o Renato os pode repor.');
  else {
    const entradas = Object.entries(ts);
    if (entradas.length > TAMANHOS.conjuntos) avisa('tamanhos:quantos', 'tamanhos', 'tamanhos', `Há ${entradas.length} conjuntos de tamanhos; o máximo é ${TAMANHOS.conjuntos}.`);
    for (const [id, t] of entradas) {
      const onde = `tamanhos.${id}`;
      if (!slugValido(id) || !eObjecto(t) || !Array.isArray(t.valores)) { bloqueia(`${onde}:forma`, 'tamanhos', onde, `O conjunto de tamanhos «${id.slice(0, 40)}» não tem a forma certa. Só o Renato o pode corrigir.`); continue; }
      if (!textoNumaLinha(t.nome, TAMANHOS.conjuntoNome)) avisa(`${onde}.nome`, 'tamanhos', `${onde}.nome`, `O nome do conjunto «${id}» tem de ser um texto numa linha, até ${TAMANHOS.conjuntoNome} caracteres.`);
      if (!t.valores.length) avisa(`${onde}:vazio`, 'tamanhos', `${onde}.valores`, `O conjunto «${temTexto(t.nome) ? t.nome.trim() : id}» não tem tamanhos.`);
      if (t.valores.length > TAMANHOS.tamanhoValores) avisa(`${onde}:muitos`, 'tamanhos', `${onde}.valores`, `O conjunto «${temTexto(t.nome) ? t.nome.trim() : id}» tem ${t.valores.length} tamanhos; o máximo é ${TAMANHOS.tamanhoValores}.`);
      const vistos = new Set();
      t.valores.forEach((v, j) => {
        if (!textoNumaLinha(v, TAMANHOS.tamanhoValor)) { avisa(`${onde}.valores.${j}`, 'tamanhos', `${onde}.valores.${j}`, `O tamanho ${j + 1} de «${temTexto(t.nome) ? t.nome.trim() : id}» tem de ser um texto curto (até ${TAMANHOS.tamanhoValor} caracteres).`); return; }
        const k = v.trim().toLowerCase();
        if (vistos.has(k)) avisa(`${onde}.valores.${j}:repetido`, 'tamanhos', `${onde}.valores.${j}`, `O tamanho «${v.trim()}» está repetido em «${temTexto(t.nome) ? t.nome.trim() : id}».`);
        vistos.add(k);
      });
    }
  }

  // --- a paleta das cores (as amostras da ficha) ------------------------------------------
  const cores = c.cores;
  if (!ausente(cores)) {
    if (!eObjecto(cores)) avisa('cores:forma', 'cores', 'cores', 'As cores não estão gravadas como deve ser.');
    else {
      const entradas = Object.entries(cores);
      if (entradas.length > TAMANHOS.paleta) avisa('cores:quantas', 'cores', 'cores', `Há ${entradas.length} cores; o máximo é ${TAMANHOS.paleta}.`);
      for (const [nome, hex] of entradas) {
        if (!textoNumaLinha(nome, TAMANHOS.corNome)) avisa(`cores.${nome.slice(0, 30)}:nome`, 'cores', 'cores', `O nome da cor «${nome.slice(0, 30)}» tem de ser um texto curto (até ${TAMANHOS.corNome} caracteres).`);
        if (!RE_HEX.test(String(hex))) avisa(`cores.${nome.slice(0, 30)}:hex`, 'cores', 'cores', `A amostra da cor «${nome.slice(0, 30)}» não é uma cor (ex.: #F2B8C6).`);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* content/fotos.json                                                  */
/* ------------------------------------------------------------------ */

/* { <nome>: { alt, foco } }: a descrição (o texto alternativo, que o leitor de ecrã lê e o Google
   indexa) e o ponto de foco («50% 45%», o que fica à vista quando a fotografia é cortada). */
export function problemasDasFotos(valor, ficheirosFotos = null) {
  const ficheiro = FICHEIROS.fotos;
  const out = [];
  const bloqueia = (chave, foto, mensagem, extra = {}) => out.push({ classe: 'bloqueia', chave: `fotos:${chave}`, ficheiro, ecra: foto ? `Fotografias › ${foto}` : 'Fotografias', campo: foto ? 'alt' : undefined, mensagem, ...extra });
  const avisa = (chave, foto, campo, mensagem, extra = {}) => out.push({ classe: 'avisa', chave: `fotos:${chave}`, ficheiro, ecra: `Fotografias › ${foto}`, campo, mensagem, foto, ...extra });
  const l = lerJson(valor);
  if (!eObjecto(l.obj)) { bloqueia('forma', null, 'As descrições das fotografias não têm a forma certa. Só o Renato as pode corrigir.'); return out; }
  for (const [n, d] of Object.entries(l.obj)) {
    if (!eObjecto(d)) { avisa(`${n.slice(0, 60)}:forma`, n, 'alt', `A descrição da fotografia «${n.slice(0, 60)}» não está gravada como deve ser: escreva-a outra vez.`); continue; }
    if (!temTexto(d.alt)) avisa(`${n.slice(0, 60)}:sem-alt`, n, 'alt', 'Falta a descrição desta fotografia (o que se vê nela, para quem não a vê).');
    else if (d.alt.length > TAMANHOS.alt || RE_CONTROLO_LINHA.test(d.alt)) avisa(`${n.slice(0, 60)}:alt`, n, 'alt', `A descrição tem de ser um texto numa linha, até ${TAMANHOS.alt} caracteres.`);
    if (!ausente(d.foco) && d.foco !== '' && !focoValido(d.foco)) avisa(`${n.slice(0, 60)}:foco`, n, 'foco', 'O ponto de foco não está certo: escolha-o outra vez na fotografia.');
  }
  if (Array.isArray(ficheirosFotos)) {
    for (const n of ficheirosFotos) {
      /* Um ficheiro com um nome que o site não aceita (posto à mão: «Foto 1.jpg»): o painel não lhe
         consegue dar descrição — é do Renato. */
      if (!nomeDeFotoValido(n)) { bloqueia(`${String(n).slice(0, 60)}:nome-do-ficheiro`, undefined, `Há uma fotografia na biblioteca com um nome que o site não aceita («${String(n).slice(0, 60)}»: só minúsculas, algarismos e hífens). Só o Renato a pode corrigir.`, { foto: n }); continue; }
      if (!tem(l.obj, n)) bloqueia(`${n}:sem-entrada`, n, `A fotografia «${n}» não tem descrição: escreva-a.`, { foto: n });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Todos                                                               */
/* ------------------------------------------------------------------ */

/* problemas(dados, opcoes) → [problema]
 *   opcoes: { producao?: boolean } */
export function problemas(dados = {}, opcoes = {}) {
  const lista = [];
  const d = eObjecto(dados) ? dados : {};
  const fotos = fotosQueExistem(d);
  const catalogo = tem(d, 'catalogo') ? catalogoDe(d.catalogo) : null;

  const umFicheiro = (k, rotulo, fn) => {
    if (!tem(d, k)) return;
    const l = lerJson(d[k]);
    const ficheiro = FICHEIROS[k];
    if (l.ausente) lista.push({ classe: 'bloqueia', chave: `${k}:ausente`, ficheiro, ecra: rotulo, mensagem: `Falta o ficheiro ${ficheiro}: sem ele o site não se consegue gerar. Só o Renato o pode repor.` });
    else if (l.ilegivel) lista.push({ classe: 'bloqueia', chave: `${k}:ilegivel`, ficheiro, ecra: rotulo, mensagem: `${rotulo}: o ficheiro não se consegue ler (JSON inválido: ${l.ilegivel}). Só o Renato o pode corrigir.` });
    else lista.push(...fn(l.obj));
  };
  umFicheiro('loja', 'Dados da loja', (o) => problemasDaLoja(o, { producao: Boolean(opcoes.producao) }));
  umFicheiro('fotos', 'Fotografias', (o) => problemasDasFotos(o, Array.isArray(d.ficheirosFotos) ? d.ficheirosFotos : null));
  umFicheiro('catalogo', 'Categorias', (o) => problemasDoCatalogo(o, { fotos }));

  const mapa = d.artigos;
  if (eObjecto(mapa)) {
    for (const nome of Object.keys(mapa).sort()) {
      const valor = mapa[nome];
      if (ausente(valor)) continue;
      const slug = slugDoFicheiro(nome);
      const ficheiro = ficheiroDoArtigo(nome);
      const ecra = `Produtos › ${slug}`;
      const base = { ficheiro, slug };
      const l = lerJson(valor);
      if (l.ilegivel) { lista.push({ classe: 'bloqueia', chave: `artigo:${slug}:ilegivel`, ecra, ...base, mensagem: `O ficheiro deste produto não se consegue ler (JSON inválido: ${l.ilegivel}). Só o Renato o pode corrigir.` }); continue; }
      if (!eObjecto(l.obj)) { lista.push({ classe: 'bloqueia', chave: `artigo:${slug}:forma`, ecra, ...base, mensagem: 'O ficheiro deste produto não tem a forma de um produto. Só o Renato o pode corrigir.' }); continue; }
      if (!slugValido(slug)) { lista.push({ classe: 'bloqueia', chave: `artigo:${slug}:endereco`, ecra, ...base, mensagem: `O nome do ficheiro («${nome}») não é um endereço válido (só minúsculas, algarismos e hífenes). Só o Renato o pode corrigir.` }); continue; }
      lista.push(...problemasDoArtigo(l.obj, { nome, catalogo, fotos, producao: Boolean(opcoes.producao) }));
      const bytes = l.texto !== null ? bytesDe(l.texto) : bytesDe(serializar(l.obj));
      if (bytes > TECTOS.artigoBytes * TECTOS.aviso) lista.push({ classe: 'avisa', lembrete: true, chave: `artigo:${slug}:tecto`, ecra: ecraDoArtigo(l.obj, slug), ...base, mensagem: `Este produto está a chegar ao limite do painel (${Math.round(bytes / 1024)} de ${TECTOS.artigoBytes / 1024} KB): encurte os textos.` });
    }
  }
  return lista;
}

/* ------------------------------------------------------------------ */
/* A cópia que o gerador lê                                            */
/* ------------------------------------------------------------------ */

/* neutralizar(dados, lista) → { artigos: { <nome>: objecto }, efeitos, mudou }
 *   Os problemas «neutraliza» aplicados a uma CÓPIA dos produtos (o repositório não muda):
 *     · esconder       — publicado: false (sai do site, como um rascunho);
 *     · sem_fotografia — a fotografia sai da lista.
 *   efeitos: o que muda NO SITE, por produto: [{ ficheiro, slug, nome, efeitos, motivos }] */
export function neutralizar(dados = {}, lista = []) {
  const d = eObjecto(dados) ? dados : {};
  const porFicheiro = new Map();
  for (const p of Array.isArray(lista) ? lista : []) {
    if (p && p.classe === 'neutraliza' && typeof p.ficheiro === 'string') porFicheiro.set(p.ficheiro, [...(porFicheiro.get(p.ficheiro) || []), p]);
  }
  const artigos = {};
  const efeitos = [];
  let mudou = false;
  const mapa = eObjecto(d.artigos) ? d.artigos : {};
  for (const nome of Object.keys(mapa).sort()) {
    const l = lerJson(mapa[nome]);
    if (!eObjecto(l.obj)) continue;
    const a = JSON.parse(JSON.stringify(l.obj));
    const prs = porFicheiro.get(ficheiroDoArtigo(nome)) || [];
    const feitos = []; const motivos = [];
    if (prs.some((p) => p.efeito === 'esconder')) {
      if (a.publicado !== false) { a.publicado = false; feitos.push('esconder'); mudou = true; }
      motivos.push(...prs.filter((p) => p.efeito === 'esconder').map((p) => p.mensagem));
    }
    const tirar = new Set(prs.filter((p) => p.efeito === 'sem_fotografia').map((p) => String(p.foto)));
    if (tirar.size && Array.isArray(a.fotos)) {
      a.fotos = a.fotos.filter((f) => !tirar.has(String(f)));
      mudou = true;
      if (!feitos.includes('esconder')) { feitos.push('sem_fotografia'); motivos.push(...prs.filter((p) => p.efeito === 'sem_fotografia').map((p) => p.mensagem)); }
    }
    artigos[nome] = a;
    if (feitos.length) efeitos.push({ ficheiro: ficheiroDoArtigo(nome), slug: slugDoFicheiro(nome), nome: nomeDoArtigo(l.obj, slugDoFicheiro(nome)), efeitos: feitos, motivos });
  }
  return { artigos, efeitos, mudou };
}

const DESCRICAO_EFEITOS = { esconder: 'escondido do site', sem_fotografia: 'com fotografias que não aparecem' };
export const descreverEfeitos = (e) => e.efeitos.map((x) => DESCRICAO_EFEITOS[x] || x).join(' e ');

/* ------------------------------------------------------------------ */
/* O que o painel não pode mudar ao gravar                             */
/* ------------------------------------------------------------------ */

const valorEmCaminho = (o, caminho) => caminho.split('.').reduce((x, k) => (eObjecto(x) ? x[k] : undefined), o);

/* mudancasBloqueadas(antes, depois, qual) → [{ caminho, motivo }] ([] = pode gravar)
 *   'artigo':   as chaves que não são CAMPOS_ARTIGO não mudam;
 *   'loja':     BLOQUEADOS_LOJA não mudam, as zonas são as mesmas pela mesma ordem (o id), e não
 *               aparecem campos novos;
 *   'catalogo': as linhas são as mesmas, pela mesma ordem, com as mesmas categorias; as
 *               categorias são as mesmas (o id). As ocasiões, os tamanhos e as cores são livres. */
export function mudancasBloqueadas(antes, depois, qual = 'loja') {
  const out = [];
  const a = eObjecto(antes) ? antes : {}; const d = eObjecto(depois) ? depois : {};
  if (qual === 'artigo') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(d)])) {
      if (CAMPOS_ARTIGO.includes(k) || mesmoValor(a[k], d[k])) continue;
      out.push({ caminho: k, motivo: tem(a, k) ? 'mudou' : 'chave_nova' });
    }
    return out;
  }
  if (qual === 'catalogo') {
    const la = Array.isArray(a.linhas) ? a.linhas : []; const ld = Array.isArray(d.linhas) ? d.linhas : [];
    if (la.length !== ld.length) out.push({ caminho: 'linhas', motivo: 'quantas' });
    else la.forEach((l, i) => {
      if (!mesmoValor(eObjecto(l) ? l.id : null, eObjecto(ld[i]) ? ld[i].id : null)) out.push({ caminho: `linhas.${i}.id`, motivo: 'mudou' });
      if (!mesmoValor(eObjecto(l) ? l.categorias : null, eObjecto(ld[i]) ? ld[i].categorias : null)) out.push({ caminho: `linhas.${i}.categorias`, motivo: 'mudou' });
    });
    const ka = Object.keys(eObjecto(a.categorias) ? a.categorias : {}).sort(); const kd = Object.keys(eObjecto(d.categorias) ? d.categorias : {}).sort();
    if (!mesmoValor(ka, kd)) out.push({ caminho: 'categorias', motivo: 'mudou' });
    for (const k of Object.keys(d)) if (!tem(a, k) && !Object.keys(SECCOES_CATALOGO).includes(k)) out.push({ caminho: k, motivo: 'chave_nova' });
    return out;
  }
  for (const caminho of BLOQUEADOS_LOJA) if (!mesmoValor(valorEmCaminho(a, caminho), valorEmCaminho(d, caminho))) out.push({ caminho, motivo: 'mudou' });
  const za = Array.isArray(a.entrega?.zonas) ? a.entrega.zonas.map((z) => (eObjecto(z) ? z.id : null)) : null;
  const zd = Array.isArray(d.entrega?.zonas) ? d.entrega.zonas.map((z) => (eObjecto(z) ? z.id : null)) : null;
  if (!mesmoValor(za, zd)) out.push({ caminho: 'entrega.zonas', motivo: 'mudou' });
  for (const k of Object.keys(d)) if (!tem(a, k) && !CAMPOS_LOJA.includes(k)) out.push({ caminho: k, motivo: 'chave_nova' });
  return out;
}

/* A ORDEM DAS CHAVES AO GRAVAR: as que já estavam no ficheiro ficam onde estavam; uma nova entra
   antes da primeira que, na ordem do formulário, vem depois dela (e no fim, se nenhuma vier); as
   que o formulário não conhece vão para o fim. As que saíram, saem. */
export function ordenarComo(antes, depois, ordem = CAMPOS_ARTIGO) {
  if (!eObjecto(depois)) return depois;
  const a = eObjecto(antes) ? antes : {};
  const chaves = Object.keys(a).filter((k) => tem(depois, k));
  const novas = Object.keys(depois).filter((k) => !chaves.includes(k));
  for (const k of novas.filter((x) => ordem.includes(x))) {
    const i = ordem.indexOf(k);
    const j = chaves.findIndex((x) => ordem.includes(x) && ordem.indexOf(x) > i);
    if (j < 0) chaves.push(k); else chaves.splice(j, 0, k);
  }
  chaves.push(...novas.filter((x) => !ordem.includes(x)));
  const out = {};
  for (const k of chaves) out[k] = depois[k];
  return out;
}

/* AS FOTOGRAFIAS EM USO, em todo o conteúdo: as dos produtos, das linhas e das ocasiões do
   catálogo, e as das páginas (FOTOS_FIXAS). Uma fotografia só sai da biblioteca se não estiver
   aqui. → Set */
export function fotosEmUso(dados = {}, extra = []) {
  const d = eObjecto(dados) ? dados : {};
  const usadas = new Set();
  /* Um nome com espaços à volta (escrito à mão) não aparece no site, mas conta como usado: na
     dúvida, uma fotografia nunca sai da biblioteca. */
  const juntar = (f) => { if (typeof f === 'string') { usadas.add(f); usadas.add(f.trim()); } };
  [...extra, ...FOTOS_FIXAS].forEach(juntar);
  if (eObjecto(d.artigos)) {
    for (const v of Object.values(d.artigos)) {
      const a = lerJson(v).obj;
      if (!eObjecto(a)) continue;
      if (Array.isArray(a.fotos)) a.fotos.forEach(juntar);
      if (Array.isArray(a.cores)) a.cores.forEach((c) => eObjecto(c) && juntar(c.foto));
    }
  }
  const c = lerJson(d.catalogo).obj;
  if (eObjecto(c)) {
    if (Array.isArray(c.linhas)) c.linhas.forEach((l) => eObjecto(l) && juntar(l.foto));
    if (Array.isArray(c.ocasioes)) c.ocasioes.forEach((o) => eObjecto(o) && juntar(o.foto));
  }
  return usadas;
}
