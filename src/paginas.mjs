// As páginas do site. Cada função devolve { caminho, titulo, descricao, corpo, imagem?, jsonld? }.
import { url, absoluto, esc, euro, foto, icone, CORES } from './util.mjs';

// ── Produtos ────────────────────────────────────────────────────────────────

export function sobe(p) {
  // há alguma escolha que faça o preço subir? então o cartão diz «desde»
  return (p.opcoes || []).some((o) => o.valores.some(([, s]) => s > 0)) || (p.personalizacao?.suplemento > 0);
}

export function precoHtml(p, classe = 'cartao__preco') {
  if (p.preco == null) return `<p class="${classe} ${classe}--falta">Preço por confirmar</p>`;
  return `<p class="${classe}">${sobe(p) ? 'desde ' : ''}${euro(p.preco)}</p>`;
}

export function cartao(p, { sizes = '(min-width: 1024px) 270px, (min-width: 768px) 30vw, 45vw', selo = p._linha !== 'personalizados' } = {}) {
  return `<a class="cartao" href="${url(`/produtos/${p.slug}/`)}">`
    + `<div class="cartao__foto">${foto(`p-${p.slug}-1`, { sizes, alt: '' })}${selo && p.personalizacao ? '<span class="cartao__selo">Personalizável</span>' : ''}</div>`
    + `<h3>${esc(p.nome)}</h3>${precoHtml(p)}</a>`;
}

// ── Início ──────────────────────────────────────────────────────────────────

export function inicio({ loja, catalogo, produtos }) {
  const ocasioes = catalogo.ocasioes.filter((o) => o.foto);
  const linhas = [
    ['personalizados', 'cat-bodies'],
    ['bebe', 'cat-conjuntos'],
    ['presentes', 'cat-box'],
  ].map(([id, f]) => [catalogo.linhas.find((l) => l.id === id), f]);
  const destaques = loja.maisPedidos.map((s) => produtos.find((p) => p.slug === s));
  const insta = ['ig-forro-fado', 'ig-sonho', 'ig-mapa', 'vais-ser-avo', 'ig-maior-sonho', 'ig-coracao'];
  const passos = [
    ['Escolhe a peça', 'O tamanho, a cor e a ocasião.', 'saco'],
    ['Diz-nos o nome ou a frase', 'Também mudamos a cor, a letra ou o desenho.', 'lapis'],
    ['Aprovas a pré-visualização', 'Só produzimos depois do teu sim.', 'olho'],
    ['Recebes em casa', `Pronto em ${loja.producao} e enviado por CTT.`, 'carrinha'],
  ];
  return {
    caminho: '/',
    titulo: 'Início',
    descricao: loja.descricao,
    imagem: 'vais-ser-avo',
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'OnlineStore', name: loja.nome, url: absoluto('/'),
      logo: absoluto('/assets/marca/logotipo-640.png'), description: loja.descricao,
      sameAs: [`https://www.instagram.com/${loja.instagram}/`],
    }],
    corpo: `<section class="contentor heroi" aria-labelledby="t-heroi">
  <div class="heroi__texto">
    <h1 id="t-heroi">Tu imaginas, nós personalizamos.</h1>
    <p>Roupa e presentes com nome, feitos por encomenda para bebés, crianças e família.</p>
    <div class="heroi__botoes">
      <a class="botao botao--cheio" href="${url('/personalizados/')}">Começar a personalizar</a>
      <a class="ligacao" href="#ocasioes">Ver ocasiões ${icone('seta', 'icone icone--pequeno')}</a>
    </div>
  </div>
  <div class="heroi__imagem">
    ${foto('vais-ser-avo', { sizes: '(min-width: 1024px) 460px, calc(100vw - 64px)', prioridade: true, classe: 'heroi__foto' })}
    <svg class="selo" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs><path id="selo-circulo" d="M60 60m-43 0a43 43 0 1 1 86 0a43 43 0 1 1-86 0"/></defs>
      <circle cx="60" cy="60" r="58"/>
      <text><textPath href="#selo-circulo" textLength="266" lengthAdjust="spacing">FEITO POR ENCOMENDA · COM AMOR ·</textPath></text>
      <path class="selo__coracao" d="M60 72s-11-6.8-11-15.2A6.1 6.1 0 0 1 60 53a6.1 6.1 0 0 1 11 3.8C71 65.2 60 72 60 72z"/>
    </svg>
  </div>
</section>

<section id="ocasioes" class="seccao" aria-labelledby="t-ocasioes">
  <div class="contentor seccao__topo"><h2 id="t-ocasioes">Para quem é?</h2></div>
  <ul class="contentor ocasioes">
    ${ocasioes.map((o) => `<li><a href="${url(`/personalizados/?ocasiao=${o.id}`)}"><span class="ocasioes__nome">${esc(o.nome)}</span>${foto(o.foto, { sizes: '116px', alt: '', classe: 'ocasioes__foto' })}${icone('seta', 'icone icone--pequeno ocasioes__seta')}</a></li>`).join('\n    ')}
  </ul>
</section>

<section class="seccao" aria-labelledby="t-loja">
  <div class="contentor seccao__topo"><h2 id="t-loja">O que fazemos</h2></div>
  <ul class="contentor linhas">
    ${linhas.map(([l, f]) => `<li class="linhas__cartao">${foto(f, { sizes: '(min-width: 1024px) 380px, calc(100vw - 40px)', alt: '', classe: 'linhas__foto' })}<h3><a href="${url(`/${l.id}/`)}">${esc(l.nome)}</a></h3><ul class="linhas__subs">${l.categorias.map((c) => `<li><a href="${url(`/${l.id}/?categoria=${c}`)}">${esc(catalogo.categorias[c])}</a></li>`).join('')}</ul></li>`).join('\n    ')}
  </ul>
</section>

<section class="seccao" aria-labelledby="t-destaques">
  <div class="contentor seccao__topo">
    <h2 id="t-destaques">Mais pedidos</h2>
    <a class="ligacao" href="${url('/personalizados/')}">Ver tudo ${icone('seta', 'icone icone--pequeno')}</a>
  </div>
  <ul class="fila produtos">
    ${destaques.map((p) => `<li>${cartao(p, { sizes: '(min-width: 1024px) 270px, 66vw', selo: false })}</li>`).join('\n    ')}
  </ul>
</section>

<section id="como-funciona" class="seccao" aria-labelledby="t-como">
  <div class="contentor seccao__topo">
    <h2 id="t-como">Como funciona</h2>
    <a class="ligacao" href="${url('/como-funciona/')}">Saber mais ${icone('seta', 'icone icone--pequeno')}</a>
  </div>
  <ol class="contentor passos">
    ${passos.map(([t, d, i]) => `<li><span class="passos__icone">${icone(i)}</span><h3>${t}</h3><p>${d}</p></li>`).join('\n    ')}
  </ol>
</section>

<section class="seccao" aria-labelledby="t-sobre">
  <div class="contentor sobre">
    ${foto('mercadinho', { sizes: '(min-width: 1024px) 520px, calc(100vw - 64px)', classe: 'sobre__foto' })}
    <div class="sobre__texto">
      <h2 id="t-sobre">Duas amigas, uma ideia</h2>
      <p>A Franja Kids nasceu em setembro de 2025. Começámos pela roupa de bebé e foram vocês que nos levaram para os personalizados: hoje cada peça sai das nossas mãos com um nome e uma história.</p>
      <a class="botao botao--linha" href="${url('/sobre/')}">A nossa história</a>
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

// ── Linhas da loja (Personalizados, Bebé, Presentes) ───────────────────────

export function linha({ catalogo, produtos }, l) {
  const meus = produtos.filter((p) => l.categorias.includes(p.categoria));
  const comOcasiao = l.id === 'personalizados';
  const pastilha = (filtro, valor, texto) => `<button class="pastilha" type="button" data-filtro="${filtro}" data-valor="${valor}" aria-pressed="${valor ? 'false' : 'true'}">${esc(texto)}</button>`;
  return {
    caminho: `/${l.id}/`,
    titulo: l.nome,
    descricao: l.frase,
    imagem: `p-${meus[0].slug}-1`,
    corpo: `<section class="contentor pagina" aria-labelledby="t-linha">
  <h1 id="t-linha">${esc(l.nome)}</h1>
  <p>${esc(l.frase)}</p>
  <div class="filtros" data-filtros>
    <div class="fila filtros__fila" role="group" aria-label="Categoria">
      ${pastilha('categoria', '', 'Tudo')}
      ${l.categorias.map((c) => pastilha('categoria', c, catalogo.categorias[c])).join('\n      ')}
    </div>
    ${comOcasiao ? `<div class="fila filtros__fila" role="group" aria-label="Para quem">
      ${pastilha('ocasiao', '', 'Para todos')}
      ${catalogo.ocasioes.map((o) => pastilha('ocasiao', o.id, o.nome)).join('\n      ')}
    </div>` : ''}
  </div>
  <p class="contagem" data-contagem aria-live="polite">${meus.length} artigos</p>
  <ul class="grelha" data-grelha>
    ${meus.map((p) => `<li data-categoria="${p.categoria}" data-ocasiao="${p.ocasioes.join(' ')}">${cartao(p)}</li>`).join('\n    ')}
  </ul>
  <div class="vazio" data-vazio hidden><p>Ainda não temos peças com esta combinação.</p><button class="botao botao--linha" type="button" data-limpar>Ver tudo</button></div>
</section>`,
  };
}

// ── Ficha do produto ────────────────────────────────────────────────────────

function grupo(nome, valores, { obrigatoria = false, amostras = false, cores = {} } = {}) {
  const id = 'o-' + nome.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  return `<fieldset class="opcao" data-opcao="${esc(nome)}"${obrigatoria ? ' data-obrigatoria' : ''} aria-describedby="${id}-erro">
    <legend>${esc(nome)} <span data-escolhido></span></legend>
    <div class="opcao__valores">${valores.map(([v, s, marcada]) => `<label class="escolha${amostras ? ' amostra' : ''}"><input type="radio" name="${esc(nome)}" value="${esc(v)}" data-suplemento="${s || 0}"${cores[v] != null ? ` data-foto="${cores[v]}"` : ''}${marcada ? ' checked' : ''}><span>${amostras ? `<i style="--amostra:${CORES[v] || '#ddd'}"></i>` : ''}${esc(v)}${s ? ` <small>+${euro(s)}</small>` : ''}</span></label>`).join('')}</div>
    <p class="campo__erro" id="${id}-erro" data-erro></p>
  </fieldset>`;
}

function semPreco(p, tamanhos, manga) {
  const intervalo = (l) => (l.length > 2 ? `${l[0].replace(/ (meses|anos)$/, '')} a ${l[l.length - 1]}` : l.join(' e '));
  const linhas = [];
  if (p.tamanhos) linhas.push(['Tamanhos', intervalo(tamanhos[p.tamanhos])]);
  if (p.cores) linhas.push(['Cores', p.cores.join(', ')]);
  if (p.manga) linhas.push(['Manga', manga.join(' ou ').toLowerCase().replace(/^m/, 'M')]);
  for (const o of p.opcoes || []) linhas.push([o.nome, o.valores.map(([v]) => v).join(' ou ')]);
  if (p.personalizacao) linhas.push(['Personalização', p.personalizacao.rotulo]);
  return `<dl class="ficha__lista">${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

export function produto({ loja, catalogo, produtos, tamanhos, manga }, p) {
  const linhaDe = catalogo.linhas.find((l) => l.categorias.includes(p.categoria));
  const fotos = p.fotos.map((f, i) => ({ nome: `p-${p.slug}-${i + 1}`, cor: f[2] }));
  const fotoDaCor = Object.fromEntries(fotos.map((f, i) => [f.cor, i]).filter(([c]) => c));
  const grupos = [];
  if (p.tamanhos) grupos.push(grupo('Tamanho', tamanhos[p.tamanhos].map((t) => [t, 0]), { obrigatoria: true }));
  if (p.cores) grupos.push(grupo('Cor', p.cores.map((c, i) => [c, 0, i === 0]), { obrigatoria: true, amostras: true, cores: fotoDaCor }));
  if (p.manga) grupos.push(grupo('Manga', manga.map((m, i) => [m, 0, i === 0]), { obrigatoria: true }));
  for (const o of p.opcoes || []) {
    // marcada por omissão: a mais barata (empatadas, a primeira) — o preço anunciado é o que se paga
    const min = Math.min(...o.valores.map(([, s]) => s));
    const iMin = o.valores.findIndex(([, s]) => s === min);
    grupos.push(grupo(o.nome, o.valores.map(([v, s], i) => [v, s, i === iMin]), { obrigatoria: true }));
  }
  const ps = p.personalizacao;
  const campoTexto = ps ? `<div class="campo" data-campo-texto${ps.opcional ? ' hidden' : ''}>
      <label for="texto">${esc(ps.rotulo)}${ps.obrigatoria || ps.opcional ? '' : ' <span class="campo__pista">(opcional)</span>'}</label>
      <p class="campo__pista" id="texto-pista">${esc(ps.pista)}. Antes de produzir, mandamos-te a pré-visualização.</p>
      <input id="texto" name="texto" type="text" autocomplete="off" spellcheck="false" data-max="${ps.max}"${ps.obrigatoria ? ' data-obrigatorio' : ''} aria-describedby="texto-pista texto-contador texto-erro">
      <p class="campo__contador" id="texto-contador" aria-live="polite" data-contador></p>
      <p class="campo__erro" id="texto-erro" data-erro></p>
    </div>` : '';
  const personalizar = ps?.opcional ? `<label class="marcar"><input type="checkbox" name="personalizar" data-personalizar data-suplemento="${ps.suplemento || 0}"><span>${esc(ps.opcional)}${ps.suplemento ? ` <small>+${euro(ps.suplemento)}</small>` : ''}</span></label>` : '';
  const dados = { slug: p.slug, nome: p.nome, preco: p.preco };
  const comprar = p.preco == null
    ? `<p class="aviso">O preço desta peça ainda não está no site. Diz-nos o que queres por mensagem e respondemos com o valor.</p>
    <a class="botao botao--cheio" href="https://ig.me/m/${loja.instagram}">${icone('mensagem', 'icone icone--pequeno')} Pedir por mensagem</a>`
    : `<div class="ficha__comprar">
      <div class="quantidade" data-quantidade><button type="button" data-menos aria-label="Diminuir a quantidade">−</button><input type="text" inputmode="numeric" pattern="[0-9]*" value="1" aria-label="Quantidade" name="quantidade"><button type="button" data-mais aria-label="Aumentar a quantidade">+</button></div>
      <button class="botao botao--cheio" type="submit">Adicionar ao carrinho</button>
    </div>
    <p class="ficha__total" aria-live="polite">Total: <strong data-total>${euro(p.preco)}</strong></p>`;
  const semDevolucao = !!ps && !ps.opcional;
  const jsonld = [{
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: absoluto('/') },
      { '@type': 'ListItem', position: 2, name: linhaDe.nome, item: absoluto(`/${linhaDe.id}/`) },
      { '@type': 'ListItem', position: 3, name: p.nome, item: absoluto(`/produtos/${p.slug}/`) },
    ],
  }];
  if (p.preco != null) {
    jsonld.push({
      '@context': 'https://schema.org', '@type': 'Product', name: p.nome, description: p.resumo,
      image: fotos.map((f) => absoluto(`/assets/fotos/${f.nome}-720.jpg`)), brand: { '@type': 'Brand', name: loja.nome },
      offers: { '@type': 'Offer', price: p.preco.toFixed(2), priceCurrency: 'EUR', availability: 'https://schema.org/MadeToOrder', url: absoluto(`/produtos/${p.slug}/`) },
    });
  }
  return {
    caminho: `/produtos/${p.slug}/`,
    titulo: p.nome,
    descricao: p.resumo,
    imagem: fotos[0].nome,
    jsonld,
    corpo: `<div class="contentor">
  <nav aria-label="Estás aqui"><ol class="migalhas"><li><a href="${url('/')}">Início</a></li><li><a href="${url(`/${linhaDe.id}/`)}">${esc(linhaDe.nome)}</a></li><li><a href="${url(`/${linhaDe.id}/?categoria=${p.categoria}`)}">${esc(catalogo.categorias[p.categoria])}</a></li></ol></nav>
  <div class="ficha">
    <div class="galeria" data-galeria>
      <div class="galeria__principal">${fotos.map((f, i) => `<div${i ? ' hidden' : ''} data-foto-grande="${i}">${foto(f.nome, { sizes: '(min-width: 1024px) 600px, calc(100vw - 40px)', prioridade: i === 0 })}</div>`).join('')}</div>
      ${fotos.length > 1 ? `<div class="fila galeria__miniaturas" role="group" aria-label="Fotografias">${fotos.map((f, i) => `<button type="button" data-miniatura="${i}" aria-pressed="${i ? 'false' : 'true'}" aria-label="Fotografia ${i + 1} de ${fotos.length}">${foto(f.nome, { sizes: '72px', alt: '' })}</button>`).join('')}</div>` : ''}
    </div>
    <div class="ficha__info">
      <p class="ficha__etiqueta">${esc(catalogo.categorias[p.categoria])}${ps ? ' · Personalizável' : ''}</p>
      <h1>${esc(p.nome)}</h1>
      ${p.preco == null ? '<p class="ficha__preco ficha__preco--falta">Preço por confirmar</p>' : `<p class="ficha__preco">${euro(p.preco)}</p>`}
      <p class="ficha__resumo">${esc(p.resumo)}</p>
      <form class="ficha__form" data-ficha novalidate>
        <script type="application/json" data-produto>${JSON.stringify(dados)}</script>
        ${p.detalhes ? `<ul class="ficha__detalhes">${p.detalhes.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        ${p.preco == null ? semPreco(p, tamanhos, manga) : grupos.join('\n        ') + personalizar + campoTexto}
        ${comprar}
        <ul class="ficha__linhas">
          <li>${icone('relogio', 'icone icone--pequeno')}<span>Feito por encomenda em ${loja.producao}. Depois, ${loja.entregaContinente} por CTT no continente, ou entrega em mão em ${loja.entregaEmMao}.</span></li>
          <li>${icone('troca', 'icone icone--pequeno')}<span>${semDevolucao ? 'Por ser personalizada, esta peça não tem troca nem devolução por desistência.' : ps ? 'Sem nome, tens 14 dias para desistir; com nome, por ser personalizada, não há troca nem devolução por desistência.' : 'Tens 14 dias para desistir depois de receberes.'} <a href="${url('/trocas-e-devolucoes/')}">Trocas e devoluções</a></span></li>
        </ul>
      </form>
    </div>
  </div>
</div>
${(() => {
  const outros = produtos.filter((o) => o.slug !== p.slug && (o.categoria === p.categoria || o.ocasioes.some((x) => p.ocasioes.includes(x)))).slice(0, 4);
  return outros.length ? `<section class="seccao" aria-labelledby="t-mais"><div class="contentor seccao__topo"><h2 id="t-mais">Também podes gostar</h2></div><ul class="contentor grelha">${outros.map((o) => `<li>${cartao(o)}</li>`).join('')}</ul></section>` : '';
})()}`,
  };
}

// ── Carrinho e finalizar ────────────────────────────────────────────────────

export function carrinho({ loja }) {
  return {
    caminho: '/carrinho/',
    titulo: 'Carrinho',
    descricao: 'O teu carrinho na Franja Kids.',
    corpo: `<section class="contentor pagina" aria-labelledby="t-carrinho"><h1 id="t-carrinho">Carrinho</h1></section>
<div class="contentor carrinho" data-carrinho data-portes-gratis="${loja.portesGratisDesde}">
  <div class="painel" data-itens><p class="vazio">A carregar o carrinho…</p></div>
  <aside class="resumo" aria-labelledby="t-resumo" data-resumo hidden>
    <h2 id="t-resumo">Resumo</h2>
    <dl><dt>Artigos</dt><dd data-subtotal></dd><dt>Portes</dt><dd data-portes>No passo seguinte</dd></dl>
    <div class="progresso" data-progresso></div>
    <a class="botao botao--cheio" href="${url('/finalizar/')}">Finalizar a encomenda</a>
    <p class="pagamentos"><span>MB WAY</span><span>Cartão</span><span>Entrega em mão em ${loja.entregaEmMao}</span></p>
  </aside>
</div>`,
  };
}

export function finalizar({ loja, termosUrl }) {
  const envio = loja.envios.map((e, i) => `<label><input type="radio" name="envio" value="${e.id}" data-preco="${e.preco ?? ''}"${i === 0 ? ' checked' : ''}><span>${esc(e.nome)}<small>${esc(e.nota)}</small></span><b>${e.preco === 0 ? 'Grátis' : e.preco == null ? 'A confirmar' : euro(e.preco)}</b></label>`).join('\n          ');
  const campo = (id, rotulo, tipo, auto, extra = '') => `<div class="campo"><label for="${id}">${rotulo}</label><input id="${id}" name="${id}" type="${tipo}" autocomplete="${auto}" aria-describedby="${id}-erro"${extra}><p class="campo__erro" id="${id}-erro" data-erro></p></div>`;
  return {
    caminho: '/finalizar/',
    titulo: 'Finalizar a encomenda',
    descricao: 'Os teus dados, a entrega e o pagamento.',
    semRodape: false,
    corpo: `<section class="contentor pagina" aria-labelledby="t-finalizar"><h1 id="t-finalizar">Finalizar a encomenda</h1></section>
<form class="contentor finalizar" data-finalizar data-portes-gratis="${loja.portesGratisDesde}" novalidate>
  <div>
    <div class="resumo-erros" data-resumo-erros tabindex="-1" hidden><h2>Falta corrigir:</h2><ul></ul></div>
    <section class="bloco" aria-labelledby="t-contacto">
      <h2 id="t-contacto">Contacto</h2>
      <div class="duas">
        ${campo('email', 'Email', 'email', 'email', ' required')}
        ${campo('telemovel', 'Telemóvel <span class="campo__pista">(para a transportadora)</span>', 'tel', 'tel', ' required')}
      </div>
    </section>
    <section class="bloco" aria-labelledby="t-entrega">
      <h2 id="t-entrega">Entrega</h2>
      <fieldset class="envio">
        <legend class="so-leitor">Como queres receber</legend>
          ${envio}
      </fieldset>
      <div class="duas" data-morada>
        ${campo('nome', 'Nome', 'text', 'name', ' required')}
        ${campo('morada', 'Morada', 'text', 'street-address', ' required')}
        ${campo('codigo-postal', 'Código postal', 'text', 'postal-code', ' required inputmode="numeric"')}
        ${campo('localidade', 'Localidade', 'text', 'address-level2', ' required')}
      </div>
    </section>
    <section class="bloco" aria-labelledby="t-oferta">
      <h2 id="t-oferta">É para oferta?</h2>
      <label class="marcar"><input type="checkbox" name="oferta" data-oferta><span>Sim, é para oferecer<small>Não pomos preços na encomenda.</small></span></label>
      <div class="campo" data-mensagem hidden><label for="mensagem">Mensagem para o cartão <span class="campo__pista">(opcional)</span></label><textarea id="mensagem" name="mensagem" maxlength="240"></textarea></div>
      <div class="campo"><label for="notas">Notas para nós <span class="campo__pista">(opcional)</span></label><textarea id="notas" name="notas" placeholder="Por exemplo: preciso para dia 20 de dezembro"></textarea></div>
    </section>
  </div>
  <aside class="resumo" aria-labelledby="t-resumo">
    <h2 id="t-resumo">A tua encomenda</h2>
    <div data-itens-resumo></div>
    <dl><dt>Artigos</dt><dd data-subtotal></dd><dt>Portes</dt><dd data-portes></dd><dt class="total">Total</dt><dd class="total" data-total></dd></dl>
    <p class="aviso" data-aviso-personalizado hidden>Os artigos personalizados não têm troca nem devolução por desistência. Confirma o nome, a frase, o tamanho e a cor: é assim que os vamos fazer.</p>
    <label class="marcar"><input type="checkbox" name="termos" required aria-describedby="termos-erro"><span>Li e aceito os <a href="${url(termosUrl)}">termos e condições</a></span></label>
    <p class="campo__erro" id="termos-erro" data-erro></p>
    <button class="botao botao--cheio" type="submit">Encomendar e pagar</button>
    <p class="pagamentos"><span>MB WAY</span><span>Cartão</span><span>Pagamento seguro pela Stripe</span></p>
  </aside>
</form>
<dialog class="caixa" id="pre-visualizacao" aria-labelledby="t-pre">
  <h2 id="t-pre">Quase a abrir</h2>
  <p>Esta é a pré-visualização da loja: o pagamento com MB WAY e cartão liga-se quando a conta da Franja Kids estiver pronta.</p>
  <p>Até lá, as encomendas fazem-se por <a href="https://ig.me/m/${loja.instagram}">mensagem no Instagram</a>.</p>
  <button class="botao botao--cheio" type="button" data-fechar autofocus>Percebi</button>
</dialog>`,
  };
}

// ── Procurar ───────────────────────────────────────────────────────────────

export function procurar({ produtos }) {
  return {
    caminho: '/procurar/',
    titulo: 'Procurar',
    descricao: 'Procura bodies, t-shirts, camisolas e presentes na Franja Kids.',
    corpo: `<section class="contentor pagina" aria-labelledby="t-procurar">
  <h1 id="t-procurar">Procurar</h1>
  <form class="procura" role="search" data-procura action="${url('/procurar/')}">${icone('procurar')}<label class="so-leitor" for="q">Procurar na loja</label><input id="q" name="q" type="search" placeholder="Padrinhos, avós, babygrow…" autocomplete="off"></form>
  <p class="contagem" data-contagem aria-live="polite"></p>
  <ul class="grelha" data-grelha>
    ${produtos.map((p) => `<li data-texto="${esc([p.nome, p.resumo, p.categoria, ...p.ocasioes].join(' '))}">${cartao(p)}</li>`).join('\n    ')}
  </ul>
</section>`,
  };
}

// ── Textos (ajuda, sobre, legais) ──────────────────────────────────────────

export function texto(caminho, titulo, frase, html, descricao) {
  return {
    caminho, titulo, descricao: descricao || frase,
    corpo: `<section class="contentor pagina" aria-labelledby="t-pagina"><h1 id="t-pagina">${esc(titulo)}</h1>${frase ? `<p>${esc(frase)}</p>` : ''}</section>
<div class="contentor texto">${html}</div>`,
  };
}

export function sobre({ loja }) {
  return {
    caminho: '/sobre/',
    titulo: 'Sobre nós',
    descricao: 'A Franja Kids são duas amigas que personalizam roupa e presentes para bebés, crianças e família.',
    imagem: 'donas',
    corpo: `<section class="contentor historia" aria-labelledby="t-sobre">
  ${foto('donas', { sizes: '(min-width: 1024px) 460px, calc(100vw - 40px)', classe: 'historia__foto', prioridade: true })}
  <div class="historia__texto">
    <h1 id="t-sobre" class="pagina__titulo">Duas amigas, uma ideia</h1>
    <p>A Franja Kids nasceu a 10 de setembro de 2025, com roupa de bebé escolhida com carinho. Foram vocês que nos levaram para os personalizados: hoje fazemos bodies, t-shirts, camisolas e presentes com o nome e a história de cada família.</p>
    <p>Cada peça é preparada por nós, uma a uma. Antes de produzir, mandamos-te sempre a pré-visualização.</p>
    <ul class="factos">
      <li><span class="passos__icone">${icone('coracao')}</span>Mais de 7 mil pessoas acompanham-nos no Instagram</li>
      <li><span class="passos__icone">${icone('local')}</span>Entregas em mão em ${loja.entregaEmMao}</li>
      <li><span class="passos__icone">${icone('carrinha')}</span>Enviamos para Portugal e para o estrangeiro</li>
    </ul>
    <div class="heroi__botoes"><a class="botao botao--cheio" href="${url('/personalizados/')}">Ver os personalizados</a><a class="ligacao" href="https://www.instagram.com/${loja.instagram}/">@${loja.instagram} ${icone('seta', 'icone icone--pequeno')}</a></div>
  </div>
</section>`,
  };
}

export function naoEncontrada() {
  return {
    caminho: '/404.html',
    titulo: 'Página não encontrada',
    descricao: 'Esta página não existe.',
    corpo: `<section class="contentor pagina" aria-labelledby="t-404"><h1 id="t-404">Esta página não existe</h1><p>Pode ter mudado de sítio. Experimenta a loja ou procura o que querias.</p>
<div class="heroi__botoes"><a class="botao botao--cheio" href="${url('/personalizados/')}">Ver os personalizados</a><a class="ligacao" href="${url('/procurar/')}">Procurar ${icone('seta', 'icone icone--pequeno')}</a></div></section>`,
  };
}

