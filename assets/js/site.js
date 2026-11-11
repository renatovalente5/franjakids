// Franja Kids — menu, ficha do produto, carrinho, finalizar e obrigado. Sem dependências.
// O carrinho guarda só o que se escolheu; os preços vêm sempre do catálogo publicado
// (assets/catalogo.json), com a mesma conta do Worker das encomendas (src/lib/regras.mjs,
// conferirEscolha) — e o Worker refaz tudo do seu lado antes de aceitar a encomenda.
(() => {
  const BASE = document.body.dataset.base || '';
  const API = document.body.dataset.api || '';
  const CHAVE = 'franja:carrinho:v2';
  const MAX_QTD = 20;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const euro = (n) => n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const anunciar = (t) => { const a = $('[data-anuncio]'); if (a) { a.textContent = ''; setTimeout(() => { a.textContent = t; }, 50); } };
  const cents = (v) => Math.round(v * 100);

  // ── Carrinho guardado no browser ──
  /* O que está guardado lê-se com desconfiança: uma linha estragada (à mão, ou de uma versão antiga) não pode parar o
     site inteiro. Só objectos com o slug; a quantidade inteira de 1 a MAX_QTD; o resto com o tipo certo. (O número
     do topo, em linha no <head> do layout.mjs, conta da mesma maneira.) */
  const linhaLimpa = (i) => {
    if (!i || typeof i !== 'object' || typeof i.slug !== 'string' || !i.slug) return null;
    const l = { slug: i.slug };
    if (typeof i.tamanho === 'string' && i.tamanho) l.tamanho = i.tamanho;
    if (typeof i.cor === 'string' && i.cor) l.cor = i.cor;
    l.opcoes = i.opcoes && typeof i.opcoes === 'object' && !Array.isArray(i.opcoes)
      ? Object.fromEntries(Object.entries(i.opcoes).filter(([, v]) => typeof v === 'string')) : {};
    l.texto = typeof i.texto === 'string' ? i.texto : '';
    l.personalizar = i.personalizar === true;
    l.qtd = Math.min(MAX_QTD, Math.max(1, Math.floor(Number(i.qtd)) || 1));
    return l;
  };
  const ler = () => { try { const v = JSON.parse(localStorage.getItem(CHAVE)); return Array.isArray(v) ? v.map(linhaLimpa).filter(Boolean) : []; } catch { return []; } };
  const gravar = (itens) => { try { localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch { /* sem armazenamento: o carrinho dura só esta página */ } contar(); };
  const chaveDe = (i) => JSON.stringify([i.slug, i.tamanho || '', i.cor || '', i.opcoes || {}, i.texto || '', !!i.personalizar]);
  let contados = null;  // o número da última vez: só salta quando sobe (juntar uma peça), não ao abrir
  function contar() {
    const n = ler().reduce((s, i) => s + i.qtd, 0);
    $$('[data-carrinho-conta]').forEach((el) => {
      el.textContent = n; el.hidden = !n;
      if (contados !== null && n > contados) { el.classList.remove('salta'); void el.offsetWidth; el.classList.add('salta'); }
    });
    contados = n;
    $$('[data-carrinho-ligacao]').forEach((el) => el.setAttribute('aria-label', n ? `Carrinho, ${n} ${n === 1 ? 'artigo' : 'artigos'}` : 'Carrinho'));
  }
  contar();
  addEventListener('pageshow', (e) => { if (e.persisted) { contar(); if ($('[data-carrinho]')) desenharCarrinho(); } });

  /* O catálogo publicado. Sem ele (sem rede, um erro do servidor) lança, e quem o pede mostra que não deu: o
     carrinho, o finalizar e a gaveta nunca ficam calados à espera. */
  let catalogo = null;
  const obterCatalogo = async (fresco = false) => {
    if (catalogo && !fresco) return catalogo;
    const r = await fetch(BASE + '/assets/catalogo.json', fresco ? { cache: 'no-store' } : {});
    if (!r.ok) throw new Error('catálogo: ' + r.status);
    const c = await r.json();
    if (!c || typeof c.produtos !== 'object' || !Array.isArray(c.zonas)) throw new Error('catálogo inválido');
    return (catalogo = c);
  };
  /* O preço de uma unidade, em cêntimos, ou null se o produto já não se vende ou a escolha já não
     existe (o produto mudou no painel): essas linhas saem do carrinho. */
  const unidade = (i, cat) => {
    const p = cat.produtos[i.slug];
    // esgotado (o produto, o tamanho, a cor ou o valor escolhido): a linha sai, como as que já não se vendem
    if (!p || typeof p.preco !== 'number' || p.esgotado) return null;
    if (p.tamanhos.length && (!p.tamanhos.includes(i.tamanho) || (p.tamanhosEsgotados || []).includes(i.tamanho))) return null;
    if (p.cores.length && !p.cores.some((c) => c.nome === i.cor && !c.esgotado)) return null;
    let v = cents(p.preco);
    for (const g of p.opcoes) {
      const escolhido = (i.opcoes || {})[g.nome];
      const valor = g.valores.find((x) => x.nome === escolhido) || (escolhido == null ? g.valores.find((x) => !x.suplemento && !x.esgotado) : null);
      if (!valor || valor.esgotado) return null;
      v += cents(valor.suplemento);
    }
    if (p.personalizacao?.opcional && i.personalizar) v += cents(p.personalizacao.suplemento);
    return v;
  };
  const validos = (cat) => ler().filter((i) => unidade(i, cat) != null);
  /* As linhas que já não se vendem (o produto saiu ou ficou sem preço, a escolha mudou no painel) saem do carrinho
     guardado assim que se desenha, para o número do topo e a lista dizerem o mesmo. → { itens, sairam } */
  const limparCarrinho = (cat) => {
    const todas = ler();
    const itens = todas.filter((i) => unidade(i, cat) != null);
    if (itens.length !== todas.length) gravar(itens);
    return { itens, sairam: todas.length - itens.length };
  };
  const fotoDe = (p) => `<picture><img src="${esc(p.foto)}" alt="" width="360" height="480" loading="lazy"></picture>`;
  const escolhasDe = (i, p, mais = []) => [i.tamanho && `Tamanho: ${i.tamanho}`, i.cor && `Cor: ${i.cor}`, ...Object.entries(i.opcoes || {}).map(([k, v]) => `${k}: ${v}`),
    p.personalizacao?.opcional && i.personalizar && p.personalizacao.opcional, ...mais].filter(Boolean).map(esc).join(' · ');
  const textoDe = (i, p) => (i.texto ? `<p class="item__texto">${esc(p.personalizacao?.rotulo || 'Personalização')}: «${esc(i.texto)}»</p>` : '');
  const progresso = (el, subtotal, limite) => {
    if (!el) return;
    if (typeof limite !== 'number') { el.innerHTML = ''; return; }
    const falta = Math.max(0, limite - subtotal);
    el.innerHTML = (falta ? `<span>Faltam <strong>${euro(falta)}</strong> para portes grátis no continente.</span>` : '<span><strong>Tens portes grátis no continente.</strong></span>')
      + `<span class="progresso__barra" aria-hidden="true"><span style="width:${Math.min(100, (subtotal / limite) * 100)}%"></span></span>`;
  };

  // ── Movimento: o que entra ao descer (a MESMA lista do site.css, «Movimento») ──
  const ENTRAM = '.seccao__topo h2, .ocasioes li, .linhas__cartao, .fila.produtos li, .passos li, .sobre__foto, .sobre__texto, .insta li, .grelha li, .cartoes-ajuda li, .factos li';
  const raiz = document.documentElement;
  if ('IntersectionObserver' in window) {
    // os que entram juntos (uma fila de cartões) entram um a seguir ao outro
    const io = new IntersectionObserver((entradas) => {
      let d = 0;
      for (const en of entradas) {
        if (!en.isIntersecting) continue;
        en.target.style.setProperty('--d', String(Math.min(d++, 6)));
        en.target.classList.add('visivel');
        io.unobserve(en.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    $$(ENTRAM).forEach((el) => io.observe(el));
    raiz.classList.add('observa');
    // salvaguarda: o que está à vista e o observador não viu aparece na mesma
    setTimeout(() => $$(ENTRAM).forEach((el) => {
      if (el.classList.contains('visivel')) return;
      const r = el.getBoundingClientRect();
      if (r.width && r.top < innerHeight && r.bottom > 0) el.classList.add('visivel');
    }), 2500);
    // o selo da capa só roda enquanto está à vista
    const selo = $('.selo');
    if (selo) new IntersectionObserver(([e]) => selo.classList.toggle('fora', !e.isIntersecting)).observe(selo);
  } else $$(ENTRAM).forEach((el) => el.classList.add('visivel'));
  // o topo ganha uma sombra quando a página desce
  const rolou = () => raiz.classList.toggle('rolou', scrollY > 8);
  addEventListener('scroll', rolou, { passive: true });
  rolou();

  // ── Menu do telemóvel ──
  const botaoMenu = $('[data-menu]');
  const painel = $('#menu-telemovel');
  if (botaoMenu && painel) {
    // ecrã inteiro: a página por baixo não rola (a classe na raiz) e o topo fica com o «X»
    // e o que fica tapado (o conteúdo, o rodapé) sai do alcance do Tab e dos leitores de ecrã enquanto está aberto
    const tapados = $$('body > main, body > footer, body > .saltar');
    const mostrarMenu = (aberto) => {
      botaoMenu.setAttribute('aria-expanded', String(aberto)); painel.hidden = !aberto;
      document.documentElement.classList.toggle('menu-aberto', aberto);
      tapados.forEach((el) => { el.inert = aberto; });
    };
    botaoMenu.addEventListener('click', () => mostrarMenu(botaoMenu.getAttribute('aria-expanded') !== 'true'));
    painel.addEventListener('click', (e) => { if (e.target.closest('a')) mostrarMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !painel.hidden) { mostrarMenu(false); botaoMenu.focus(); } });
    matchMedia('(min-width: 1024px)').addEventListener('change', (m) => { if (m.matches) mostrarMenu(false); });
    // ao voltar atrás (bfcache), a página volta como estava: com o menu fechado
    addEventListener('pageshow', (e) => { if (e.persisted) mostrarMenu(false); });
  }

  // ── Diálogos: fechar e clicar fora ──
  /* «Fora» é fora da caixa, pelas coordenadas: o próprio <dialog> também é o alvo de um clique no espaço vazio lá
     dentro (o enchimento da caixa, o meio da gaveta), e esse não a fecha. */
  $$('dialog').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-fechar]')) { d.close(); return; }
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
    });
  });

  // ── Endereços antigos dos filtros ──
  // As categorias e as ocasiões eram filtros (/personalizados/?categoria=bodies); agora são páginas
  // (/personalizados/bodies/, /ocasioes/avos/). Uma ligação antiga vai para a página, pela pastilha que a tem.
  const filtros = $('[data-filtros]');
  // a pastilha da página onde se está fica à vista na fila dela (no telemóvel as filas rolam para o lado)
  if (filtros) for (const a of $$('.pastilha[aria-current="page"]', filtros)) {
    const fila = a.parentElement;
    fila.scrollLeft += a.getBoundingClientRect().left - fila.getBoundingClientRect().left - (fila.clientWidth - a.offsetWidth) / 2;
  }
  if (filtros && location.search) {
    const q = new URLSearchParams(location.search);
    const ir = ['categoria', 'ocasiao'].map((k) => q.get(k) && $(`a[data-${k}="${CSS.escape(q.get(k))}"]`, filtros)).find(Boolean);
    if (ir) location.replace(ir.href);
  }

  // ── Procurar ──
  const procura = $('[data-procura]');
  if (procura) {
    const campo = $('input', procura);
    const itens = $$('[data-grelha] li');
    const normal = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const textos = itens.map((li) => normal(li.dataset.texto));
    const filtrar = () => {
      const termos = normal(campo.value.trim()).split(/\s+/).filter(Boolean);
      let n = 0;
      itens.forEach((li, k) => { const ok = termos.every((t) => textos[k].includes(t)); li.hidden = !ok; n += ok; });
      $('[data-contagem]').textContent = termos.length ? (n ? `${n} ${n === 1 ? 'resultado' : 'resultados'}` : 'Nada encontrado. Experimenta outra palavra ou manda-nos mensagem.') : '';
    };
    campo.value = new URLSearchParams(location.search).get('q') || '';
    campo.addEventListener('input', () => { filtrar(); history.replaceState(null, '', location.pathname + (campo.value ? '?q=' + encodeURIComponent(campo.value) : '')); });
    procura.addEventListener('submit', (e) => { e.preventDefault(); filtrar(); });
    filtrar();
  }

  // ── Ficha do produto ──
  const ficha = $('[data-ficha]');
  if (ficha) {
    const dados = JSON.parse($('[data-produto]', ficha).textContent);
    const grandes = $$('[data-foto-grande]');
    const minis = $$('[data-miniatura]');
    const mostrar = (k) => {
      $('[data-galeria]').classList.add('troca');  // daqui para a frente a fotografia troca a esbater
      grandes.forEach((g) => { g.hidden = g.dataset.fotoGrande !== String(k); });
      minis.forEach((m) => m.setAttribute('aria-pressed', String(m.dataset.miniatura === String(k))));
    };
    minis.forEach((m) => m.addEventListener('click', () => mostrar(m.dataset.miniatura)));

    const campo = $('#texto', ficha);
    const caixa = $('[data-personalizar]', ficha);
    const blocoTexto = $('[data-campo-texto]', ficha);
    const qtd = $('[data-quantidade] input', ficha);
    const total = $('[data-total]', ficha);
    const unitario = () => {
      let v = cents(dados.preco || 0);
      $$('input[type="radio"]:checked', ficha).forEach((r) => { v += cents(Number(r.dataset.suplemento) || 0); });
      if (caixa?.checked) v += cents(Number(caixa.dataset.suplemento) || 0);
      return v / 100;
    };
    // a quantidade escrita à mão conta de 1 a MAX_QTD (a mesma que vai para o carrinho)
    const quantos = () => Math.min(MAX_QTD, Math.max(1, parseInt(qtd?.value, 10) || 1));
    const actualizar = () => {
      $$('[data-opcao]', ficha).forEach((f) => { const r = $('input:checked', f); $('[data-escolhido]', f).textContent = r ? '· ' + r.value : ''; });
      if (total) total.textContent = euro(unitario() * quantos());
    };
    ficha.addEventListener('change', (e) => {
      if (e.target.matches('input[type="radio"]')) {
        const f = e.target.closest('[data-opcao]');
        $('[data-erro]', f).textContent = '';
        if (e.target.dataset.foto != null) mostrar(e.target.dataset.foto);
      }
      if (e.target === caixa) {
        // ligar ou desligar a personalização começa do zero: sem o erro de uma tentativa anterior
        blocoTexto.hidden = !caixa.checked;
        campo.removeAttribute('aria-invalid'); $('#texto-erro').textContent = '';
        if (caixa.checked) campo.focus();
      }
      if (e.target === qtd) qtd.value = quantos();
      actualizar();
    });
    /* As letras contam-se como o Worker as conta (regras.mjs, conferirEscolha): sem os invisíveis, os espaços seguidos
       num só e sem os das pontas, em unidades de JavaScript (um emoji conta 2, com o tom de pele 4). Contadas de
       outra maneira, um nome perto do máximo passava aqui e era recusado no envio. */
    const JUNTORES = [String.fromCodePoint(0x200c), String.fromCodePoint(0x200d)];  // os juntores dos emojis ficam (os do Worker também)
    const semInvisiveis = (s) => s.replace(/\p{Cf}/gu, (c) => (JUNTORES.includes(c) ? c : '')).replace(/\s+/g, ' ').trim();
    const letras = () => { const t = semInvisiveis(campo.value); return [...t].every((c) => JUNTORES.includes(c) || /\s/.test(c)) ? 0 : t.length; };
    const contarLetras = () => {
      if (!campo) return true;
      const max = Number(campo.dataset.max);
      const n = letras();
      const c = $('[data-contador]', ficha);
      const passou = n > max;
      c.textContent = passou ? `${n - max} ${n - max === 1 ? 'caractere' : 'caracteres'} a mais` : `${max - n} de ${max} caracteres disponíveis`;
      c.classList.toggle('campo__contador--erro', passou);
      return !passou;
    };
    campo?.addEventListener('input', () => { contarLetras(); campo.removeAttribute('aria-invalid'); $('#texto-erro').textContent = ''; });
    contarLetras();
    $('[data-menos]', ficha)?.addEventListener('click', () => { qtd.value = Math.max(1, (parseInt(qtd.value, 10) || 1) - 1); actualizar(); });
    $('[data-mais]', ficha)?.addEventListener('click', () => { qtd.value = Math.min(MAX_QTD, (parseInt(qtd.value, 10) || 1) + 1); actualizar(); });
    qtd?.addEventListener('input', actualizar);
    actualizar();

    ficha.addEventListener('submit', async (e) => {
      e.preventDefault();
      let primeiro = null;
      for (const f of $$('[data-opcao][data-obrigatoria]', ficha)) {
        const r = $('input:checked', f);
        $('[data-erro]', f).textContent = r ? '' : `Escolhe ${f.dataset.campo === 'tamanho' ? 'o tamanho' : f.dataset.campo === 'cor' ? 'a cor' : 'uma opção'}.`;
        if (!r && !primeiro) primeiro = $('input', f);
      }
      if (campo && !blocoTexto.hidden) {
        const vazio = !campo.value.replace(/\p{Cf}/gu, '').trim();
        const precisa = campo.hasAttribute('data-obrigatorio') || caixa?.checked;
        let msg = '';
        if (precisa && vazio) msg = 'Escreve o texto para personalizarmos.';
        else if (!contarLetras()) msg = `Usa no máximo ${campo.dataset.max} caracteres.`;
        $('#texto-erro').textContent = msg;
        if (msg) { campo.setAttribute('aria-invalid', 'true'); primeiro ||= campo; }
      }
      if (primeiro) { primeiro.focus(); return; }
      const valorDe = (f) => $('input:checked', f)?.value;
      const grupos = $$('[data-opcao]', ficha);
      const item = {
        slug: dados.slug,
        tamanho: valorDe(grupos.find((f) => f.dataset.campo === 'tamanho') || document.createElement('i')),
        cor: valorDe(grupos.find((f) => f.dataset.campo === 'cor') || document.createElement('i')),
        opcoes: Object.fromEntries(grupos.filter((f) => !f.dataset.campo).map((f) => [f.dataset.opcao, valorDe(f)]).filter(([, v]) => v)),
        texto: campo && !blocoTexto.hidden ? semInvisiveis(campo.value) : '',
        personalizar: !!caixa?.checked,
        qtd: quantos(),
      };
      for (const k of ['tamanho', 'cor']) if (!item[k]) delete item[k];
      const itens = ler();
      const igual = itens.find((i) => chaveDe(i) === chaveDe(item));
      if (igual) igual.qtd = Math.min(MAX_QTD, igual.qtd + item.qtd); else itens.push(item);
      gravar(itens);
      anunciar(`Juntámos ao carrinho: ${dados.nome}.`);
      await abrirGaveta(item, dados.nome);
    });
  }

  /* A gaveta abre sempre que se junta uma peça. Com o catálogo, mostra a fotografia, as escolhas, o preço e quanto
     falta para os portes grátis; sem ele (sem rede), só o nome — a peça já está no carrinho na mesma. */
  async function abrirGaveta(item, nome) {
    const g = $('#gaveta');
    if (!g) return;
    const quantas = item.qtd > 1 ? [`${item.qtd} unidades`] : [];
    let corpo = `<div class="item item--simples"><div><h3>${esc(nome)}</h3><p class="item__escolhas">${quantas.map(esc).join('')}</p></div></div>`;
    let subtotal = null, limite = null;
    try {
      const cat = await obterCatalogo();
      const p = cat.produtos[item.slug];
      const u = unidade(item, cat);
      if (p && u != null) {
        corpo = `<div class="item"><div class="item__foto">${fotoDe(p)}</div><div><h3>${esc(p.nome)}</h3><p class="item__escolhas">${escolhasDe(item, p, quantas)}</p>${textoDe(item, p)}</div><p class="item__preco">${euro((u * item.qtd) / 100)}</p></div>`;
        subtotal = validos(cat).reduce((s, i) => s + unidade(i, cat) * i.qtd, 0) / 100;
        limite = cat.gratisAPartirDe;
      }
    } catch { /* sem o catálogo: abre só com o nome */ }
    $('[data-gaveta-corpo]', g).innerHTML = corpo;
    progresso($('[data-progresso]', g), subtotal ?? 0, subtotal == null ? null : limite);
    if (!g.open) g.showModal();
  }

  // ── Página do carrinho ──
  /* Desenhar a lista de novo apaga os botões: o foco (no «+», no «−», no campo, no «Remover» de uma linha) volta ao
     mesmo papel na mesma linha da lista nova; depois de «Remover», ao da linha que ficou no lugar (ou à de cima). */
  const PAPEIS = ['menos', 'mais', 'qtd', 'remover'];
  const lugarDoFoco = (lista) => {
    const el = document.activeElement;
    if (!el || !lista.contains(el)) return null;
    const papel = PAPEIS.find((x) => el.dataset[x] != null);
    return papel ? { papel, k: Number(el.dataset[papel]) } : null;
  };
  const reporFoco = (lista, lugar) => {
    if (!lugar) return;
    const de = (k) => $(`[data-${lugar.papel}="${k}"]`, lista);
    (de(lugar.k) || de(lugar.k - 1) || $('a, button', lista))?.focus();
  };
  async function desenharCarrinho() {
    const raiz = $('[data-carrinho]');
    const lista = $('[data-itens]', raiz);
    const resumo = $('[data-resumo]', raiz);
    let cat;
    try { cat = await obterCatalogo(); } catch {
      lista.innerHTML = '<div class="vazio"><p>Não conseguimos carregar o carrinho. Confirma a ligação à internet.</p><button class="botao botao--linha" type="button" data-recarregar>Tentar outra vez</button></div>';
      resumo.hidden = true;
      return;
    }
    const { itens, sairam } = limparCarrinho(cat);
    const aviso = sairam ? `<p class="aviso">${sairam === 1 ? 'Uma peça do carrinho já não está à venda como a escolheste e saiu dele.' : `${sairam} peças do carrinho já não estão à venda como as escolheste e saíram dele.`}</p>` : '';
    const foco = lugarDoFoco(lista);
    if (!itens.length) {
      lista.innerHTML = `${aviso}<p class="vazio">O carrinho está vazio. <a href="${BASE}/personalizados/">Ver os personalizados</a></p>`;
      resumo.hidden = true;
      reporFoco(lista, foco);
      return;
    }
    lista.innerHTML = aviso + '<h2 class="so-leitor">As peças no carrinho</h2>' + itens.map((i, k) => {
      const p = cat.produtos[i.slug];
      const nome = esc(p.nome);
      return `<div class="item"><div class="item__foto">${fotoDe(p)}</div><div><h3><a href="${esc(p.url)}">${nome}</a></h3><p class="item__escolhas">${escolhasDe(i, p)}</p>${textoDe(i, p)}
        <div class="item__accoes"><div class="quantidade"><button type="button" data-menos="${k}" aria-label="Diminuir a quantidade de ${nome}">−</button><input type="text" inputmode="numeric" value="${i.qtd}" aria-label="Quantidade de ${nome}" data-qtd="${k}"><button type="button" data-mais="${k}" aria-label="Aumentar a quantidade de ${nome}">+</button></div><button class="item__remover" type="button" data-remover="${k}" aria-label="Remover ${nome}">Remover</button></div></div>
        <p class="item__preco">${euro((unidade(i, cat) * i.qtd) / 100)}</p></div>`;
    }).join('');
    const subtotal = itens.reduce((s, i) => s + unidade(i, cat) * i.qtd, 0) / 100;
    $('[data-subtotal]', raiz).textContent = euro(subtotal);
    $('[data-portes]', raiz).textContent = 'No passo seguinte';
    progresso($('[data-progresso]', raiz), subtotal, cat.gratisAPartirDe);
    resumo.hidden = false;
    reporFoco(lista, foco);
  }
  const raizCarrinho = $('[data-carrinho]');
  if (raizCarrinho) {
    desenharCarrinho();
    // os índices são os da lista desenhada, que já só tem as linhas que se vendem
    const mexer = async (fn) => {
      try { const cat = await obterCatalogo(); const itens = validos(cat); fn(itens); gravar(itens); } catch { /* o desenho diz que não deu */ }
      await desenharCarrinho();
    };
    raizCarrinho.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.matches('[data-recarregar]')) { desenharCarrinho(); return; }
      const k = Number(b.dataset.menos ?? b.dataset.mais ?? b.dataset.remover);
      if (Number.isNaN(k)) return;
      mexer((itens) => {
        if (!itens[k]) return;
        if ('remover' in b.dataset) { const [fora] = itens.splice(k, 1); anunciar(`Removido: ${catalogo.produtos[fora.slug]?.nome || ''}.`); }
        else if ('menos' in b.dataset) itens[k].qtd = Math.max(1, itens[k].qtd - 1);
        else itens[k].qtd = Math.min(MAX_QTD, itens[k].qtd + 1);
      });
    });
    /* O «change» do campo da quantidade chega ANTES de o Tab mover o foco: desenhar já apagava o campo de onde o foco
       saía e ele caía no <body>. Adia-se, para o desenho já encontrar o foco no sítio seguinte (memória
       redesenhar-no-change-do-tab-perde-o-foco). */
    raizCarrinho.addEventListener('change', (e) => {
      if (!e.target.matches('[data-qtd]')) return;
      const k = Number(e.target.dataset.qtd);
      const valor = e.target.value;
      setTimeout(() => mexer((itens) => { if (itens[k]) itens[k].qtd = Math.min(MAX_QTD, Math.max(1, parseInt(valor, 10) || 1)); }), 0);
    });
    // o carrinho mudado noutro separador
    addEventListener('storage', (e) => { if (e.key === CHAVE || e.key === null) desenharCarrinho(); });
  }
  addEventListener('storage', (e) => { if (e.key === CHAVE || e.key === null) contar(); });

  // ── Finalizar ──
  const form = $('[data-finalizar]');
  if (form) {
    const tituloOriginal = document.title;
    const botao = $('[data-enviar]', form);
    const erroEnvio = $('[data-erro-envio]', form);
    let totalMostrado = null;
    const zonaEscolhida = () => $('input[name="envio"]:checked', form);
    /* O CUPÃO (11 nov 2026; o Worker: cupoes.js). Só com o Worker das encomendas no ar (a pré-visualização não tem o
       campo). O finalizar confere o código (POST /cupao) e faz a mesma conta do Worker para mostrar o total; o
       /checkout confere tudo outra vez. Fica neste separador (sessionStorage), para o «voltar» da Stripe. */
    let cupao = null;
    let ultimasLinhas = [];
    const descontoDe = (r, linhas) => {
      const cats = Array.isArray(r.categorias) ? r.categorias : [];
      const daCategoria = (l) => !cats.length || cats.includes(l.categoria);
      if (r.tipo === 'portes') return { cents: 0, portes: linhas.length > 0 && linhas.every(daCategoria) };
      const base = linhas.filter(daCategoria).reduce((s, l) => s + l.total_cents, 0);
      if (r.tipo === 'percentagem') return { cents: Math.round((base * r.valor) / 100), portes: false };
      if (r.tipo === 'valor') return { cents: Math.min(Math.round(r.valor * 100), base), portes: false };
      return { cents: 0, portes: false };
    };
    const linhasDoPedido = (itens) => itens.map((i) => ({ produto: i.slug, ...(i.tamanho ? { tamanho: i.tamanho } : {}), ...(i.cor ? { cor: i.cor } : {}), opcoes: i.opcoes || {}, personalizar: !!i.personalizar, texto: i.texto || '', qtd: i.qtd }));
    const CUPAO = 'franja:cupao';
    const blocoCupao = $('[data-cupao]', form);
    const mostrarCupao = () => {
      if (!blocoCupao) return;
      const aplicado = $('[data-cupao-aplicado]', blocoCupao);
      $('[data-cupao-abrir]', blocoCupao).hidden = Boolean(cupao);
      aplicado.hidden = !cupao;
      aplicado.innerHTML = cupao ? `Cupão <strong>${esc(cupao.codigo)}</strong>: ${esc(cupao.descricao)}. <button type="button" class="cupao__tirar" data-cupao-tirar>Tirar</button>` : '';
    };
    const porCupao = (c) => {
      cupao = c;
      try { if (c) sessionStorage.setItem(CUPAO, JSON.stringify(c)); else sessionStorage.removeItem(CUPAO); } catch { /* sem armazenamento */ }
      mostrarCupao();
    };
    if (blocoCupao) {
      try { const c = JSON.parse(sessionStorage.getItem(CUPAO)); if (c && typeof c.codigo === 'string') cupao = c; } catch { /* nada guardado */ }
      mostrarCupao();
      const campoCupao = $('#cupao', blocoCupao);
      const erroCupao = $('[data-cupao-erro]', blocoCupao);
      const aplicar = async () => {
        const codigo = campoCupao.value.trim();
        erroCupao.textContent = '';
        if (!codigo) { erroCupao.textContent = 'Escreve o código do cupão.'; campoCupao.focus(); return; }
        const b = $('[data-cupao-aplicar]', blocoCupao);
        b.disabled = true;
        try {
          const r = await fetch(API + '/cupao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo, linhas: linhasDoPedido(ultimasLinhas), entrega: zonaEscolhida().value }) });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j.cupao) { porCupao(j.cupao); campoCupao.value = ''; await desenhar(); $('[data-cupao-tirar]', blocoCupao)?.focus(); }
          else { erroCupao.textContent = j.erro || 'Este cupão não existe ou já não vale.'; campoCupao.focus(); }
        } catch {
          erroCupao.textContent = 'Não conseguimos confirmar o cupão (sem ligação?). Tenta outra vez.';
        }
        b.disabled = false;
      };
      $('[data-cupao-aplicar]', blocoCupao).addEventListener('click', aplicar);
      // o Enter no campo aplica o cupão (e não envia a encomenda)
      campoCupao.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); aplicar(); } });
      blocoCupao.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-cupao-tirar]')) return;
        porCupao(null);
        await desenhar();
        $('[data-cupao-abrir] summary', blocoCupao)?.focus();
      });
    }
    /* O resumo, com os preços do catálogo publicado. → as linhas; ou null, sem linhas (vai para o carrinho) ou sem o
       catálogo (e diz que não deu). */
    const desenhar = async (fresco = false) => {
      let cat;
      try { cat = await obterCatalogo(fresco); } catch {
        $('[data-itens-resumo]', form).innerHTML = '<p class="vazio">Não conseguimos carregar a encomenda.</p>';
        erroEnvio.textContent = 'Não conseguimos carregar os preços (sem ligação?). Tenta outra vez daqui a pouco.';
        return null;
      }
      const { itens } = limparCarrinho(cat);
      if (!itens.length) { location.replace(BASE + '/carrinho/'); return null; }
      $('[data-itens-resumo]', form).innerHTML = itens.map((i) => { const p = cat.produtos[i.slug]; return `<div class="item"><div class="item__foto">${fotoDe(p)}</div><div><h3>${esc(p.nome)}${i.qtd > 1 ? ' × ' + i.qtd : ''}</h3><p class="item__escolhas">${escolhasDe(i, p)}</p>${textoDe(i, p)}</div><p class="item__preco">${euro((unidade(i, cat) * i.qtd) / 100)}</p></div>`; }).join('');
      const artigos = itens.reduce((s, i) => s + unidade(i, cat) * i.qtd, 0);
      const zona = cat.zonas.find((z) => z.id === zonaEscolhida().value);
      // a conta do Worker (regras.mjs, portesDe): acima do valor, o continente é grátis mesmo sem os portes escritos
      let portes = zona && typeof zona.portes === 'number' ? cents(zona.portes) : null;
      if (zona?.id === 'continente' && typeof cat.gratisAPartirDe === 'number' && artigos >= cents(cat.gratisAPartirDe)) portes = 0;
      // o cupão, com a conta do Worker (cupoes.js, descontoDoCupao)
      const d = cupao ? descontoDe(cupao, itens.map((i) => ({ total_cents: unidade(i, cat) * i.qtd, categoria: cat.produtos[i.slug].categoria || '' }))) : { cents: 0, portes: false };
      const portesDoCupao = d.portes && portes != null && portes > 0;
      if (portesDoCupao) portes = 0;
      totalMostrado = artigos - d.cents + (portes == null ? 0 : portes);
      $('[data-subtotal]', form).textContent = euro(artigos / 100);
      $('[data-desconto-rotulo]', form).hidden = $('[data-desconto]', form).hidden = !(d.cents > 0);
      $('[data-desconto-rotulo]', form).textContent = cupao ? `Cupão ${cupao.codigo}` : 'Cupão';
      $('[data-desconto]', form).textContent = d.cents > 0 ? `−${euro(d.cents / 100)}` : '';
      $('[data-portes]', form).textContent = portes === 0 ? (portesDoCupao ? 'Grátis (cupão)' : 'Grátis') : portes == null ? 'A confirmar' : euro(portes / 100);
      $('[data-total]', form).textContent = portes == null ? `${euro(totalMostrado / 100)} + portes` : euro(totalMostrado / 100);
      ultimasLinhas = itens;
      $('[data-aviso-personalizado]', form).hidden = !itens.some((i) => i.texto);
      const z = zonaEscolhida().value;
      $('[data-morada]', form).hidden = z === 'mao';
      $('[data-pais]', form).hidden = z !== 'estrangeiro';
      return itens;
    };
    // ── De volta da página da Stripe sem pagar ──
    /* O «Voltar» da Stripe traz o número e a chave da encomenda (o cancel_url); o «voltar» do browser não traz nada,
       mas a encomenda que se foi pagar ficou guardada neste separador. Nos dois casos, a página da Stripe fecha-se e a
       encomenda fica sem efeito (POST /encomenda/desistir, sem emails: antes ficava aberta uma hora, dava para pagar
       duas, e uma hora depois chegava «o pagamento não se concluiu»), e o que se escreveu volta aos campos (os termos
       aceitam-se outra vez). Tudo isto vive só neste separador (sessionStorage) e sai quando a encomenda fica feita. */
    const PAGAMENTO = 'franja:pagamento';
    const DADOS = 'franja:finalizar';
    const GUARDADOS = ['nome', 'email', 'telemovel', 'nif', 'morada', 'codigo-postal', 'localidade', 'pais', 'mensagem', 'notas'];
    const separador = {
      ler: (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
      gravar: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento: não se repõe */ } },
      largar: (k) => { try { sessionStorage.removeItem(k); } catch { /* idem */ } },
    };
    const textoInicial = botao.textContent;
    const avisoPagamento = $('[data-aviso-pagamento]', form);
    const deVoltaDaStripe = () => {
      const q = new URLSearchParams(location.search);
      const pelaMorada = q.get('cancelado') && q.get('c') ? { e: q.get('cancelado'), c: q.get('c') } : null;
      const pendente = pelaMorada || separador.ler(PAGAMENTO);
      if (q.has('cancelado')) history.replaceState(null, '', location.pathname);  // a chave não fica na barra
      separador.largar(PAGAMENTO);
      if (!pendente && !q.has('cancelado')) return;
      const naoConcluido = () => {
        avisoPagamento.textContent = 'O pagamento não se concluiu e não se cobrou nada. Os teus dados estão aqui: confirma e envia outra vez.';
        avisoPagamento.hidden = false;
      };
      /* A encomenda pode não se ter desfeito: pagou nesse instante, ou escolheu Multibanco — com o Multibanco a
         Stripe fica na página da referência e não volta ao site, e o «Voltar» do browser traz a pessoa aqui. O
         Worker diz-o (`feita`), e a pessoa vai para a «obrigado», que mostra a referência por pagar (11 nov 2026). */
      if (pendente && API) {
        fetch(API + '/encomenda/desistir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ e: pendente.e, c: pendente.c }), keepalive: true })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (j && j.feita === true) location.replace(`${BASE}/obrigado/?e=${encodeURIComponent(pendente.e)}&c=${encodeURIComponent(pendente.c)}${typeof j.s === 'string' ? `&s=${encodeURIComponent(j.s)}` : ''}`);
            else naoConcluido();
          })
          .catch(naoConcluido);
      } else naoConcluido();
      const dados = separador.ler(DADOS);
      if (dados && typeof dados === 'object') {
        for (const k of GUARDADOS) if (typeof dados[k] === 'string' && form.elements[k]) form.elements[k].value = dados[k];
        const r = typeof dados.envio === 'string' && $$('input[name="envio"]', form).find((x) => x.value === dados.envio);
        if (r) r.checked = true;
        if (dados.oferta === true) { form.elements.oferta.checked = true; $('[data-mensagem]', form).hidden = false; }
      }
    };
    deVoltaDaStripe();
    desenhar();
    // ao voltar atrás para esta página (bfcache), ela volta como estava: com o botão em «A enviar…»
    addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      botao.disabled = false;
      botao.textContent = textoInicial;
      deVoltaDaStripe();
      desenhar();
    });

    /* AS REGRAS DOS CAMPOS SÃO AS DO WORKER DAS ENCOMENDAS (worker/encomendas/contas.js, validarCliente; o email e o
       NIF de src/lib/regras.mjs; scripts/testar.mjs confere que não se afastam): o que passa aqui não é recusado
       depois do envio, e o que é recusado aqui seria recusado lá. Cada regra → a frase do erro, ou '' se está certo. */
    const RE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
    const MAX_EMAIL = 160;
    const MAX_CP_ESTRANGEIRO = 20;
    const nifValido = (nif) => {
      const s = String(nif).replace(/\s/g, '');
      if (!/^[1-9][0-9]{8}$/.test(s)) return false;
      let soma = 0;
      for (let i = 0; i < 8; i++) soma += Number(s[i]) * (9 - i);
      const resto = soma % 11;
      return (resto < 2 ? 0 : 11 - resto) === Number(s[8]);
    };
    const RE_CP = /^(\d{4})\s*-?\s*(\d{3})$/;          // 4440-000, 4440 000 ou 4440000 → 4440-000
    const cpPortugues = (v) => { const m = RE_CP.exec(v); return m ? `${m[1]}-${m[2]}` : v; };
    const CP_E_DAS_ILHAS = 'Em Portugal continental o código postal começa por 1 a 8. Para os Açores e a Madeira, escolhe essa entrega.';
    const CP_E_DO_CONTINENTE = 'Nos Açores e na Madeira o código postal começa por 9. Para Portugal continental, escolhe essa entrega.';
    const regras = {
      nome: (v) => (v ? '' : 'Escreve o teu nome.'),
      email: (v) => (v.length <= MAX_EMAIL && RE_EMAIL.test(v) ? '' : 'Escreve um email como nome@exemplo.pt.'),
      telemovel: (v) => { const n = v.replace(/\D/g, '').length; return /^[+\d\s().-]+$/.test(v) && n >= 9 && n <= 15 ? '' : 'Escreve o telemóvel com 9 algarismos.'; },
      nif: (v) => (!v || nifValido(v) ? '' : 'O NIF não está certo. Confirma-o ou deixa-o em branco.'),
      morada: (v) => (v ? '' : 'Escreve a morada.'),
      'codigo-postal': (v, zona) => {
        if (zona === 'estrangeiro') return !v ? 'Escreve o código postal.' : v.length > MAX_CP_ESTRANGEIRO ? `O código postal tem no máximo ${MAX_CP_ESTRANGEIRO} caracteres.` : '';
        const cp = cpPortugues(v);
        const continente = /^[1-8]\d{3}-\d{3}$/.test(cp);
        const ilhas = /^9\d{3}-\d{3}$/.test(cp);
        if (zona === 'ilhas') return ilhas ? '' : continente ? CP_E_DO_CONTINENTE : 'Escreve o código postal como 9500-000.';
        return continente ? '' : ilhas ? CP_E_DAS_ILHAS : 'Escreve o código postal como 4440-000.';
      },
      localidade: (v) => (v ? '' : 'Escreve a localidade.'),
      pais: (v) => (v ? '' : 'Escreve o país.'),
      termos: () => (form.elements.termos.checked ? '' : 'Para encomendar, aceita os termos e condições.'),
    };
    const camposDe = (zona) => ['nome', 'email', 'telemovel', 'nif',
      ...(zona !== 'mao' ? ['morada', 'codigo-postal', 'localidade', ...(zona === 'estrangeiro' ? ['pais'] : [])] : []), 'termos'];
    // o valor como o Worker o lê: sem os invisíveis e sem os espaços das pontas
    const v = (id) => (form.elements[id]?.value || '').replace(/\p{Cf}/gu, '').trim();
    const marcar = (id, msg) => {
      const el = form.elements[id];
      const err = $('#' + id + '-erro');
      if (msg) el?.setAttribute('aria-invalid', 'true'); else el?.removeAttribute('aria-invalid');
      if (err && err.textContent !== msg) err.textContent = msg;
    };
    const conferir = (id) => { const msg = regras[id](v(id), zonaEscolhida().value); marcar(id, msg); return msg; };
    const comErro = (id) => form.elements[id]?.getAttribute('aria-invalid') === 'true';

    /* Um campo com erro volta a conferir-se a cada letra: o erro sai (ou muda) enquanto se escreve, e NUNCA ao sair do
       campo. Sair do campo é o «mousedown» no botão de enviar; tirar o erro nesse instante encolhia a página debaixo
       do dedo, o botão subia, e o clique caía ao lado (no Safari, o 1.º toque em «Enviar» perdia-se). */
    form.addEventListener('input', (e) => {
      const id = e.target.id || e.target.name;
      if (regras[id] && comErro(id)) conferir(id);
    });
    form.addEventListener('change', (e) => {
      if (e.target.name === 'envio') {
        desenhar();
        // o código postal confere-se com a entrega; os campos da morada que a entrega já não pede ficam sem erro
        const pede = camposDe(e.target.value);
        for (const id of ['morada', 'codigo-postal', 'localidade', 'pais']) if (comErro(id)) { if (pede.includes(id)) conferir(id); else marcar(id, ''); }
      }
      if (e.target.matches('[data-oferta]')) $('[data-mensagem]', form).hidden = !e.target.checked;
      if (e.target.name === 'termos' && comErro('termos')) conferir('termos');
    });
    const resumoErros = $('[data-resumo-erros]', form);
    const mostrarErros = (erros) => {
      $('ul', resumoErros).innerHTML = erros.map(([id, m]) => `<li><a href="#${id}">${esc(m)}</a></li>`).join('');
      resumoErros.hidden = false;
      document.title = 'Erro: ' + tituloOriginal;
      resumoErros.focus();
    };
    // a ligação do resumo leva ao campo e põe lá o foco (a âncora sozinha só rolava até ele)
    resumoErros.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      const alvo = a && document.getElementById(a.hash.slice(1));
      if (!alvo) return;
      e.preventDefault();
      alvo.focus({ preventScroll: true });
      alvo.scrollIntoView({ block: 'center' });
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (botao.disabled) return;
      erroEnvio.textContent = '';
      const zona = zonaEscolhida().value;
      const erros = camposDe(zona).map((id) => [id, conferir(id)]).filter(([, m]) => m);
      if (erros.length) { mostrarErros(erros); return; }
      resumoErros.hidden = true;
      document.title = tituloOriginal;

      const itens = await desenhar();
      if (!itens) return;
      // a pré-visualização, sem o Worker das encomendas no ar: confere tudo e não envia nada
      if (!API) { $('#pre-visualizacao')?.showModal(); return; }
      const cp = v('codigo-postal');
      const pedido = {
        linhas: linhasDoPedido(itens),
        entrega: zona,
        cliente: {
          nome: v('nome'), email: v('email'), telefone: v('telemovel'),
          ...(v('nif') ? { nif: v('nif').replace(/\s/g, '') } : {}),
          ...(zona !== 'mao' ? { morada: v('morada'), codigoPostal: zona === 'estrangeiro' ? cp : cpPortugues(cp), localidade: v('localidade') } : {}),
          ...(zona === 'estrangeiro' ? { pais: v('pais') } : {}),
        },
        oferta: !!form.elements.oferta.checked,
        ...(form.elements.oferta.checked && v('mensagem') ? { mensagem: v('mensagem') } : {}),
        ...(v('notas') ? { notas: v('notas') } : {}),
        termos: true,
        ...(cupao ? { cupao: cupao.codigo } : {}),
        total_cents: totalMostrado,
      };
      botao.disabled = true;
      const textoBotao = botao.textContent;
      botao.textContent = 'A enviar…';
      try {
        const r = await fetch(API + '/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido) });
        const resposta = await r.json().catch(() => ({}));
        if (r.ok && resposta.url) {
          separador.gravar(PAGAMENTO, { e: resposta.encomenda, c: resposta.chave });
          separador.gravar(DADOS, { ...Object.fromEntries(GUARDADOS.map((k) => [k, form.elements[k]?.value || ''])), envio: zona, oferta: !!form.elements.oferta.checked });
          location.assign(resposta.url);
          return;
        }
        if (r.ok && resposta.encomenda) {
          gravar([]);
          location.assign(`${BASE}/obrigado/?e=${encodeURIComponent(resposta.encomenda)}&c=${encodeURIComponent(resposta.chave)}`);
          return;
        }
        const id = { codigoPostal: 'codigo-postal', telefone: 'telemovel' }[resposta.campo] || resposta.campo;
        if (r.status === 409) { await desenhar(true); erroEnvio.textContent = resposta.erro || 'Os preços mudaram. Confirma o total e envia outra vez.'; }
        else if (r.status === 400 && resposta.campo === 'cupao') {
          porCupao(null);
          await desenhar();
          erroEnvio.textContent = resposta.erro || 'O cupão já não vale. Tirámo-lo: vê o total outra vez.';
        } else if (r.status === 400 && regras[id] && form.elements[id]) { marcar(id, resposta.erro); mostrarErros([[id, resposta.erro]]); }
        else {
          // um produto que deixou de se vender (ou mudou) entretanto: o resumo volta a desenhar-se sem ele
          if (r.status === 400 && ['produto', 'tamanho', 'cor', 'opcoes'].includes(resposta.campo)) await desenhar(true);
          erroEnvio.textContent = resposta.erro || 'Não conseguimos enviar a encomenda. Tenta outra vez daqui a pouco, ou manda-nos mensagem.';
        }
      } catch {
        erroEnvio.textContent = 'Não conseguimos enviar a encomenda (sem ligação?). Tenta outra vez daqui a pouco.';
      }
      botao.disabled = false;
      botao.textContent = textoBotao;
    });
  }

  // ── Obrigado: o resumo da encomenda (sem dados pessoais: o Worker só devolve o que a pessoa já sabe) ──
  const obrigado = $('[data-obrigado]');
  if (obrigado) {
    const q = new URLSearchParams(location.search);
    const corpo = $('[data-obrigado-corpo]', obrigado);
    const id = q.get('e');
    const s = q.get('s');
    const pedido = id && q.get('c') ? `e=${encodeURIComponent(id)}&c=${encodeURIComponent(q.get('c'))}${s ? `&s=${encodeURIComponent(s)}` : ''}` : s ? `s=${encodeURIComponent(s)}` : '';
    // a encomenda está feita: o carrinho e o que o finalizar guardou para o «voltar» já não servem
    const feita = () => { gravar([]); try { for (const k of ['franja:pagamento', 'franja:finalizar', 'franja:cupao']) sessionStorage.removeItem(k); } catch { /* sem armazenamento */ } };
    const simples = (n) => `<p>Recebemos a tua encomenda${n ? ` <strong>${esc(n)}</strong>` : ''}. Mandámos-te um email com o resumo; se não o vires, espreita o spam.</p>`;
    // aberta à mão (sem encomenda no endereço), não diz que recebeu nada
    if (!pedido) corpo.innerHTML = '<p>Aqui aparece a tua encomenda logo depois de a fazeres. Se já encomendaste, tens o resumo no teu email.</p>';
    else if (!API) corpo.innerHTML = simples(id);
    else {
      fetch(`${API}/encomenda?${pedido}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((e) => {
        // fechada sem pagamento (ou anulada, ou devolvida): diz-se isso, e o carrinho fica para tentar outra vez
        const FECHADAS = {
          anulada: 'Esta encomenda foi anulada. Se tiveres alguma dúvida, manda-nos mensagem.',
          expirou: 'O pagamento não se concluiu e a encomenda ficou sem efeito. Não se cobrou nada.',
          falhou: 'O pagamento falhou e não se cobrou nada. Podes encomendar outra vez.',
          reembolsada: 'O pagamento desta encomenda foi devolvido.',
        };
        if (FECHADAS[e.estado]) {
          $('h1', obrigado).textContent = 'A tua encomenda';
          corpo.innerHTML = `<p>A encomenda <strong>${esc(e.encomenda)}</strong>: ${FECHADAS[e.estado]}</p>`;
          return;
        }
        feita();
        const linhas = e.linhas.map((l) => `<li><span>${esc(l.nome)}${l.qtd > 1 ? ' × ' + l.qtd : ''}${l.escolhas?.length ? `<small>${l.escolhas.map(esc).join(' · ')}</small>` : ''}</span><b>${euro(l.total_cents / 100)}</b></li>`).join('');
        const pago = ['paga', 'pronta', 'enviada', 'levantada'].includes(e.estado);
        // pagou por Multibanco e a referência ainda não foi paga: a referência, para pagar já
        const mb = e.estado === 'pendente' && e.multibanco;
        const proximo = e.modo === 'online'
          ? (pago ? 'O pagamento entrou. Antes de produzirmos, mandamos-te a pré-visualização para aprovares.'
            : mb ? 'Falta pagar: usa a referência Multibanco abaixo, no multibanco ou na app do teu banco. Assim que o pagamento entrar, avisamos-te por email.'
              : 'Assim que o pagamento entrar, avisamos-te por email.')
          : 'Vamos confirmar a encomenda e combinar contigo o pagamento. Antes de produzirmos, mandamos-te a pré-visualização para aprovares.';
        const validade = mb && mb.validade ? new Date(mb.validade * 1000).toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' }) : '';
        const caixaMB = mb ? `<dl class="obrigado__multibanco" data-multibanco><dt>Entidade</dt><dd>${esc(mb.entidade)}</dd><dt>Referência</dt><dd>${esc(mb.referencia)}</dd><dt>Valor</dt><dd>${euro(e.total_cents / 100)}</dd>${validade ? `<dt>Válida até</dt><dd>${esc(validade)}</dd>` : ''}</dl>` : '';
        corpo.innerHTML = `<p>${e.cliente?.nome ? `${esc(e.cliente.nome)}, recebemos` : 'Recebemos'} a tua encomenda <strong>${esc(e.encomenda)}</strong>.</p><p>${proximo}</p>${caixaMB}
          <ul class="obrigado__linhas">${linhas}</ul>
          <dl class="obrigado__totais"><dt>Artigos</dt><dd>${euro(e.artigos_cents / 100)}</dd>${e.cupao && e.desconto_cents > 0 ? `<dt>Cupão ${esc(e.cupao)}</dt><dd>−${euro(e.desconto_cents / 100)}</dd>` : ''}<dt>Portes</dt><dd>${e.portes_por_confirmar ? 'A confirmar' : e.portes_cents ? euro(e.portes_cents / 100) : e.cupao_portes ? 'Grátis (cupão)' : 'Grátis'}</dd><dt>Total</dt><dd>${euro(e.total_cents / 100)}${e.portes_por_confirmar ? ' + portes' : ''}</dd></dl>`;
      }).catch((estado) => {
        // não existe (um endereço inventado, ou de outra encomenda): não diz que recebeu nada, e o carrinho fica
        if (estado === 404) { corpo.innerHTML = '<p>Não encontrámos esta encomenda. Se acabaste de encomendar, tens o resumo no teu email.</p>'; return; }
        // sem rede: vinda da Stripe, só se chega aqui depois de pagar
        if (s) feita();
        corpo.innerHTML = simples(id);
      });
    }
    $('h1', obrigado).focus();
  }
})();
