/* OS EMAILS DAS ENCOMENDAS (pela Cloudflare, o binding EMAIL; ou pelo Resend, RESEND_API_KEY: ver enviar()). Texto E HTML com os mesmos factos, curtos, em
 * português de Portugal e no tratamento do site (tu), com o logótipo no topo (LOGO_URL), o número
 * da encomenda, cada linha com as escolhas e o texto da personalização, o total, a entrega e o
 * contacto da loja. Ao cliente vai também o aviso da livre resolução, com a ligação a
 * /trocas-e-devolucoes/ (DL 24/2014, arts. 4.º e 6.º: a confirmação em suporte duradouro leva as
 * condições): 14 dias para o que NÃO é personalizado; os personalizados não têm livre resolução
 * (art. 17.º). Nunca a fórmula do botão da lei sobre o pagamento (memória sem-obrigacao-de-pagar):
 * os testes procuram-na em todos os emails.
 *
 * Sem RESEND_API_KEY não se manda nada e a encomenda fica gravada na mesma: até haver domínio, o
 * remetente onboarding@resend.dev só chega ao dono da conta do Resend (o Renato). Sem STORE_EMAIL,
 * o email à loja não se manda. O `text` nunca se omite: a versão de texto de um email que é
 * documento é deliberada, não um subproduto do HTML (memória email-transaccional-texto-e-html).
 *
 * Cada momento (§6 do contrato) é uma entrada de AVISOS: quem a chama é o /checkout (registada),
 * o webhook da Stripe (paga, multibanco, reembolsada, falhou, expirou) e o painel (paga, pronta,
 * enviada, anulada). avisar() manda e devolve o que aconteceu a cada destinatário ({ em, cliente, loja }).
 * À loja só vai o que lhe pede alguma coisa: a encomenda nova e a paga (fazer, enviar, faturar) e o
 * pagamento que chega a uma anulada (devolvê-lo). O «expirou» e o «falhou» não lhe pedem nada — a
 * encomenda não se fez e o painel mostra-a —: só a cliente é avisada (o Renato, 11 nov 2026).
 */

import { documento, tabelaArtigos, ficha, botao, caixaMultibanco, separador, bloco, h2, p, pequeno, ligacao, esc, linhas } from './email-html.js';
import { pedirAoObjecto } from './objecto.js';
import { primeiroNome, ENTREGA_EM_MAO } from './encomenda.js';
import { horaDeLisboa } from './contas.js';
import { siteUrl } from './catalogo.js';
import { NOMES_ZONAS } from '../../src/lib/regras.mjs';

const RESEND = 'https://api.resend.com/emails';

export const eur = (c) => `${(c / 100).toFixed(2).replace('.', ',')} €`;

/* A data por extenso («9 de novembro de 2026»), na hora de Lisboa e sem o Intl (contas.js diz
   porquê). */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function dataPT(iso) {
  const d = horaDeLisboa(new Date(iso));
  return Number.isNaN(d.getTime()) ? '' : `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

const marcaDe = (env) => env.STORE_NAME || 'Franja Kids';
const logoDe = (env) => env.LOGO_URL || `${siteUrl(env)}/assets/marca/logotipo-320.png`;
const dominioDe = (env) => siteUrl(env).replace(/^https?:\/\//, '');
const instagramDe = (env) => String(env.STORE_INSTAGRAM || '').trim().replace(/^@/, '');
const juntar = (...frases) => frases.filter(Boolean).join(' ');
const METODOS = { card: 'cartão', mb_way: 'MB WAY', multibanco: 'Multibanco' };
const metodoPT = (m) => (m ? METODOS[m] || m : '—');

/* ---------------------------------------------------------------- as peças comuns */

const temPersonalizados = (enc) => (enc.linhas || []).some((l) => l.personalizada);
const emMao = (enc) => enc.entrega === ENTREGA_EM_MAO;

/* Os portes e o total, como o site os mostra: «Grátis», «a confirmar», ou o valor. */
function totais(enc) {
  const valor = enc.portes_por_confirmar ? 'a confirmar' : (enc.portes_cents ? eur(enc.portes_cents) : enc.cupao_portes ? 'Grátis (cupão)' : 'Grátis');
  const portes = { rotulo: emMao(enc) ? 'Entrega em mão' : 'Portes', valor };
  const total = enc.portes_por_confirmar ? `${eur(enc.total_cents)} + portes` : eur(enc.total_cents);
  // o desconto do cupão, quando o há (o de portes grátis diz-se nos portes)
  const desconto = enc.cupao && enc.desconto_cents > 0 ? { rotulo: `Cupão ${enc.cupao}`, valor: `−${eur(enc.desconto_cents)}` } : null;
  return { portes, total, desconto };
}
const totalCurto = (enc) => totais(enc).total;

function artigosTexto(enc) {
  const { portes, total } = totais(enc);
  const ls = (enc.linhas || []).flatMap((l) => [
    `  ${l.qtd} × ${l.nome} — ${eur(l.total_cents)}`,
    ...(l.escolhas && l.escolhas.length ? [`      ${l.escolhas.join(' · ')}`] : []),
  ]);
  const { desconto } = totais(enc);
  return ['ARTIGOS', ...ls, ...(desconto ? [`  ${desconto.rotulo}: ${desconto.valor}`] : []), `  ${portes.rotulo}: ${portes.valor}`, `  Total: ${total}`];
}

export const moradaDe = (c) => [c.morada, [c.codigoPostal, c.localidade].filter(Boolean).join(' '), c.pais].filter(Boolean).join(', ');
const nomeDaZona = (enc) => NOMES_ZONAS[enc.entrega] || enc.entrega;

/* A entrega, numa frase: em mão (o dia combina-se por mensagem) ou o envio para a morada que a
   pessoa escreveu, com os portes por confirmar quando o forem. */
function entregaFrase(enc) {
  if (emMao(enc)) return `${nomeDaZona(enc)}: combinamos contigo o dia por mensagem.`;
  return juntar(`Envio para ${moradaDe(enc.cliente || {})}.`, enc.portes_por_confirmar ? 'Confirmamos os portes contigo antes do pagamento.' : '');
}

/* A oferta: sem preços na encomenda (a promessa do finalizar) e a mensagem do cartão. */
function oferta(enc) {
  const o = enc.oferta;
  if (!o || !o.sim) return null;
  const texto = ['É para oferecer: não pomos preços na encomenda.', ...(o.mensagem ? [`Mensagem para o cartão: «${o.mensagem.replace(/\n/g, '\n    ')}»`] : [])];
  const html = p('É para oferecer: não pomos preços na encomenda.', !o.mensagem) + (o.mensagem ? p(`Mensagem para o cartão: «${linhas(o.mensagem)}»`, true) : '');
  return { texto, html };
}

/* O que vem a seguir. A pré-visualização só quando há o que pré-visualizar (um produto com nome ou
   frase); numa encomenda sem personalização ficava uma promessa que ninguém cumpre. */
const previa = (enc) => (temPersonalizados(enc) ? 'Antes de produzirmos, mandamos-te a pré-visualização para aprovares.' : '');
const seguinte = (enc) => (emMao(enc) ? 'Quando estiver pronta, combinamos contigo a entrega.' : 'Avisamos-te quando a encomenda seguir.');

const ligacaoDaEncomenda = (env, enc) => (enc.chave ? `${siteUrl(env)}/obrigado/?e=${encodeURIComponent(enc.encomenda)}&c=${encodeURIComponent(enc.chave)}` : null);

/* A livre resolução: 14 dias para o que não é personalizado; os personalizados não a têm (DL
   24/2014, art. 17.º, n.º 1, al. c)). Escolher a cor ou o tamanho não é personalizar: o que conta
   é a linha levar um nome ou uma frase (`personalizada`, de R.conferirEscolha). */
function desistencia(env, enc) {
  const site = siteUrl(env);
  const trocas = `${site}/trocas-e-devolucoes/`;
  const termos = `${site}/termos/`;
  const ls = enc.linhas || [];
  const n = ls.filter((l) => l.personalizada).length;
  const termosTexto = `Os termos e condições estão em ${termos}.`;
  const termosHtml = `Lê os ${ligacao(termos, 'termos e condições')}.`;
  if (n === 0) {
    const frase = 'Tens 14 dias depois de receberes a encomenda para desistir da compra, sem dares justificação';
    return { texto: `${frase}: vê como em ${trocas}. ${termosTexto}`, html: `${esc(frase)}: ${ligacao(trocas, 'vê como')}. ${termosHtml}` };
  }
  if (n === ls.length) {
    const frase = 'Os artigos personalizados não têm troca nem devolução por desistência.';
    return { texto: `${frase} As condições estão em ${trocas}. ${termosTexto}`, html: `${esc(frase)} ${ligacao(trocas, 'Vê as condições')}. ${termosHtml}` };
  }
  const frase = 'Tens 14 dias depois de receberes a encomenda para desistir dos artigos sem personalização, sem dares justificação; os personalizados não têm troca nem devolução por desistência.';
  return { texto: `${frase} Vê como em ${trocas}. ${termosTexto}`, html: `${esc(frase)} ${ligacao(trocas, 'Vê como')}. ${termosHtml}` };
}

/* O contacto da loja: a mensagem no Instagram (é onde a loja responde) e o email, quando o houver. */
function contactos(env) {
  const ig = instagramDe(env);
  const dm = ig ? `https://ig.me/m/${ig}` : '';
  return {
    texto: [marcaDe(env), dm ? `mensagem no Instagram: ${dm}` : '', env.STORE_EMAIL].filter(Boolean).join(' · '),
    html: [esc(marcaDe(env)), dm ? ligacao(dm, `@${ig} no Instagram`) : '', env.STORE_EMAIL ? ligacao(`mailto:${env.STORE_EMAIL}`, env.STORE_EMAIL) : ''].filter(Boolean).join(' · '),
  };
}

/* ---------------------------------------------------------------- o email ao cliente */

/* Inteiro: a saudação, a frase do momento, a nota do painel (se a houver), os artigos, a entrega e a
   oferta (na confirmação), o botão, e o rodapé com a livre resolução e o contacto. */
function emailCliente(env, enc, { assunto, titulo, frase, nota = '', comEntrega = false, semDesistencia = false, multibanco = null }) {
  const nome = primeiroNome((enc.cliente || {}).nome);
  const subtitulo = `Encomenda ${enc.encomenda} · ${dataPT(enc.criada_em)}`;
  const ver = ligacaoDaEncomenda(env, enc);
  const entrega = comEntrega ? entregaFrase(enc) : '';
  const of = comEntrega ? oferta(enc) : null;
  const d = semDesistencia ? null : desistencia(env, enc);
  const k = contactos(env);
  const texto = [
    `Olá${nome ? ` ${nome}` : ''},`,
    '',
    frase,
    ...(nota ? ['', nota] : []),
    '',
    ...artigosTexto(enc),
    '',
    ...(entrega ? ['ENTREGA', `  ${entrega}`, ''] : []),
    ...(of ? ['OFERTA', ...of.texto.map((x) => `  ${x}`), ''] : []),
    ...(multibanco ? ['PAGAR POR MULTIBANCO', `  Entidade: ${multibanco.entidade}`, `  Referência: ${multibanco.referencia}`, `  Valor: ${eur(enc.total_cents)}`, ...(multibanco.validade ? [`  Válida até: ${new Date(multibanco.validade * 1000).toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' })}`] : []), ''] : []),
    ...(ver ? [`Ver a encomenda: ${ver}`, ''] : []),
    ...(d ? [d.texto, ''] : []),
    k.texto,
  ].join('\n');
  const corpo = [
    bloco(p(`Olá${nome ? ` ${esc(nome)}` : ''},`) + p(esc(frase), !nota) + (nota ? p(linhas(nota), true) : '')),
    tabelaArtigos(enc, totais(enc)),
    entrega ? bloco(h2('Entrega') + p(esc(entrega), true)) : '',
    of ? bloco(h2('Oferta') + of.html) : '',
    multibanco ? caixaMultibanco(multibanco, enc.total_cents) : '',
    ver ? botao(ver, 'Ver a encomenda') : '',
    separador(),
    bloco((d ? pequeno(d.html) : '') + pequeno(k.html, true), '14px 40px 0 40px'),
  ].join('');
  const rodape = `Recebeste este email porque fizeste uma encomenda em ${dominioDe(env)}. É sobre a tua encomenda, não é publicidade.`;
  const html = documento({ assunto, preheader: frase, titulo, subtitulo, corpo, logo: logoDe(env), marca: marcaDe(env), rodape });
  return { assunto, texto, html };
}

/* ---------------------------------------------------------------- o email à loja */

/* Tudo o que a loja precisa para fazer, enviar e faturar: as linhas com o texto da personalização,
   a entrega com a morada, a oferta, as notas e o cliente com o telefone e o NIF. Responder a este
   email responde ao cliente (reply_to). */
function emailLoja(env, enc, { assunto, titulo, cabecalho, rodape = [] }) {
  const c = enc.cliente || {};
  const of = oferta(enc);
  const entregaLinhas = emMao(enc)
    ? [nomeDaZona(enc)]
    : [`${nomeDaZona(enc)}${enc.portes_por_confirmar ? ' — PORTES POR CONFIRMAR com o cliente' : ''}`, `${c.nome || '—'}, ${moradaDe(c)}`];
  const clientePares = [
    ['Nome', c.nome || '—'],
    ['Telemóvel', c.telefone || '—'],
    ['Email', c.email || '—'],
    ['NIF', c.nif || '(não indicado)'],
  ];
  const texto = [
    cabecalho,
    '',
    ...artigosTexto(enc),
    '',
    'ENTREGA',
    ...entregaLinhas.map((x) => `  ${x}`),
    '',
    ...(of ? ['OFERTA', ...of.texto.map((x) => `  ${x}`), ''] : []),
    ...(enc.notas ? ['NOTAS DO CLIENTE', `  ${enc.notas.replace(/\n/g, '\n  ')}`, ''] : []),
    'CLIENTE',
    ...clientePares.map(([k, v]) => `  ${k}: ${v}`),
    ...(rodape.length ? ['', ...rodape] : []),
  ].join('\n');
  const corpo = [
    bloco(p(esc(cabecalho), true)),
    tabelaArtigos(enc, totais(enc)),
    bloco(h2('Entrega') + entregaLinhas.map((x, i) => p(esc(x), i === entregaLinhas.length - 1)).join('')),
    of ? bloco(h2('Oferta') + of.html) : '',
    enc.notas ? bloco(h2('Notas do cliente') + p(linhas(enc.notas), true)) : '',
    bloco(h2('Cliente'), '20px 40px 0 40px'),
    ficha(clientePares.map(([k, v]) => [k, k === 'Email' && c.email ? ligacao(`mailto:${c.email}`, c.email) : esc(v)])),
    rodape.length ? separador() : '',
    rodape.length ? bloco(rodape.map((x, i) => pequeno(esc(x), i === rodape.length - 1)).join(''), '14px 40px 0 40px') : '',
  ].join('');
  const html = documento({
    assunto, preheader: cabecalho, titulo, subtitulo: `Encomenda ${enc.encomenda} · ${dataPT(enc.criada_em)}`, corpo,
    logo: logoDe(env), marca: marcaDe(env), rodape: 'Email automático da loja online. Responder a este email é responder ao cliente.',
  });
  return { assunto, texto, html };
}

/* ---------------------------------------------------------------- os momentos */

const pagamentoTexto = (enc) => `Pagamento: ${metodoPT((enc.stripe || {}).metodo)} · Stripe: ${(enc.stripe || {}).payment_intent || '—'}`;

const AVISOS = {
  registada: (env, enc) => ({
    cliente: emailCliente(env, enc, {
      assunto: `Recebemos a tua encomenda ${enc.encomenda}`,
      titulo: 'Recebemos a tua encomenda',
      frase: juntar('A tua encomenda ficou registada. Vamos confirmá-la e combinar contigo o pagamento.', previa(enc)),
      comEntrega: true,
    }),
    loja: emailLoja(env, enc, {
      assunto: `Nova encomenda ${enc.encomenda} — ${totalCurto(enc)}`,
      titulo: 'Nova encomenda',
      cabecalho: `Nova encomenda ${enc.encomenda} — ${totalCurto(enc)}.`,
      rodape: ['Falta confirmar a encomenda com o cliente e combinar o pagamento.'],
    }),
  }),
  paga: (env, enc, { origem }) => {
    // Um pagamento que chega a uma encomenda já anulada (ou já reembolsada, por um evento atrasado)
    // não se festeja com o cliente: a loja é que tem de o devolver.
    if (enc.estado === 'anulada') {
      return {
        cliente: null,
        loja: origem === 'stripe' ? emailLoja(env, enc, {
          assunto: `Pagamento numa encomenda anulada: ${enc.encomenda} — ${eur(enc.total_cents)}`,
          titulo: 'Pagamento numa encomenda anulada',
          cabecalho: `O pagamento da encomenda ${enc.encomenda} (${eur(enc.total_cents)}) entrou depois de a encomenda ser anulada. É preciso devolvê-lo na Stripe.`,
          rodape: [pagamentoTexto(enc)],
        }) : null,
      };
    }
    if (enc.estado === 'reembolsada') return { cliente: null, loja: null };
    const stripe = origem === 'stripe';
    return {
      cliente: emailCliente(env, enc, {
        assunto: `Pagamento recebido — encomenda ${enc.encomenda}`,
        titulo: 'Pagamento recebido',
        // Pela Stripe, este é o primeiro email (a confirmação): leva a entrega e a pré-visualização.
        // Marcada no painel, a encomenda já foi confirmada com o cliente.
        frase: juntar('Recebemos o teu pagamento.', stripe ? previa(enc) : '', seguinte(enc)),
        comEntrega: stripe,
      }),
      // Pela Stripe, a loja tem de saber (faturar, produzir); pelo painel, foi ela que marcou.
      loja: stripe ? emailLoja(env, enc, {
        assunto: `Encomenda paga ${enc.encomenda} — ${eur(enc.total_cents)}`,
        titulo: 'Encomenda paga',
        cabecalho: `Encomenda paga ${enc.encomenda} — ${eur(enc.total_cents)}.`,
        rodape: [pagamentoTexto(enc), temPersonalizados(enc) ? 'A seguir: a fatura e a pré-visualização para o cliente aprovar.' : 'A seguir: a fatura.'],
      }) : null,
    };
  },
  pronta: (env, enc) => ({
    cliente: emailCliente(env, enc, {
      assunto: `A tua encomenda ${enc.encomenda} está pronta`,
      titulo: 'A tua encomenda está pronta',
      frase: 'A tua encomenda está pronta. Vamos combinar contigo o dia da entrega em mão.',
    }),
    loja: null,
  }),
  enviada: (env, enc, { nota }) => ({
    cliente: emailCliente(env, enc, {
      assunto: `A tua encomenda ${enc.encomenda} seguiu`,
      titulo: 'A tua encomenda seguiu',
      frase: `A tua encomenda seguiu pelo correio para ${moradaDe(enc.cliente || {})}.`,
      nota,
    }),
    loja: null,
  }),
  anulada: (env, enc, { nota }) => ({
    cliente: emailCliente(env, enc, {
      assunto: `A tua encomenda ${enc.encomenda} foi anulada`,
      titulo: 'Encomenda anulada',
      frase: 'A tua encomenda foi anulada.',
      nota,
      semDesistencia: true,
    }),
    loja: null,
  }),
  reembolsada: (env, enc) => ({
    cliente: emailCliente(env, enc, {
      assunto: `Reembolso feito — encomenda ${enc.encomenda}`,
      titulo: 'Reembolso feito',
      frase: `Devolvemos ${eur((enc.stripe || {}).reembolsado_cents || enc.total_cents)} ao meio de pagamento que usaste. O banco pode demorar alguns dias a mostrá-lo.`,
      semDesistencia: true,
    }),
    loja: null,
  }),
  // A referência Multibanco: o pagamento ainda não entrou (o Worker manda este email; o da Stripe, com
  // as instruções, está desligado, para não chegarem dois). Sem email à loja: ela sabe quando pagar.
  multibanco: (env, enc) => ({
    cliente: emailCliente(env, enc, {
      assunto: `Falta pagar: referência Multibanco da encomenda ${enc.encomenda}`,
      titulo: 'Falta pagar',
      frase: 'Para concluíres a encomenda, paga a referência Multibanco abaixo. Assim que o pagamento entrar, avisamos-te.',
      multibanco: (enc.stripe || {}).multibanco,
      semDesistencia: true,
    }),
    loja: null,
  }),
  // Pela Stripe, só um meio diferido falha depois da página: a referência Multibanco que não se pagou a tempo.
  falhou: (env, enc) => naoConcluido(env, enc, (enc.stripe || {}).multibanco ? 'A referência Multibanco expirou sem o pagamento.' : 'O pagamento não se concluiu.'),
  expirou: (env, enc) => naoConcluido(env, enc, 'A página de pagamento expirou sem o pagamento.'),
};

/* O pagamento que não se fez: só à cliente (à loja não pede nada; o painel mostra a encomenda). */
function naoConcluido(env, enc, razao) {
  return {
    cliente: emailCliente(env, enc, {
      assunto: `O pagamento da encomenda ${enc.encomenda} não se concluiu`,
      titulo: 'O pagamento não se concluiu',
      frase: `${razao} Nada foi cobrado. Podes encomendar outra vez no site ou mandar-nos mensagem no Instagram.`,
      semDesistencia: true,
    }),
    loja: null,
  };
}

/* As mensagens de um momento, sem as mandar (os testes lêem-nas). */
export function mensagens(env, aviso, enc, extras = {}) {
  const f = AVISOS[aviso];
  return f ? f(env, enc, extras) : { cliente: null, loja: null };
}

/* ---------------------------------------------------------------- o envio */

/* O REMETENTE: «Nome <endereço>» (MAIL_FROM) partido para o binding da Cloudflare, que quer
   { email, name }. Um MAIL_FROM só com o endereço também serve. */
export function remetenteDe(env) {
  const v = String(env.MAIL_FROM || '').trim();
  const m = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(v);
  return m ? { email: m[2], name: m[1].replace(/^"|"$/g, '').trim() || undefined } : { email: v };
}

/* POR ONDE SAI UM EMAIL: pela Cloudflare (Email Sending, o binding EMAIL do wrangler.toml; o domínio
   franjakids.com está nele desde 10 nov 2026, e o plano Workers Paid da conta deixa mandar a qualquer
   pessoa), e só sem ele pelo Resend (RESEND_API_KEY). Sem nenhum dos dois não se manda nada. */
export async function enviar(env, { para, assunto, texto, html, responderA }) {
  if (env.EMAIL && typeof env.EMAIL.send === 'function') {
    try {
      await env.EMAIL.send({ from: remetenteDe(env), to: para, subject: assunto, text: texto, html: html || undefined, replyTo: responderA || undefined });
      return 'enviado';
    } catch (e) {
      console.error('a Cloudflare recusou o email', e && e.code, assunto, e && e.message);
      return 'falhou';
    }
  }
  if (!env.RESEND_API_KEY) { console.log('email não enviado (sem o EMAIL da Cloudflare nem RESEND_API_KEY):', assunto); return 'sem chave'; }
  try {
    const r = await fetch(RESEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${String(env.RESEND_API_KEY).trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [para], subject: assunto, text: texto, html: html || undefined, reply_to: responderA || undefined }),
    });
    if (!r.ok) { console.error('Resend recusou', r.status, assunto, await r.text().catch(() => '')); return 'falhou'; }
    return 'enviado';
  } catch (e) {
    console.error('Resend não respondeu', assunto, e.message);
    return 'falhou';
  }
}

/* Manda os emails de um momento e diz o que aconteceu a cada um:
   'enviado' | 'falhou' | 'sem chave' | 'sem email' (o cliente) | 'sem destinatário' (a loja, sem
   STORE_EMAIL) | 'não se aplica' (o momento não tem esse email). */
export async function avisar(env, aviso, enc, extras = {}) {
  const m = mensagens(env, aviso, enc, extras);
  const email = (enc.cliente || {}).email;
  const [cliente, loja] = await Promise.all([
    !m.cliente ? 'não se aplica' : !email ? 'sem email' : extras.semCliente ? String(extras.semCliente) : enviar(env, { para: email, ...m.cliente, responderA: env.STORE_EMAIL || undefined }),
    !m.loja ? 'não se aplica' : !env.STORE_EMAIL ? 'sem destinatário' : enviar(env, { para: env.STORE_EMAIL, ...m.loja, responderA: email || undefined }),
  ]);
  return { em: new Date().toISOString(), cliente, loja };
}

export const falhou = (r) => Boolean(r) && (r.cliente === 'falhou' || r.loja === 'falhou');

/* O TRAVÃO DOS EMAILS DE ENCOMENDAS POR PAGAR (11 nov 2026, da revisão a fundo). Qualquer pessoa pode
   encomendar com o email de outra, e a «registada» (modo encomenda) e a «expirou» (modo online) levam
   a essa pessoa o nome, a morada e os textos que quem encomendou escreveu, a partir de franjakids.com.
   Por endereço, no máximo MAX_EMAILS_POR_PAGAR por dia; o da loja sai sempre, e o «paga» não tem
   travão (houve pagamento). Conta-se num objecto durável por endereço (o resumo SHA-256, nunca o
   email); se o contador falhar, o email segue (antes um a mais do que uma encomenda sem aviso). */
export const MAX_EMAILS_POR_PAGAR = 3;
async function resumoDe(texto) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export async function podeAvisarCliente(env, email) {
  if (!email || !env.CONTADOR) return true;
  try {
    const { ok } = await pedirAoObjecto(env, 'CONTADOR', `email:${await resumoDe(String(email).trim().toLowerCase())}`, { max: MAX_EMAILS_POR_PAGAR });
    return ok !== false;
  } catch (e) {
    console.error('o contador dos emails falhou (o email segue):', e.message);
    return true;
  }
}
