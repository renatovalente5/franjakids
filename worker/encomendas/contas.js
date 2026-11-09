/* AS CONTAS E AS VALIDAÇÕES DO /checkout.
 *
 * O site manda só o que se escolheu (o produto, o tamanho, a cor, as opções, a personalização e a
 * quantidade de cada linha), a entrega, os dados do cliente e o total que mostrou. O Worker refaz
 * TUDO do seu lado com o catálogo publicado — nunca se cobra o que o browser diz — e com as MESMAS
 * regras do site: src/lib/regras.mjs, o ficheiro que o carrinho (assets/js/site.js), o gerador e o
 * painel também usam. A conta de cada linha é R.conferirEscolha() e a dos portes R.portesDe(); aqui
 * não se repete nenhuma das duas, para o site e o Worker nunca discordarem por terem regras
 * diferentes. Quando discordam (um preço mudou entretanto), o Worker responde 409 e o site
 * redesenha.
 *
 * Tudo em CÊNTIMOS INTEIROS: 0.1 + 0.2 !== 0.3 em vírgula flutuante, e um cêntimo a mais num total
 * é uma diferença contabilística.
 *
 * As frases das recusas vão tal e qual para o site, no tratamento do site (tu), com o `campo` do
 * formulário a marcar. Onde o finalizar já tem uma frase para o mesmo erro, é essa: a pessoa lê o
 * mesmo quer recuse o browser quer o Worker.
 */

import { conferirEscolha, portesDe, nifValido, emailValido, zonaComMorada } from '../../src/lib/regras.mjs';

export const MAX_QTD = 20;          // a mesma do carrinho (site.js, MAX_QTD)
export const MAX_LINHAS = 50;       // mais do que isto não é um carrinho, é um script
export const MAX_MENSAGEM = 240;    // a mensagem do cartão de oferta (o maxlength do finalizar)
export const MAX_NOTAS = 600;       // as notas para a loja (idem)
export const MAX_CP_ESTRANGEIRO = 20;

const eObjecto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
/* Só as chaves do próprio objecto: `cat.produtos['constructor']` não é um produto (memória
   in-aceita-o-prototipo). */
const temProprio = (o, k) => eObjecto(o) && Object.prototype.hasOwnProperty.call(o, k);

/* ---------------------------------------------------------------- a data de Lisboa
   O dia de hoje em Lisboa («AAAA-MM-DD»), para o id da encomenda, e a hora de Lisboa, para a data
   dos emails: o Worker corre em UTC, e uma encomenda feita à meia-noite e meia de Lisboa, no verão,
   já é do dia seguinte. Faz-se à mão, sem o Intl: o Intl.DateTimeFormat com timeZone custa ~10 ms
   de CPU a frio num Worker (o ICU a arrancar — memória cpu-a-frio-no-worker), mais do que o pedido
   inteiro. A regra é a da UE: hora de verão (UTC+1) da 01:00 UTC do último domingo de março à
   01:00 UTC do último domingo de outubro; no resto do ano, UTC. Os testes comparam-na com o Intl
   hora a hora (o início e o fim de cada hora), de 2025 a 2032. */
const HORA = 3600 * 1000;
const DIA = 24 * HORA;
function ultimoDomingo(ano, mes) {   // mes de 0 a 11 → a meia-noite UTC do último domingo
  const ultimoDia = Date.UTC(ano, mes + 1, 0);
  return ultimoDia - new Date(ultimoDia).getUTCDay() * DIA;
}
/* O instante na hora de Lisboa, como um Date «em UTC» (ler com getUTC…). */
export function horaDeLisboa(d = new Date()) {
  const ms = d instanceof Date ? d.getTime() : new Date(d).getTime();
  const ano = new Date(ms).getUTCFullYear();
  const verao = ms >= ultimoDomingo(ano, 2) + HORA && ms < ultimoDomingo(ano, 9) + HORA;
  return new Date(ms + (verao ? HORA : 0));
}
export const hojeLisboa = (d = new Date()) => horaDeLisboa(d).toISOString().slice(0, 10);

/* ---------------------------------------------------------------- os textos do cliente */

const ZWNJ = String.fromCodePoint(0x200c);
const ZWJ = String.fromCodePoint(0x200d);
const soJuntores = (s) => [...s].every((c) => c === ZWNJ || c === ZWJ || /\s/.test(c));

/* Corta ao tamanho (em unidades de UTF-16, as do .length e do maxlength do browser) sem partir um
   emoji ao meio: meio par de substitutos ficava um carácter inválido no email e no KV. */
export function cortar(v, max) {
  const s = String(v == null ? '' : v);
  if (s.length <= max) return s;
  const c = s.charCodeAt(max - 1);
  return s.slice(0, c >= 0xd800 && c <= 0xdbff ? max - 1 : max);
}

/* Limpa um texto do cliente. Os caracteres de controlo (Cc) passam a espaço e os de formatação (Cf:
   os espaços de largura zero, as marcas de direcção, o BOM, o hífen suave) saem: um nome só de
   invisíveis passava num trim(), e uma marca de direcção vira o texto ao contrário no ecrã do
   painel (memória trim-nao-tira-invisiveis). Ficam os juntores U+200C e U+200D, que compõem
   emojis, mas um texto SÓ de juntores fica vazio. Junta os espaços (com `linhas`, guarda as
   mudanças de linha, com uma linha em branco seguida no máximo) e corta ao tamanho.
   Escrito com as classes do Unicode (\p{Cc}, \p{Cf}) e não com escapes de um carácter: as
   ferramentas de escrita trocam esses escapes pelos caracteres verdadeiros (memória
   bytes-de-controlo-no-codigo). */
export function limpar(v, max = Infinity, { linhas = false } = {}) {
  let s = String(v == null ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Cc}/gu, (c) => (linhas && c === '\n' ? c : ' '))
    .replace(/\p{Cf}/gu, (c) => (c === ZWNJ || c === ZWJ ? c : ''));
  s = linhas ? s.replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  s = s.trim();
  if (soJuntores(s)) return '';
  return cortar(s, max).trim();
}

export const telefoneValido = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 && d.length <= 15; };

/* ---------------------------------------------------------------- as recusas */

/* Um pedido recusado: a frase vai tal e qual para o site, e `campo` diz que campo do formulário
   marcar (o site traduz codigoPostal e telefone para os ids dele). */
export class ErroDoPedido extends Error {
  constructor(mensagem, { campo = null, status = 400 } = {}) {
    super(mensagem);
    this.name = 'ErroDoPedido';
    this.campo = campo;
    this.status = status;
  }
}

/* ---------------------------------------------------------------- as linhas e os portes */

/* As opções que vieram do site, só as dos grupos que o produto tem (as outras são lixo de um
   pedido feito à mão: R.conferirEscolha ignora-as, e a encomenda também). Um grupo que falta vale
   a primeira escolha sem acréscimo e aparece só em `escolhas` — a lista em texto, que é a que se
   mostra e a que foi paga. */
function opcoesPedidas(p, l) {
  const pedidas = eObjecto(l.opcoes) ? l.opcoes : {};
  const out = {};
  for (const g of Array.isArray(p.opcoes) ? p.opcoes : []) {
    if (g && typeof g.nome === 'string' && temProprio(pedidas, g.nome) && typeof pedidas[g.nome] === 'string') out[g.nome] = pedidas[g.nome];
  }
  return out;
}

/* As linhas da encomenda com os preços do catálogo, e os totais. Lança ErroDoPedido quando um
   produto não existe, não se compra, uma escolha já não existe ou falta, ou a quantidade não
   presta. `zona` é a zona de entrega escolhida (uma de cat.zonas: { id, nome, portes, morada }). */
export function contas(cat, linhas, zona) {
  if (!Array.isArray(linhas) || !linhas.length) throw new ErroDoPedido('O carrinho está vazio.');
  if (linhas.length > MAX_LINHAS) throw new ErroDoPedido('O carrinho tem produtos a mais: divide a encomenda em duas.');
  const saida = [];
  let artigos_cents = 0;
  for (const l of linhas) {
    if (!eObjecto(l) || typeof l.produto !== 'string') throw new ErroDoPedido('Um produto do carrinho não se reconhece. Vê o carrinho outra vez.');
    const p = temProprio(cat.produtos, l.produto) && eObjecto(cat.produtos[l.produto]) ? cat.produtos[l.produto] : null;
    if (!p) throw new ErroDoPedido('Um produto do carrinho já não se vende no site. Tira-o do carrinho para continuar.', { campo: 'produto' });
    // A escolha (e o preço de uma unidade) é a do site: as frases de R.conferirEscolha vão tal e qual.
    const r = conferirEscolha(p, l);
    if (!r.ok) throw new ErroDoPedido(r.mensagem, { campo: r.campo || null });
    if (!Number.isInteger(l.qtd) || l.qtd < 1 || l.qtd > MAX_QTD) throw new ErroDoPedido(`A quantidade de cada produto vai de 1 a ${MAX_QTD}.`);
    const tamanhos = Array.isArray(p.tamanhos) ? p.tamanhos : [];
    const cores = (Array.isArray(p.cores) ? p.cores : []).map((c) => c && c.nome).filter((n) => typeof n === 'string');
    const total_cents = r.unidade_cents * l.qtd;
    artigos_cents += total_cents;
    saida.push({
      produto: l.produto,
      nome: typeof p.nome === 'string' ? p.nome : l.produto,
      qtd: l.qtd,
      ...(tamanhos.length ? { tamanho: l.tamanho } : {}),
      // Com uma cor só, o site pode não a mandar: é essa (a regra de R.conferirEscolha).
      ...(cores.length ? { cor: cores.includes(l.cor) ? l.cor : cores[0] } : {}),
      opcoes: opcoesPedidas(p, l),
      personalizar: l.personalizar === true,
      texto: r.texto,
      escolhas: r.escolhas,
      personalizada: r.personalizada,
      unidade_cents: r.unidade_cents,
      total_cents,
    });
  }
  // Os portes da zona; grátis no continente a partir de gratisAPartirDe em artigos; null quando a
  // zona os tem por escrever (por confirmar). Sem portes conhecidos o total é só os artigos, como
  // no site.
  const portes = portesDe(zona, artigos_cents, cat.gratisAPartirDe);
  const portes_por_confirmar = portes === null;
  const portes_cents = portes_por_confirmar ? 0 : portes;
  return { linhas: saida, artigos_cents, portes_cents, portes_por_confirmar, total_cents: artigos_cents + portes_cents };
}

/* ---------------------------------------------------------------- o cliente */

const RE_CP = /^(\d{4})\s*-?\s*(\d{3})$/;          // 4440-000, 4440 000 ou 4440000 → 4440-000
const RE_CP_CONTINENTE = /^[1-8]\d{3}-\d{3}$/;
const RE_CP_ILHAS = /^9\d{3}-\d{3}$/;                // Madeira 9000–9399, Açores 9500–9980

const CP_E_DAS_ILHAS = 'Em Portugal continental o código postal começa por 1 a 8. Para os Açores e a Madeira, escolhe essa entrega.';
const CP_E_DO_CONTINENTE = 'Nos Açores e na Madeira o código postal começa por 9. Para Portugal continental, escolhe essa entrega.';

/* Os dados do cliente, limpos e conferidos. Os opcionais ficam AUSENTES quando vêm vazios. A morada
   só com entrega que a leve (R.zonaComMorada: todas menos a entrega em mão, onde se ignora); o país
   só para fora de Portugal (no continente e nas ilhas é Portugal). */
export function validarCliente(bruto, zona) {
  const b = eObjecto(bruto) ? bruto : {};
  const c = {
    nome: limpar(b.nome, 120),
    // Sem cortar antes de conferir: um email comprido de mais, cortado, podia passar a ser outro.
    email: limpar(b.email).toLowerCase(),
    telefone: limpar(b.telefone, 60),
  };
  if (!c.nome) throw new ErroDoPedido('Escreve o teu nome.', { campo: 'nome' });
  if (!emailValido(c.email)) throw new ErroDoPedido('Escreve um email como nome@exemplo.pt.', { campo: 'email' });
  if (!telefoneValido(c.telefone)) throw new ErroDoPedido('Escreve o telemóvel com 9 algarismos.', { campo: 'telefone' });
  const nif = limpar(b.nif, 40).replace(/\s/g, '');
  if (nif) {
    if (!nifValido(nif)) throw new ErroDoPedido('O NIF não está certo. Confirma-o ou deixa-o em branco.', { campo: 'nif' });
    c.nif = nif;
  }
  if (!zonaComMorada(zona.id)) return c;

  const morada = limpar(b.morada, 200);
  let cp = limpar(b.codigoPostal, 40);
  const localidade = limpar(b.localidade, 100);
  if (!morada) throw new ErroDoPedido('Escreve a morada.', { campo: 'morada' });
  if (zona.id === 'estrangeiro') {
    if (!cp) throw new ErroDoPedido('Escreve o código postal.', { campo: 'codigoPostal' });
    if (cp.length > MAX_CP_ESTRANGEIRO) throw new ErroDoPedido(`O código postal tem no máximo ${MAX_CP_ESTRANGEIRO} caracteres.`, { campo: 'codigoPostal' });
  } else {
    const m = RE_CP.exec(cp);
    if (m) cp = `${m[1]}-${m[2]}`;
    if (zona.id === 'ilhas') {
      if (!RE_CP_ILHAS.test(cp)) throw new ErroDoPedido(RE_CP_CONTINENTE.test(cp) ? CP_E_DO_CONTINENTE : 'Escreve o código postal como 9500-000.', { campo: 'codigoPostal' });
    } else if (!RE_CP_CONTINENTE.test(cp)) {
      throw new ErroDoPedido(RE_CP_ILHAS.test(cp) ? CP_E_DAS_ILHAS : 'Escreve o código postal como 4440-000.', { campo: 'codigoPostal' });
    }
  }
  if (!localidade) throw new ErroDoPedido('Escreve a localidade.', { campo: 'localidade' });
  c.morada = morada;
  c.codigoPostal = cp;
  c.localidade = localidade;
  if (zona.id === 'estrangeiro') {
    const pais = limpar(b.pais, 60);
    if (!pais) throw new ErroDoPedido('Escreve o país.', { campo: 'pais' });
    c.pais = pais;
  }
  return c;
}

/* A oferta e as notas. A mensagem do cartão só com oferta (sem oferta não há cartão). Acima dos
   limites recusa-se em vez de cortar: o finalizar não deixa escrever mais (maxlength), por isso só
   um pedido feito à mão lá chega — e uma mensagem de cartão cortada a meio sem ninguém saber era
   pior do que a recusa. */
export function validarExtras(corpo) {
  const oferta = { sim: corpo.oferta === true };
  if (oferta.sim) {
    const mensagem = limpar(corpo.mensagem, Infinity, { linhas: true });
    if (mensagem.length > MAX_MENSAGEM) throw new ErroDoPedido(`A mensagem para o cartão tem mais de ${MAX_MENSAGEM} caracteres.`, { campo: 'mensagem' });
    if (mensagem) oferta.mensagem = mensagem;
  }
  const notas = limpar(corpo.notas, Infinity, { linhas: true });
  if (notas.length > MAX_NOTAS) throw new ErroDoPedido(`As notas têm mais de ${MAX_NOTAS} caracteres.`, { campo: 'notas' });
  return { oferta, notas };
}

/* ---------------------------------------------------------------- o pedido inteiro */

/* O pedido do /checkout: a zona, as contas, o cliente, a oferta, as notas, os termos. Devolve o que
   a encomenda vai levar; lança ErroDoPedido com a frase para o site. O total que o site mostrou
   compara-se no index.js (409), depois de tudo o resto estar certo. */
export function validarPedido(corpo, cat, modo) {
  if (!eObjecto(corpo)) throw new ErroDoPedido('Pedido inválido.');
  const zona = (Array.isArray(cat.zonas) ? cat.zonas : []).find((z) => eObjecto(z) && z.id === corpo.entrega);
  if (!zona) throw new ErroDoPedido('Escolhe como queres receber a encomenda.', { campo: 'entrega' });
  const c = contas(cat, corpo.linhas, zona);
  // Portes por confirmar: em modo «online» não há como os cobrar, por isso não se segue (o site
  // nem mostra essas zonas); em modo «encomenda» a encomenda segue e o email di-lo.
  if (c.portes_por_confirmar && modo === 'online') {
    throw new ErroDoPedido('Para esta entrega confirmamos os portes antes do pagamento: manda-nos mensagem no Instagram.', { campo: 'entrega' });
  }
  const cliente = validarCliente(corpo.cliente, zona);
  const { oferta, notas } = validarExtras(corpo);
  if (corpo.termos !== true) throw new ErroDoPedido('Para encomendar, aceita os termos e condições.', { campo: 'termos' });
  if (!Number.isInteger(corpo.total_cents)) throw new ErroDoPedido('Pedido inválido: falta o total.');
  return { zona, contas: c, cliente, oferta, notas };
}
