// As páginas do site. Cada função devolve { caminho, titulo, descricao, corpo, imagem?, jsonld?, tituloSeo?,
// indexar?, fontes? }: `tituloSeo` é o <title> (sem « · Franja Kids»), quando não é o `titulo`; `indexar: false`
// põe a página fora do Google (noindex, follow, e fora do sitemap); `fontes` são os ficheiros do conteúdo que
// a página mostra, para a data do sitemap (build.mjs).
// ctx = { loja, catalogo, cat (R.catalogoDe), produtos (os do site, já pela ordem), seccoes (seccoesComProdutos), api }
import { BOTAO_ENCOMENDA } from '../legal-comum/index.mjs';
import * as R from './lib/regras.mjs';
import { url, esc, euro, euroRedondo, foto, icone, FOTOS } from './util.mjs';
import { SECCOES, TITULOS, resumir, descricaoDoProduto, ldSite, ldLoja, ldMigalhas, ldProduto } from './seo.mjs';

const zonaMao = (loja) => loja.entrega.zonas.find((z) => z.id === 'mao' && !R.zonaSobConsulta(z));
const online = (loja) => loja.pagamentos?.modo === 'online';
export const mensagemInstagram = (loja) => `https://ig.me/m/${loja.instagram}`;
/* O coração dos textos da loja («Fala connosco no Instagram ♡»): à vista, mas o leitor de ecrã não o lê. */
export const coracao = (html) => html.replace(/\s*♡/g, ' <span class="coracao" aria-hidden="true">♡</span>');

/* ── O MENU E AS LISTAS (o pedido da loja de 20 nov 2026; docs/MENU-E-CATEGORIAS.md) ──
   As secções do catálogo (Bebé, Personalizados…) e as suas categorias, só as que têm produtos: uma vazia não tem
   página nem entrada no menu. A página de uma secção junta os produtos de todas as suas categorias, sem repetir e
   pela ordem dos produtos. As listas entram no Google com MINIMO_INDEXAR produtos ou mais: uma lista de um produto
   só é quase a ficha dele. */
export const MINIMO_INDEXAR = 2;
/* As secções em que tudo é personalizado: os cartões delas não levam a etiqueta «Personalizável», e as peças delas
   (estampadas ou bordadas) fazem-se por encomenda. */
export const SECCOES_PERSONALIZADAS = new Set(['personalizados', 'crianca-e-familia']);
/* Uma peça feita por encomenda: com personalização, ou de uma secção personalizada. */
export const feitaPorEncomenda = (p) => Boolean(p._pers) || p._categorias.some((k) => SECCOES_PERSONALIZADAS.has(R.seccaoDaChave(k)));

/** [{ id, nome, frase, foto, href, produtos, itens: [{ id, nome, frase, foto, chave, href, produtos }] }] */
export function seccoesComProdutos(cat, produtos) {
  return cat.seccoes.map((s) => {
    const itens = s.itens.map((i) => {
      const chave = R.chaveDaCategoria(s.id, i.id);
      return { ...i, chave, href: `/${s.id}/${i.id}/`, produtos: produtos.filter((p) => p._categorias.includes(chave)) };
    }).filter((i) => i.produtos.length);
    return { ...s, href: `/${s.id}/`, itens, produtos: produtos.filter((p) => itens.some((i) => i.produtos.includes(p))) };
  }).filter((s) => s.itens.length);
}

/* Para onde vão o «Começar a personalizar» da capa, o «Ver tudo» e a página 404: os Personalizados, ou a primeira
   secção com produtos (a dona pode tirar uma secção, e a ligação não pode ficar a apontar para o vazio). */
export function destinoDaLoja(seccoes) {
  const p = seccoes.find((s) => s.id === 'personalizados');
  if (p) return { href: p.href, texto: 'Começar a personalizar', ver: 'Ver os personalizados' };
  return seccoes.length ? { href: seccoes[0].href, texto: 'Ver a loja', ver: 'Ver a loja' } : { href: '/procurar/', texto: 'Ver a loja', ver: 'Ver a loja' };
}

/** Os ficheiros do conteúdo que mostram estes produtos (o JSON e a fotografia do cartão, ou todas). */
const fontesDe = (lista, todas = false) => [R.FICHEIROS.fotos, ...lista.flatMap((p) => [R.ficheiroDoArtigo(p.slug), ...(todas ? p.fotos : p.fotos.slice(0, 1)).map(R.ficheiroDaFoto)])];

/** As migalhas à vista: [[nome, caminho], …]; a última é a página onde se está (sem ligação). */
const navMigalhas = (itens) => `<nav aria-label="Estás aqui"><ol class="migalhas">${itens.map(([n, c], i) => (i < itens.length - 1 ? `<li><a href="${url(c)}">${esc(n)}</a></li>` : `<li aria-current="page">${esc(n)}</li>`)).join('')}</ol></nav>`;

/* Uma descrição para o Google tem de dizer alguma coisa (50 a 160 caracteres): uma frase curta, ou nenhuma, leva o
   resto. */
const descricaoDeLista = (frase, nome) => {
  const f = String(frase || '').trim();
  return resumir(f.length >= 50 ? f : `${f ? `${f.replace(/[.!?…]*$/, '.')} ` : ''}${nome} na Franja Kids: peças feitas por encomenda, com envio para todo o país.`);
};

// ── Produtos ────────────────────────────────────────────────────────────────

/* O preço de um cartão: o mais baixo que se pode pagar (R.precoMinimo), com «desde» quando alguma escolha o pode
   fazer subir. */
export function precoHtml(p, classe = 'cartao__preco') {
  if (p.preco == null) return `<p class="${classe} ${classe}--falta">Preço por confirmar</p>`;
  return `<p class="${classe}">${R.temSuplementos(p, p._tamanhos) ? 'desde ' : ''}${euro(R.precoMinimo(p, p._tamanhos))}</p>`;
}

/* Um cartão de produto. Numa grelha, os primeiros (os que se vêem logo, até 4 por fila) carregam sem esperar
   (`lazy: false`) e o 1.º com prioridade: é a imagem maior do ecrã (o LCP), e «lazy» atrasava-a. A etiqueta
   «Personalizável» não vai nos produtos das secções personalizadas (lá, é tudo). */
export function cartao(p, { sizes = '(min-width: 1024px) 270px, (min-width: 768px) 30vw, 45vw', selo = !SECCOES_PERSONALIZADAS.has(p._seccao), prioridade = false, lazy = true } = {}) {
  return `<a class="cartao" href="${url(`/produtos/${p.slug}/`)}">`
    + `<div class="cartao__foto">${foto(p.fotos[0], { sizes, alt: '', prioridade, lazy })}${p._esgotado ? '<span class="cartao__selo cartao__selo--esgotado">Esgotado</span>' : selo && p._pers ? '<span class="cartao__selo">Personalizável</span>' : ''}</div>`
    + `<h3>${esc(p.nome)}</h3>${precoHtml(p)}</a>`;
}

// ── Início ──────────────────────────────────────────────────────────────────

/* A NOSSA HISTÓRIA (o texto da loja, 20 nov 2026). A fotografia escolhe-a a dona no painel (loja.fotoHistoria). */
const HISTORIA_ABERTURA = 'Uma marca que nasceu do amor de uma família e cresceu com a força da amizade.';
const HISTORIA = [
  'Tudo começou com uma ideia, um sonho e duas meninas muito especiais. Primeiro chegou a Francisca, a nossa Fran. Mais tarde, com a chegada da Jade, a nossa Ja, nasceu também a inspiração para criar algo que tivesse um bocadinho das duas.',
  'E foi assim, da junção de Fran + Ja, que nasceu a Franja Kids, no dia 10 de setembro de 2025. A ideia nasceu entre nós enquanto casal, Daniela e Samuel, com a vontade de criar uma marca dedicada aos bebés, às crianças e às famílias, onde cada peça pudesse contar uma história.',
  'Mas os sonhos tornam-se ainda mais especiais quando são partilhados com pessoas que acreditam neles. Foi através de um convite nosso que a Juliana e o Sérgio se juntaram a esta aventura. Trouxeram novas ideias, dedicação, mais mãos para ajudar e a mesma vontade de fazer crescer este projeto.',
  'E assim, aquilo que começou com um casal transformou-se numa verdadeira equipa de amigos. Hoje, não somos apenas a Daniela e o Samuel: somos uma família, unida pelo carinho, pela amizade e pela certeza de que juntos somos mais fortes.',
  'A Franja Kids é muito mais do que uma marca. É um projeto construído com amor, dedicação e muitos sonhos por realizar.',
];
const HISTORIA_FECHO = 'Bem-vindos à nossa família. Bem-vindos à Franja Kids!';
export const fotoDaHistoria = (loja) => [loja.fotoHistoria, R.FOTO_HISTORIA].find((f) => typeof f === 'string' && FOTOS[f]) || null;

/* «Para quem é?»: as categorias dos Presentes com fotografia (a dona escolhe quais, ao dar-lhes uma), com o nome
   curto: «Presentes para avós e bisavós» → «Avós e bisavós». */
const PARA_QUEM = /^(?:presentes|prendas|convites|ideias)\s+(?:para|de)\s+(?:(?:os|as|o|a)\s+)?/i;
const nomeParaQuem = (n) => { const c = n.replace(PARA_QUEM, ''); return c ? c.charAt(0).toUpperCase() + c.slice(1) : n; };
/* A fotografia de uma secção na montra: a dela, ou a do primeiro produto. */
const fotoDaSeccao = (s) => (s.foto && FOTOS[s.foto] ? s.foto : s.produtos[0].fotos[0]);

export function inicio({ loja, produtos, seccoes }) {
  const presentes = seccoes.find((s) => s.id === 'presentes');
  const paraQuem = (presentes?.itens || []).filter((i) => i.foto && FOTOS[i.foto]);
  const destaques = produtos.filter((p) => p.destaque === true);
  const destino = destinoDaLoja(seccoes);
  const insta = ['ig-forro-fado', 'ig-sonho', 'ig-mapa', 'vais-ser-avo', 'ig-maior-sonho', 'ig-coracao'];
  const passos = [
    ['Escolhe o teu favorito', 'Explora os nossos artigos e encontra o que mais gostas.', 'saco'],
    ['Personaliza ao teu gosto', 'Acrescenta o nome, a frase ou os detalhes que tornam a tua peça única.', 'lapis'],
    ['Finaliza a encomenda', online(loja) ? 'Confirma os teus dados e paga de forma simples e segura.' : 'Confirma os teus dados e envia a encomenda; depois combinamos contigo o pagamento.', 'cartao'],
    ['Recebe com carinho', 'Preparamos a tua encomenda com todo o cuidado e enviamos até ti.', 'carrinha'],
  ];
  const fh = fotoDaHistoria(loja);
  return {
    caminho: '/',
    titulo: 'Início',
    descricao: resumir(loja.descricao),
    imagem: 'vais-ser-avo',
    jsonld: [ldSite(loja), ldLoja(loja)],
    fontes: [R.PASTAS.artigos, R.PASTAS.fotos, R.FICHEIROS.fotos],
    corpo: `<section class="contentor heroi" aria-labelledby="t-heroi">
  <div class="heroi__texto">
    <h1 id="t-heroi">Tu imaginas, nós personalizamos.</h1>
    <p>Roupa e presentes com nome, feitos por encomenda para bebés, crianças e família.</p>
    <div class="heroi__botoes">
      <a class="botao botao--cheio" href="${url(destino.href)}">${destino.texto}</a>
      ${paraQuem.length ? `<a class="ligacao" href="#ocasioes">Ver ocasiões ${icone('seta', 'icone icone--pequeno')}</a>` : ''}
    </div>
  </div>
  <div class="heroi__imagem">
    ${foto('vais-ser-avo', { sizes: '(min-width: 1024px) 460px, calc(100vw - 64px)', prioridade: true, classe: 'heroi__foto' })}
    <div class="selo" aria-hidden="true">
      <svg class="selo__anel" viewBox="0 0 120 120" focusable="false">
        <defs><path id="selo-circulo" d="M60 60m-43 0a43 43 0 1 1 86 0a43 43 0 1 1-86 0"/></defs>
        <circle cx="60" cy="60" r="58"/>
        <text><textPath href="#selo-circulo" textLength="266" lengthAdjust="spacing">FEITO POR ENCOMENDA · COM AMOR ·</textPath></text>
      </svg>
      <svg class="selo__meio" viewBox="0 0 120 120" focusable="false"><path class="selo__coracao" d="M60 72s-11-6.8-11-15.2A6.1 6.1 0 0 1 60 53a6.1 6.1 0 0 1 11 3.8C71 65.2 60 72 60 72z"/></svg>
    </div>
  </div>
</section>
${paraQuem.length ? `
<section id="ocasioes" class="seccao" aria-labelledby="t-ocasioes">
  <div class="contentor seccao__topo"><h2 id="t-ocasioes">Para quem é?</h2></div>
  <ul class="contentor ocasioes">
    ${paraQuem.map((i) => `<li><a href="${url(i.href)}"><span class="ocasioes__nome">${esc(nomeParaQuem(i.nome))}</span>${foto(i.foto, { sizes: '116px', alt: '', classe: 'ocasioes__foto' })}${icone('seta', 'icone icone--pequeno ocasioes__seta')}</a></li>`).join('\n    ')}
  </ul>
</section>
` : ''}
<section class="seccao" aria-labelledby="t-loja">
  <div class="contentor seccao__topo"><h2 id="t-loja">O que fazemos</h2></div>
  <ul class="fila montra" style="--n:${Math.max(1, Math.min(6, seccoes.length))}">
    ${seccoes.map((s) => `<li><a href="${url(s.href)}">${foto(fotoDaSeccao(s), { sizes: '(min-width: 1024px) 240px, 60vw', alt: '', classe: 'montra__foto' })}<span class="montra__nome">${esc(s.nome)}${icone('seta', 'icone icone--pequeno')}</span></a></li>`).join('\n    ')}
  </ul>
</section>
${destaques.length ? `
<section class="seccao" aria-labelledby="t-destaques">
  <div class="contentor seccao__topo">
    <h2 id="t-destaques">Mais pedidos</h2>
    <a class="ligacao" href="${url(destino.href)}">Ver tudo ${icone('seta', 'icone icone--pequeno')}</a>
  </div>
  <ul class="fila produtos">
    ${destaques.map((p) => `<li>${cartao(p, { sizes: '(min-width: 1024px) 270px, 66vw', selo: false })}</li>`).join('\n    ')}
  </ul>
</section>
` : ''}
<section id="como-funciona" class="seccao" aria-labelledby="t-como">
  <div class="contentor seccao__topo">
    <h2 id="t-como">Como funciona</h2>
    <a class="ligacao" href="${url('/como-funciona/')}">Saber mais ${icone('seta', 'icone icone--pequeno')}</a>
  </div>
  <ol class="contentor passos">
    ${passos.map(([t, d, i]) => `<li><span class="passos__icone">${icone(i)}</span><h3>${t}</h3><p>${d}</p></li>`).join('\n    ')}
  </ol>
</section>

<section id="historia" class="seccao" aria-labelledby="t-historia">
  <div class="contentor sobre">
    ${fh ? foto(fh, { sizes: '(min-width: 1024px) 560px, calc(100vw - 64px)', classe: 'sobre__foto' }) : ''}
    <div class="sobre__texto">
      <h2 id="t-historia">A nossa história</h2>
      <p class="sobre__abertura">${HISTORIA_ABERTURA}</p>
      ${HISTORIA.map((t) => `<p>${t}</p>`).join('\n      ')}
      <p class="sobre__fecho">${HISTORIA_FECHO}</p>
      <a class="botao botao--linha" href="${url('/sobre/')}">Sobre nós</a>
    </div>
  </div>
</section>

<section class="seccao" aria-labelledby="t-insta">
  <div class="contentor seccao__topo">
    <h2 id="t-insta">Do nosso Instagram</h2>
    <a class="ligacao" href="https://www.instagram.com/${loja.instagram}/">@${loja.instagram} ${icone('seta', 'icone icone--pequeno')}</a>
  </div>
  <ul class="contentor insta">
    ${insta.map((f) => `<li><a href="https://www.instagram.com/${loja.instagram}/">${foto(f, { sizes: '(min-width: 1024px) 190px, 31vw' })}</a></li>`).join('\n    ')}
  </ul>
</section>`,
  };
}

// ── As listas: a página de cada secção e a de cada categoria ────────────────────────────────

/* As pastilhas são ligações entre páginas (o Google não lê filtros com «?»): «Tudo» e as categorias da secção, com
   a da página onde se está marcada. */
function listagem(ctx, s, i = null) {
  const pastilha = (href, texto, ativa) => `<a class="pastilha" href="${url(href)}"${ativa ? ' aria-current="page"' : ''}>${esc(texto)}</a>`;
  const meus = i ? i.produtos : s.produtos;
  const titulo = i ? i.nome : s.nome;
  const frase = i ? i.frase || s.frase : s.frase;
  const seo = SECCOES[s.id] || {};
  const comSeccao = i ? `${i.nome} · ${s.nome}` : '';
  const tituloSeo = i ? TITULOS[i.chave] || (comSeccao.length <= 50 ? comSeccao : i.nome) : seo.titulo || s.nome;
  const migalhas = [['Início', '/'], [s.nome, s.href], ...(i ? [[i.nome, i.href]] : [])];
  const propria = i ? i.foto : s.foto;
  return {
    caminho: i ? i.href : s.href,
    titulo,
    tituloSeo,
    descricao: descricaoDeLista(i ? frase : seo.descricao || frase, titulo),
    indexar: meus.length >= MINIMO_INDEXAR,
    imagem: meus[0]?.fotos[0] || (propria && FOTOS[propria] ? propria : undefined),
    jsonld: [ldMigalhas(migalhas)],
    fontes: fontesDe(meus),
    corpo: `<section class="contentor pagina" aria-labelledby="t-linha">
  ${i ? navMigalhas(migalhas) : ''}
  <h1 id="t-linha">${esc(titulo)}</h1>
  ${frase ? `<p>${esc(frase)}</p>` : ''}
  <div class="filtros" data-filtros>
    <div class="fila filtros__fila" role="group" aria-label="Categorias de ${esc(s.nome)}">
      ${pastilha(s.href, 'Tudo', !i)}
      ${s.itens.map((x) => pastilha(x.href, x.nome, x === i)).join('\n      ')}
    </div>
  </div>
  <h2 class="contagem">${meus.length} ${meus.length === 1 ? 'artigo' : 'artigos'}</h2>
  <ul class="grelha" data-grelha>
    ${meus.map((p, k) => `<li>${cartao(p, { prioridade: k === 0, lazy: k >= 4, selo: !SECCOES_PERSONALIZADAS.has(s.id) && !SECCOES_PERSONALIZADAS.has(p._seccao) })}</li>`).join('\n    ')}
  </ul>
</section>`,
  };
}

/** As páginas das secções e das categorias que existem (as que têm produtos). */
export const listas = (ctx) => ctx.seccoes.flatMap((s) => [listagem(ctx, s), ...s.itens.map((i) => listagem(ctx, s, i))]);

// ── Ficha do produto ────────────────────────────────────────────────────────

/* Um grupo de escolhas: valores = [{ nome, suplemento, marcada, foto?, amostra?, esgotado? }]. `campo` diz ao
   carrinho onde guardar a escolha (tamanho, cor; sem campo, é uma das «opcoes»). Um valor esgotado fica à
   vista, riscado e sem se poder escolher. */
function grupo(nome, valores, { campo, amostras = false } = {}) {
  const id = 'o-' + nome.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  return `<fieldset class="opcao" data-opcao="${esc(nome)}"${campo ? ` data-campo="${campo}"` : ''} data-obrigatoria aria-describedby="${id}-erro">
    <legend>${esc(nome)} <span data-escolhido></span></legend>
    <div class="opcao__valores">${valores.map((v) => `<label class="escolha${amostras ? ' amostra' : ''}"><input type="radio" name="${esc(nome)}" value="${esc(v.nome)}" data-suplemento="${v.suplemento || 0}"${v.foto != null && v.foto >= 0 ? ` data-foto="${v.foto}"` : ''}${v.marcada && !v.esgotado ? ' checked' : ''}${v.esgotado ? ' disabled' : ''}><span>${amostras ? `<i style="--amostra:${v.amostra || '#ddd'}"></i>` : ''}${esc(v.nome)}${v.esgotado ? ' <small class="escolha__esgotado">esgotado</small>' : v.suplemento ? ` <small>+${euro(v.suplemento)}</small>` : ''}</span></label>`).join('')}</div>
    <p class="campo__erro" id="${id}-erro" data-erro></p>
  </fieldset>`;
}

function semPreco(p) {
  const intervalo = (l) => (l.length > 2 ? `${l[0].replace(/ (meses|anos)$/, '')} a ${l[l.length - 1]}` : l.join(' e '));
  const linhas = [];
  if (p._tamanhos.length) linhas.push(['Tamanhos', intervalo(p._tamanhos)]);
  if (p._cores.length) linhas.push(['Cores', p._cores.map((c) => c.nome).join(', ')]);
  for (const o of p._opcoes) linhas.push([o.nome, o.valores.map((v) => v.nome).join(' ou ')]);
  if (p._pers) linhas.push(['Personalização', p._pers.rotulo]);
  return linhas.length ? `<dl class="ficha__lista">${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '';
}

/* O AVISO DE STOCK (20 nov 2026, o pedido da loja; docs/MENU-E-CATEGORIAS.md §6): num produto esgotado, ou com um
   tamanho, uma cor ou uma escolha esgotados, a cliente deixa o email e o Worker das encomendas guarda o pedido. A
   loja avisa quando quiser, no painel. Só com o Worker no ar (a pré-visualização não tem para onde mandar). */
function avisoDeStock(p, esgotados) {
  const variantes = p._esgotado ? [] : esgotados;
  const so = (g) => variantes.every((v) => v.grupo === g);
  const pergunta = so('Tamanho') ? 'Esgotado o tamanho que procuras?' : so('Cor') ? 'Esgotada a cor que procuras?' : 'Esgotado o que procuras?';
  const form = `<form class="aviso-stock__form" data-aviso-stock data-aviso-produto="${esc(p.slug)}" novalidate>
      ${variantes.length ? `<div class="campo"><label for="aviso-variante">O que procuras</label><select id="aviso-variante" name="variante">${variantes.map((v) => `<option value="${esc(JSON.stringify(v))}">${esc(v.grupo === 'Tamanho' || v.grupo === 'Cor' ? `${v.grupo} ${v.valor}` : `${v.grupo}: ${v.valor}`)}</option>`).join('')}</select></div>` : ''}
      <div class="campo"><label for="aviso-email">Email</label><input id="aviso-email" name="email" type="email" autocomplete="email" required aria-describedby="aviso-email-erro"><p class="campo__erro" id="aviso-email-erro" data-erro></p></div>
      <button class="botao botao--cheio" type="submit">Avisa-me</button>
      <p class="campo__pista">Usamos o email só para este aviso, uma vez: depois apagamo-lo (e ao fim de 6 meses, se não voltar). <a href="${url('/privacidade/')}">Privacidade</a></p>
    </form>
    <p class="aviso-stock__feito" data-aviso-feito role="status" tabindex="-1" hidden></p>`;
  return p._esgotado
    ? `<section class="aviso-stock" aria-labelledby="t-aviso" data-esgotado><h2 id="t-aviso">Esgotado: avisa-me quando voltar</h2><p>Deixa o teu email e mandamos-te uma mensagem quando voltar a haver.</p>${form}</section>`
    : `<details class="aviso-stock"><summary>${pergunta} <span>Avisamos-te quando voltar.</span></summary>${form}</details>`;
}

/* O prazo da peça (o pedido da loja de 20 nov 2026: os personalizados, o tempo de produção; os outros, o de
   preparação): com a personalização numa caixa que se marca, os dois; com um campo de texto, ou numa secção
   personalizada (uma peça estampada é feita por encomenda), o de produção; sem nada disso, o de preparação. */
function prazoDaPeca(loja, p) {
  const ps = p._pers;
  const fazer = `Fazemos por encomenda em ${esc(loja.producao)}.`;
  const preparar = typeof loja.preparacao === 'string' && loja.preparacao.trim() ? esc(loja.preparacao.trim()) : null;
  if (!preparar) return fazer;
  if (ps?.opcional) return `Sem personalização, sai em ${preparar}; com personalização, em ${esc(loja.producao)}.`;
  if (feitaPorEncomenda(p)) return fazer;
  return `Sai em ${preparar}.`;
}

export function produto({ loja, catalogo, produtos, seccoes, api }, p) {
  const principal = p._categorias[0];
  const s = seccoes.find((x) => x.id === R.seccaoDaChave(principal));
  const categoria = s.itens.find((x) => x.chave === principal);
  const fotos = p.fotos;
  const grupos = [];
  if (p._tamanhos.length) grupos.push(grupo('Tamanho', p._tamanhos.map((t) => ({ nome: t, suplemento: p._supTam[t] || 0, esgotado: p._tamanhosEsgotados.includes(t) })), { campo: 'tamanho' }));
  if (p._cores.length) {
    // marcada à partida: a primeira cor que não está esgotada
    const primeira = Math.max(0, p._cores.findIndex((c) => !c.esgotado));
    grupos.push(grupo('Cor', p._cores.map((c, i) => ({ nome: c.nome, marcada: i === primeira, esgotado: c.esgotado === true, amostra: catalogo.cores?.[c.nome], foto: c.foto ? fotos.indexOf(c.foto) : null })), { campo: 'cor', amostras: true }));
  }
  for (const o of p._opcoes) {
    // marcada por omissão: a primeira sem acréscimo (e sem estar esgotada) — o preço anunciado é o que se paga
    const base = Math.max(0, o.valores.findIndex((v) => !v.suplemento && !v.esgotado));
    grupos.push(grupo(o.nome, o.valores.map((v, i) => ({ ...v, marcada: i === base }))));
  }
  const ps = p._pers;
  // o rótulo já diz «(opcional)»: uma pista que começa por «Opcional.» dizia-o duas vezes
  const opcionalNoRotulo = ps && !ps.obrigatoria && !ps.opcional;
  const pista = ps?.pista && opcionalNoRotulo ? ps.pista.replace(/^\s*opcional[.:,]?\s*/i, '') : ps?.pista;
  /* A loja deixou de mandar a pré-visualização das peças do site (o Samuel, 21 nov 2026: só nos pedidos à medida,
     combinados por mensagem): a pista lembra que a peça fica como se escreve, a não ser que a do produto já fale
     disso («Exactamente como queres que fique», «Diz-nos a ideia; mandamos a pré-visualização»). */
  const lembrete = /exa(c)?tamente|pr[ée]-?visualiza/i.test(pista || '') ? '' : 'Fica exatamente como escreves.';
  const campoTexto = ps ? `<div class="campo" data-campo-texto${ps.opcional ? ' hidden' : ''}>
      <label for="texto">${esc(ps.rotulo)}${ps.obrigatoria || ps.opcional ? '' : ' <span class="campo__pista">(opcional)</span>'}</label>
      <p class="campo__pista" id="texto-pista">${pista ? `${esc(pista.replace(/\.$/, ''))}.${lembrete ? ' ' : ''}` : ''}${lembrete}</p>
      <input id="texto" name="texto" type="text" autocomplete="off" spellcheck="false" data-max="${ps.max}"${ps.obrigatoria ? ' data-obrigatorio' : ''} aria-describedby="texto-pista texto-contador texto-erro">
      <p class="campo__contador" id="texto-contador" aria-live="polite" data-contador></p>
      <p class="campo__erro" id="texto-erro" data-erro></p>
    </div>` : '';
  const personalizar = ps?.opcional ? `<label class="marcar"><input type="checkbox" name="personalizar" data-personalizar data-suplemento="${ps.suplemento || 0}"><span>${esc(ps.opcional)}${ps.suplemento ? ` <small>+${euro(ps.suplemento)}</small>` : ''}</span></label>` : '';
  const dados = { slug: p.slug, nome: p.nome, preco: p.preco };
  // o que está esgotado (para o aviso de stock): o produto inteiro, ou os tamanhos, as cores e os valores esgotados
  const esgotados = [
    ...p._tamanhosEsgotados.map((t) => ({ grupo: 'Tamanho', valor: t })),
    ...p._cores.filter((c) => c.esgotado).map((c) => ({ grupo: 'Cor', valor: c.nome })),
    ...p._opcoes.flatMap((g) => g.valores.filter((v) => v.esgotado).map((v) => ({ grupo: g.nome, valor: v.nome }))),
  ];
  const comAviso = Boolean(api) && p.preco != null && (p._esgotado || esgotados.length > 0);
  const comprar = p.preco == null
    ? `<p class="aviso">O preço desta peça ainda não está no site. Diz-nos o que queres por mensagem e respondemos com o valor.</p>
    <a class="botao botao--cheio" href="${mensagemInstagram(loja)}">${icone('mensagem', 'icone icone--pequeno')} Pedir por mensagem</a>`
    : p._esgotado
      ? (comAviso ? '' : `<p class="aviso" data-esgotado>Esta peça está esgotada. Manda-nos mensagem para saberes quando volta.</p>
    <a class="botao botao--linha" href="${mensagemInstagram(loja)}">${icone('mensagem', 'icone icone--pequeno')} Perguntar por mensagem</a>`)
      : `<div class="ficha__comprar">
      <div class="quantidade" data-quantidade><button type="button" data-menos aria-label="Diminuir a quantidade">−</button><input type="text" inputmode="numeric" pattern="[0-9]*" value="1" aria-label="Quantidade" name="quantidade"><button type="button" data-mais aria-label="Aumentar a quantidade">+</button></div>
      <button class="botao botao--cheio" type="submit">Adicionar ao carrinho</button>
    </div>
    <p class="ficha__total" aria-live="polite">Total: <strong data-total>${euro(R.precoMinimo(p, p._tamanhos))}</strong></p>`;
  const mao = zonaMao(loja);
  // «Também podes gostar»: primeiro os da mesma categoria, depois os que partilham outra
  const outrosQue = (f) => produtos.filter((o) => o.slug !== p.slug && f(o));
  const outros = [...new Set([...outrosQue((o) => o._categorias.includes(principal)), ...outrosQue((o) => o._categorias.some((k) => p._categorias.includes(k)))])].slice(0, 4);
  const migalhas = [['Início', '/'], [s.nome, s.href], [categoria.nome, categoria.href]];
  const jsonld = [ldMigalhas([...migalhas, [p.nome, `/produtos/${p.slug}/`]])];
  if (p.preco != null) jsonld.push(ldProduto({ loja, catalogo }, p));
  return {
    caminho: `/produtos/${p.slug}/`,
    titulo: p.nome,
    descricao: descricaoDoProduto(p),
    imagem: fotos[0],
    jsonld,
    fontes: [...fontesDe([p], true), ...fontesDe(outros)],
    corpo: `<div class="contentor">
  <nav aria-label="Estás aqui"><ol class="migalhas">${migalhas.map(([n, c]) => `<li><a href="${url(c)}">${esc(n)}</a></li>`).join('')}</ol></nav>
  <div class="ficha">
    <div class="galeria" data-galeria>
      <div class="galeria__principal">${fotos.map((f, i) => `<div${i ? ' hidden' : ''} data-foto-grande="${i}">${foto(f, { sizes: '(min-width: 1024px) 600px, calc(100vw - 40px)', prioridade: i === 0 })}</div>`).join('')}</div>
      ${fotos.length > 1 ? `<div class="fila galeria__miniaturas" role="group" aria-label="Fotografias">${fotos.map((f, i) => `<button type="button" data-miniatura="${i}" aria-pressed="${i ? 'false' : 'true'}" aria-label="Fotografia ${i + 1} de ${fotos.length}">${foto(f, { sizes: '72px', alt: '' })}</button>`).join('')}</div>` : ''}
    </div>
    <div class="ficha__info">
      <p class="ficha__etiqueta">${esc(categoria.nome)}${ps ? ' · Personalizável' : ''}</p>
      <h1>${esc(p.nome)}</h1>
      ${p.preco == null ? '<p class="ficha__preco ficha__preco--falta">Preço por confirmar</p>' : `<p class="ficha__preco">${euro(R.precoMinimo(p, p._tamanhos))}${p._esgotado ? ' <span class="ficha__esgotado">Esgotado</span>' : ''}</p>`}
      <p class="ficha__resumo">${esc(p.resumo)}</p>
      <form class="ficha__form" data-ficha novalidate>
        <script type="application/json" data-produto>${JSON.stringify(dados)}</script>
        ${p.detalhes.length ? `<ul class="ficha__detalhes">${p.detalhes.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        ${p.preco == null || p._esgotado ? semPreco(p) : grupos.join('\n        ') + personalizar + campoTexto}
        ${comprar}
      </form>
      ${comAviso ? avisoDeStock(p, esgotados) : ''}
      <ul class="ficha__linhas">
        <li>${icone('relogio', 'icone icone--pequeno')}<span>${prazoDaPeca(loja, p)} Depois, até ${esc(loja.entrega.prazoContinente)} por CTT no continente${mao ? `, ou levantamento em mão em ${esc(loja.entrega.concelho)}, sem portes` : ''}.</span></li>
        <li>${icone('troca', 'icone icone--pequeno')}<span>${ps?.obrigatoria ? 'Por ser personalizada, esta peça não tem troca nem devolução por desistência.' : ps ? 'Sem personalização, tens 14 dias para desistir; com personalização, não há troca nem devolução por desistência.' : 'Tens 14 dias para desistir depois de receberes.'} <a href="${url('/trocas-e-devolucoes/')}">Trocas e devoluções</a></span></li>
      </ul>
    </div>
  </div>
</div>
${outros.length ? `<section class="seccao" aria-labelledby="t-mais"><div class="contentor seccao__topo"><h2 id="t-mais">Também podes gostar</h2></div><ul class="contentor grelha">${outros.map((o) => `<li>${cartao(o)}</li>`).join('')}</ul></section>` : ''}`,
  };
}

// ── Carrinho, finalizar e obrigado ───────────────────────────────────────────
/* Os meios de pagamento do modo «online», como etiquetas: «MB WAY», «Multibanco», «Cartão»… */
const meiosOnline = () => R.MEIOS_ONLINE.map((m) => `<span>${esc(m[0].toUpperCase() + m.slice(1))}</span>`).join('');

const gratisDe = (loja) => (typeof loja.entrega.gratisAPartirDe === 'number' ? loja.entrega.gratisAPartirDe : '');

export function carrinho({ loja, seccoes }) {
  const mao = zonaMao(loja);
  return {
    caminho: '/carrinho/',
    titulo: 'Carrinho',
    indexar: false,
    descricao: 'O teu carrinho na Franja Kids.',
    corpo: `<section class="contentor pagina" aria-labelledby="t-carrinho"><h1 id="t-carrinho">Carrinho</h1></section>
<div class="contentor carrinho" data-carrinho data-portes-gratis="${gratisDe(loja)}" data-loja="${url(destinoDaLoja(seccoes).href)}" data-loja-texto="${esc(destinoDaLoja(seccoes).ver)}">
  <div class="painel" data-itens><p class="vazio">A carregar o carrinho…</p></div>
  <aside class="resumo" aria-labelledby="t-resumo" data-resumo hidden>
    <h2 id="t-resumo">Resumo</h2>
    <dl><dt>Artigos</dt><dd data-subtotal></dd><dt>Portes</dt><dd data-portes>No passo seguinte</dd></dl>
    <div class="progresso" data-progresso></div>
    <a class="botao botao--cheio" href="${url('/finalizar/')}">Finalizar a encomenda</a>
    <p class="pagamentos">${online(loja) ? meiosOnline() : ''}${mao ? `<span>${esc(mao.nome)}</span>` : ''}</p>
  </aside>
</div>`,
  };
}

/* AS ENTREGAS NO FINALIZAR (o pedido da loja de 20 nov 2026): as cinco zonas, sempre à vista. Uma zona sem portes é
   sob consulta: escolhê-la troca o envio pela ligação ao Instagram (o Worker também a recusa). A União Europeia
   pede o país (de R.PAISES_UE); o levantamento em mão não pede morada, e o telemóvel serve para o combinar pelo
   WhatsApp. */
export function finalizar({ loja, termosUrl, api }) {
  const pagaAgora = online(loja);
  const ent = loja.entrega;
  const gratis = typeof ent.gratisAPartirDe === 'number' ? ent.gratisAPartirDe : null;
  const nota = (z) => (R.zonaSobConsulta(z) ? 'Portes e prazo sob consulta, pelo Instagram'
    : z.id === 'mao' ? 'Quando a encomenda estiver pronta, combinamos o levantamento pelo WhatsApp'
      : z.id === 'continente' ? `Correio registado CTT; chega em até ${ent.prazoContinente} depois de enviada${gratis != null ? `. Grátis a partir de ${euroRedondo(gratis)}` : ''}`
        : z.id === 'ilhas' ? 'Correio registado CTT; o prazo varia consoante a ilha'
          : 'Correio registado; o prazo varia consoante o destino');
  const preco = (z) => (R.zonaSobConsulta(z) ? 'Sob consulta' : z.portes === 0 ? 'Grátis' : euro(z.portes));
  const envio = ent.zonas.map((z, i) => `<label><input type="radio" name="envio" value="${z.id}" data-preco="${R.zonaSobConsulta(z) ? '' : z.portes}"${R.zonaSobConsulta(z) ? ' data-sob-consulta' : ''}${i === 0 ? ' checked' : ''}><span>${esc(z.nome)}<small>${esc(nota(z))}</small></span><b data-preco-zona="${z.id}">${preco(z)}</b></label>`).join('\n          ');
  const campo = (id, rotulo, tipo, auto, extra = '') => `<div class="campo"><label for="${id}">${rotulo}</label><input id="${id}" name="${id}" type="${tipo}" autocomplete="${auto}" aria-describedby="${id}-erro"${extra}><p class="campo__erro" id="${id}-erro" data-erro></p></div>`;
  return {
    caminho: '/finalizar/',
    titulo: 'Finalizar a encomenda',
    indexar: false,
    descricao: 'Os teus dados, a entrega e o pagamento.',
    corpo: `<section class="contentor pagina" aria-labelledby="t-finalizar"><h1 id="t-finalizar">Finalizar a encomenda</h1></section>
<form class="contentor finalizar" data-finalizar data-portes-gratis="${gratisDe(loja)}" data-modo="${pagaAgora ? 'online' : 'encomenda'}" novalidate>
  <div>
    <p class="aviso" data-aviso-pagamento role="status" hidden></p>
    <div class="resumo-erros" data-resumo-erros tabindex="-1" hidden><h2>Falta corrigir:</h2><ul></ul></div>
    <section class="bloco" aria-labelledby="t-contacto">
      <h2 id="t-contacto">Contacto</h2>
      <div class="duas">
        ${campo('nome', 'Nome', 'text', 'name', ' required')}
        ${campo('email', 'Email', 'email', 'email', ' required')}
        <div class="campo"><label for="telemovel">Telemóvel</label><p class="campo__pista" id="telemovel-pista" data-pista-mao hidden>Para combinarmos o levantamento pelo WhatsApp.</p><input id="telemovel" name="telemovel" type="tel" autocomplete="tel" aria-describedby="telemovel-erro" required><p class="campo__erro" id="telemovel-erro" data-erro></p></div>
        ${campo('nif', 'NIF <span class="campo__pista">(opcional, para a fatura)</span>', 'text', 'off', ' inputmode="numeric"')}
      </div>
    </section>
    <section class="bloco" aria-labelledby="t-entrega">
      <h2 id="t-entrega">Entrega</h2>
      <fieldset class="envio">
        <legend class="so-leitor">Como queres receber</legend>
          ${envio}
      </fieldset>
      <div class="aviso aviso--consulta" data-sob-consulta-aviso hidden>
        <p>${coracao('Para esta entrega, os portes e o prazo são sob consulta. Fala connosco no Instagram e dizemos-te quanto custa e quanto tempo demora. ♡')}</p>
        <a class="botao botao--cheio" href="${mensagemInstagram(loja)}">${coracao('Fala connosco no Instagram ♡')}</a>
      </div>
      <div class="duas" data-morada>
        ${campo('morada', 'Morada', 'text', 'street-address', ' required')}
        ${campo('codigo-postal', 'Código postal', 'text', 'postal-code', ' required')}
        ${campo('localidade', 'Localidade', 'text', 'address-level2', ' required')}
        <div class="campo" data-pais hidden><label for="pais">País</label><select id="pais" name="pais" autocomplete="country-name" aria-describedby="pais-erro"><option value="">Escolhe o país</option>${R.PAISES_UE.map((p) => `<option>${esc(p)}</option>`).join('')}</select><p class="campo__erro" id="pais-erro" data-erro></p></div>
      </div>
    </section>
    <section class="bloco" aria-labelledby="t-oferta">
      <h2 id="t-oferta">É para oferta?</h2>
      <label class="marcar"><input type="checkbox" name="oferta" data-oferta><span>Sim, é para oferecer<small>Não pomos preços na encomenda.</small></span></label>
      <div class="campo" data-mensagem hidden><label for="mensagem">Mensagem para o cartão <span class="campo__pista">(opcional)</span></label><textarea id="mensagem" name="mensagem" maxlength="240"></textarea></div>
      <div class="campo"><label for="notas">Notas para nós <span class="campo__pista">(opcional)</span></label><textarea id="notas" name="notas" maxlength="600" placeholder="Por exemplo: preciso para dia 20 de dezembro"></textarea></div>
    </section>
  </div>
  <aside class="resumo" aria-labelledby="t-resumo">
    <h2 id="t-resumo">A tua encomenda</h2>
    <div data-itens-resumo></div>
    ${api ? `<div class="cupao" data-cupao>
      <details data-cupao-abrir><summary>Tenho um cupão</summary>
        <div class="cupao__campo"><label class="so-leitor" for="cupao">Código do cupão</label><input id="cupao" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="30" placeholder="Código do cupão" aria-describedby="cupao-erro"><button class="botao botao--linha" type="button" data-cupao-aplicar>Aplicar</button></div>
        <p class="campo__erro" id="cupao-erro" data-cupao-erro></p>
      </details>
      <p class="cupao__aplicado" data-cupao-aplicado role="status" hidden></p>
    </div>` : ''}
    <dl><dt>Artigos</dt><dd data-subtotal></dd><dt data-desconto-rotulo hidden>Cupão</dt><dd data-desconto hidden></dd><dt>Portes</dt><dd data-portes></dd><dt class="total">Total</dt><dd class="total" data-total></dd></dl>
    <p class="aviso" data-aviso-personalizado hidden>Os artigos personalizados não têm troca nem devolução por desistência. Confirma o nome, a frase, o tamanho e a cor: é assim que os vamos fazer.</p>
    <div class="resumo__enviar" data-enviar-bloco>
      <label class="marcar"><input type="checkbox" id="termos" name="termos" required aria-describedby="termos-erro"><span>Li e aceito os <a href="${url(termosUrl)}">termos e condições</a></span></label>
      <p class="campo__erro" id="termos-erro" data-erro></p>
      <p class="campo__erro" data-erro-envio role="alert"></p>
      <button class="botao botao--cheio" type="submit" data-enviar>${pagaAgora ? esc(BOTAO_ENCOMENDA) : 'Enviar encomenda'}</button>
    </div>
    <p class="aviso" data-sob-consulta-resumo hidden>Esta entrega é sob consulta: a encomenda não se faz aqui. <a href="${mensagemInstagram(loja)}">Fala connosco no Instagram</a>.</p>
    <p class="pagamentos">${pagaAgora ? `${meiosOnline()}<span>Pagamento seguro pela Stripe</span>` : '<span>Combinamos contigo o pagamento depois de confirmarmos a encomenda</span>'}</p>
  </aside>
</form>${api ? '' : `
<dialog class="caixa" id="pre-visualizacao" aria-labelledby="t-pre">
  <h2 id="t-pre">Quase a abrir</h2>
  <p>Esta é a pré-visualização da loja: as encomendas pelo site ligam-se quando a conta da Franja Kids estiver pronta.</p>
  <p>Até lá, as encomendas fazem-se por <a href="${mensagemInstagram(loja)}">mensagem no Instagram</a>.</p>
  <button class="botao botao--cheio" type="button" data-fechar autofocus>Percebi</button>
</dialog>`}`,
  };
}

export function obrigado({ loja }) {
  return {
    caminho: '/obrigado/',
    titulo: 'Obrigado',
    indexar: false,
    descricao: 'A tua encomenda na Franja Kids.',
    corpo: `<section class="contentor pagina obrigado" aria-labelledby="t-obrigado" data-obrigado>
  <h1 id="t-obrigado" tabindex="-1">Obrigado!</h1>
  <div data-obrigado-corpo><p>A carregar a tua encomenda…</p></div>
  <div class="heroi__botoes"><a class="botao botao--linha" href="${url('/')}">Voltar à loja</a><a class="ligacao" href="${mensagemInstagram(loja)}">Falar connosco ${icone('seta', 'icone icone--pequeno')}</a></div>
</section>`,
  };
}

// ── Procurar ───────────────────────────────────────────────────────────────

export function procurar({ produtos, cat }) {
  // procura-se pelo nome, pela frase curta, e pelos nomes das categorias e das secções onde o produto está
  const nomesDe = (p) => [...new Set(p._categorias.flatMap((k) => [cat.nomes[k], cat.nomes[R.seccaoDaChave(k)]]).filter(Boolean))];
  return {
    caminho: '/procurar/',
    titulo: 'Procurar',
    indexar: false,
    descricao: 'Procura bodies, t-shirts, sweatshirts e presentes na Franja Kids.',
    corpo: `<section class="contentor pagina" aria-labelledby="t-procurar">
  <h1 id="t-procurar">Procurar</h1>
  <form class="procura" role="search" data-procura action="${url('/procurar/')}">${icone('procurar')}<label class="so-leitor" for="q">Procurar na loja</label><input id="q" name="q" type="search" placeholder="Padrinhos, avós, babygrow…" autocomplete="off"></form>
  <p class="contagem" data-contagem aria-live="polite"></p>
  <h2 class="so-leitor">Produtos</h2>
  <ul class="grelha" data-grelha>
    ${produtos.map((p, i) => `<li data-texto="${esc([p.nome, p.resumo, ...nomesDe(p)].join(' '))}">${cartao(p, { prioridade: i === 0, lazy: i >= 4 })}</li>`).join('\n    ')}
  </ul>
</section>`,
  };
}

// ── Textos (ajuda, sobre, legais) ──────────────────────────────────────────

/** Uma página de texto. `indexar: false` para as que não interessam a quem procura (as legais e as de políticas). */
export function texto(caminho, titulo, frase, html, descricao, { indexar = true } = {}) {
  return {
    caminho, titulo, descricao: resumir(descricao || frase.replace(/\s*♡/g, '')), indexar,
    corpo: `<section class="contentor pagina" aria-labelledby="t-pagina"><h1 id="t-pagina">${esc(titulo)}</h1>${frase ? `<p>${coracao(esc(frase))}</p>` : ''}</section>
<div class="contentor texto">${html}</div>`,
  };
}

export function sobre({ loja, seccoes }) {
  const mao = zonaMao(loja);
  const destino = destinoDaLoja(seccoes);
  return {
    caminho: '/sobre/',
    titulo: 'Sobre nós',
    descricao: 'A Franja Kids nasceu a 10 de setembro de 2025: roupa e presentes personalizados para bebés, crianças e família, feitos com amor.',
    imagem: 'donas',
    fontes: [R.FICHEIROS.fotos, R.ficheiroDaFoto('donas')],
    corpo: `<section class="contentor historia" aria-labelledby="t-sobre">
  ${foto('donas', { sizes: '(min-width: 1024px) 460px, calc(100vw - 40px)', classe: 'historia__foto', prioridade: true })}
  <div class="historia__texto">
    <h1 id="t-sobre" class="pagina__titulo">Um sonho, muitas mãos e muito amor.</h1>
    <p>A Franja Kids nasceu a 10 de setembro de 2025, com roupa de bebé escolhida com carinho. Foram vocês que nos levaram para os personalizados: hoje fazemos bodies, t-shirts, camisolas e presentes com o nome e a história de cada família.</p>
    <p>Cada peça é preparada por nós, uma a uma.</p>
    <ul class="factos">
      <li><span class="passos__icone">${icone('coracao')}</span>Mais de 7 mil pessoas acompanham-nos no Instagram</li>
      ${mao ? `<li><span class="passos__icone">${icone('local')}</span>${esc(mao.nome)}</li>` : ''}
      <li><span class="passos__icone">${icone('carrinha')}</span>Enviamos para Portugal e para o estrangeiro</li>
    </ul>
    <div class="heroi__botoes"><a class="botao botao--cheio" href="${url(destino.href)}">${destino.ver}</a><a class="ligacao" href="https://www.instagram.com/${loja.instagram}/">@${loja.instagram} ${icone('seta', 'icone icone--pequeno')}</a></div>
  </div>
</section>`,
  };
}

export function naoEncontrada(seccoes) {
  const destino = destinoDaLoja(seccoes);
  return {
    caminho: '/404.html',
    titulo: 'Página não encontrada',
    indexar: false,
    descricao: 'Esta página não existe.',
    corpo: `<section class="contentor pagina" aria-labelledby="t-404"><h1 id="t-404">Esta página não existe</h1><p>Pode ter mudado de sítio. Experimenta a loja ou procura o que querias.</p>
<div class="heroi__botoes"><a class="botao botao--cheio" href="${url(destino.href)}">${destino.ver}</a><a class="ligacao" href="${url('/procurar/')}">Procurar ${icone('seta', 'icone icone--pequeno')}</a></div></section>`,
  };
}
