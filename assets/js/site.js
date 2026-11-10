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
  const ler = () => { try { const v = JSON.parse(localStorage.getItem(CHAVE)); return Array.isArray(v) ? v : []; } catch { return []; } };
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

  let catalogo = null;
  const obterCatalogo = async (fresco = false) => {
    if (catalogo && !fresco) return catalogo;
    catalogo = await fetch(BASE + '/assets/catalogo.json', fresco ? { cache: 'no-store' } : {}).then((r) => r.json());
    return catalogo;
  };
  /* O preço de uma unidade, em cêntimos, ou null se o produto já não se vende ou a escolha já não
     existe (o produto mudou no painel): essas linhas saem do carrinho. */
  const unidade = (i, cat) => {
    const p = cat.produtos[i.slug];
    if (!p || typeof p.preco !== 'number') return null;
    if (p.tamanhos.length && !p.tamanhos.includes(i.tamanho)) return null;
    if (p.cores.length && !p.cores.some((c) => c.nome === i.cor)) return null;
    let v = cents(p.preco);
    for (const g of p.opcoes) {
      const escolhido = (i.opcoes || {})[g.nome];
      const valor = g.valores.find((x) => x.nome === escolhido) || (escolhido == null ? g.valores.find((x) => !x.suplemento) : null);
      if (!valor) return null;
      v += cents(valor.suplemento);
    }
    if (p.personalizacao?.opcional && i.personalizar) v += cents(p.personalizacao.suplemento);
    return v;
  };
  const validos = (cat) => ler().filter((i) => unidade(i, cat) != null);
  const fotoDe = (p) => `<picture><img src="${esc(p.foto)}" alt="" width="360" height="480" loading="lazy"></picture>`;
  const escolhasDe = (i, p) => [i.tamanho && `Tamanho: ${i.tamanho}`, i.cor && `Cor: ${i.cor}`, ...Object.entries(i.opcoes || {}).map(([k, v]) => `${k}: ${v}`)]
    .filter(Boolean).map(esc).join(' · ') + (p.personalizacao?.opcional && i.personalizar ? ` · ${esc(p.personalizacao.opcional)}` : '');
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
    const mostrarMenu = (aberto) => { botaoMenu.setAttribute('aria-expanded', String(aberto)); painel.hidden = !aberto; document.documentElement.classList.toggle('menu-aberto', aberto); };
    botaoMenu.addEventListener('click', () => mostrarMenu(botaoMenu.getAttribute('aria-expanded') !== 'true'));
    painel.addEventListener('click', (e) => { if (e.target.closest('a')) mostrarMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !painel.hidden) { mostrarMenu(false); botaoMenu.focus(); } });
    matchMedia('(min-width: 1024px)').addEventListener('change', (m) => { if (m.matches) mostrarMenu(false); });
    // ao voltar atrás (bfcache), a página volta como estava: com o menu fechado
    addEventListener('pageshow', (e) => { if (e.persisted) mostrarMenu(false); });
  }

  // ── Diálogos: fechar e clicar fora ──
  $$('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-fechar]')) d.close(); });
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
    const actualizar = () => {
      $$('[data-opcao]', ficha).forEach((f) => { const r = $('input:checked', f); $('[data-escolhido]', f).textContent = r ? '· ' + r.value : ''; });
      if (total) total.textContent = euro(unitario() * Math.max(1, parseInt(qtd?.value, 10) || 1));
    };
    ficha.addEventListener('change', (e) => {
      if (e.target.matches('input[type="radio"]')) {
        const f = e.target.closest('[data-opcao]');
        $('[data-erro]', f).textContent = '';
        if (e.target.dataset.foto != null) mostrar(e.target.dataset.foto);
      }
      if (e.target === caixa) { blocoTexto.hidden = !caixa.checked; if (caixa.checked) campo.focus(); }
      actualizar();
    });
    const contarLetras = () => {
      if (!campo) return true;
      const max = Number(campo.dataset.max);
      const n = [...campo.value].length;
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
        texto: campo && !blocoTexto.hidden ? campo.value.replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim() : '',
        personalizar: !!caixa?.checked,
        qtd: Math.min(MAX_QTD, Math.max(1, parseInt(qtd.value, 10) || 1)),
      };
      for (const k of ['tamanho', 'cor']) if (!item[k]) delete item[k];
      const itens = ler();
      const igual = itens.find((i) => chaveDe(i) === chaveDe(item));
      if (igual) igual.qtd = Math.min(MAX_QTD, igual.qtd + item.qtd); else itens.push(item);
      gravar(itens);
      anunciar(`Juntámos ao carrinho: ${dados.nome}.`);
      await abrirGaveta(item);
    });
  }

  async function abrirGaveta(item) {
    const g = $('#gaveta');
    if (!g) return;
    const cat = await obterCatalogo();
    const p = cat.produtos[item.slug];
    const u = unidade(item, cat);
    if (!p || u == null) return;
    $('[data-gaveta-corpo]', g).innerHTML = `<div class="item"><div class="item__foto">${fotoDe(p)}</div><div><h3>${esc(p.nome)}</h3><p class="item__escolhas">${escolhasDe(item, p)}${item.qtd > 1 ? ' · ' + item.qtd + ' unidades' : ''}</p>${textoDe(item, p)}</div><p class="item__preco">${euro((u * item.qtd) / 100)}</p></div>`;
    const subtotal = validos(cat).reduce((s, i) => s + unidade(i, cat) * i.qtd, 0) / 100;
    progresso($('[data-progresso]', g), subtotal, cat.gratisAPartirDe);
    g.showModal();
  }

  // ── Página do carrinho ──
  async function desenharCarrinho() {
    const raiz = $('[data-carrinho]');
    const cat = await obterCatalogo();
    const itens = validos(cat);
    const lista = $('[data-itens]', raiz);
    const resumo = $('[data-resumo]', raiz);
    if (!itens.length) {
      lista.innerHTML = `<p class="vazio">O carrinho está vazio. <a href="${BASE}/personalizados/">Ver os personalizados</a></p>`;
      resumo.hidden = true;
      return;
    }
    lista.innerHTML = itens.map((i, k) => {
      const p = cat.produtos[i.slug];
      return `<div class="item"><div class="item__foto">${fotoDe(p)}</div><div><h3><a href="${esc(p.url)}">${esc(p.nome)}</a></h3><p class="item__escolhas">${escolhasDe(i, p)}</p>${textoDe(i, p)}
        <div class="item__accoes"><div class="quantidade"><button type="button" data-menos="${k}" aria-label="Diminuir a quantidade">−</button><input type="text" inputmode="numeric" value="${i.qtd}" aria-label="Quantidade" data-qtd="${k}"><button type="button" data-mais="${k}" aria-label="Aumentar a quantidade">+</button></div><button class="item__remover" type="button" data-remover="${k}">Remover</button></div></div>
        <p class="item__preco">${euro((unidade(i, cat) * i.qtd) / 100)}</p></div>`;
    }).join('');
    const subtotal = itens.reduce((s, i) => s + unidade(i, cat) * i.qtd, 0) / 100;
    $('[data-subtotal]', raiz).textContent = euro(subtotal);
    $('[data-portes]', raiz).textContent = 'No passo seguinte';
    progresso($('[data-progresso]', raiz), subtotal, cat.gratisAPartirDe);
    resumo.hidden = false;
  }
  const raizCarrinho = $('[data-carrinho]');
  if (raizCarrinho) {
    desenharCarrinho();
    // as linhas que já não se vendem saem do carrinho guardado (os índices são os da lista desenhada)
    const mexer = async (fn) => { const cat = await obterCatalogo(); const itens = validos(cat); fn(itens); gravar(itens); desenharCarrinho(); };
    raizCarrinho.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const k = Number(b.dataset.menos ?? b.dataset.mais ?? b.dataset.remover);
      if (Number.isNaN(k)) return;
      mexer((itens) => {
        if (!itens[k]) return;
        if ('remover' in b.dataset) { const [fora] = itens.splice(k, 1); anunciar(`Removido: ${catalogo.produtos[fora.slug]?.nome || ''}.`); }
        else if ('menos' in b.dataset) itens[k].qtd = Math.max(1, itens[k].qtd - 1);
        else itens[k].qtd = Math.min(MAX_QTD, itens[k].qtd + 1);
      });
    });
    raizCarrinho.addEventListener('change', (e) => {
      if (!e.target.matches('[data-qtd]')) return;
      const k = Number(e.target.dataset.qtd);
      mexer((itens) => { if (itens[k]) itens[k].qtd = Math.min(MAX_QTD, Math.max(1, parseInt(e.target.value, 10) || 1)); });
    });
  }

  // ── Finalizar ──
  const form = $('[data-finalizar]');
  if (form) {
    const tituloOriginal = document.title;
    const botao = $('[data-enviar]', form);
    const erroEnvio = $('[data-erro-envio]', form);
    let totalMostrado = null;
    const zonaEscolhida = () => $('input[name="envio"]:checked', form);
    const desenhar = async (fresco = false) => {
      const cat = await obterCatalogo(fresco);
      const itens = validos(cat);
      if (!itens.length) { location.replace(BASE + '/carrinho/'); return; }
      $('[data-itens-resumo]', form).innerHTML = itens.map((i) => { const p = cat.produtos[i.slug]; return `<div class="item"><div class="item__foto">${fotoDe(p)}</div><div><h3>${esc(p.nome)}${i.qtd > 1 ? ' × ' + i.qtd : ''}</h3><p class="item__escolhas">${escolhasDe(i, p)}</p>${textoDe(i, p)}</div><p class="item__preco">${euro((unidade(i, cat) * i.qtd) / 100)}</p></div>`; }).join('');
      const artigos = itens.reduce((s, i) => s + unidade(i, cat) * i.qtd, 0);
      const zona = cat.zonas.find((z) => z.id === zonaEscolhida().value);
      let portes = zona && typeof zona.portes === 'number' ? cents(zona.portes) : null;
      if (portes != null && zona.id === 'continente' && typeof cat.gratisAPartirDe === 'number' && artigos >= cents(cat.gratisAPartirDe)) portes = 0;
      totalMostrado = portes == null ? artigos : artigos + portes;
      $('[data-subtotal]', form).textContent = euro(artigos / 100);
      $('[data-portes]', form).textContent = portes === 0 ? 'Grátis' : portes == null ? 'A confirmar' : euro(portes / 100);
      $('[data-total]', form).textContent = portes == null ? `${euro(artigos / 100)} + portes` : euro(totalMostrado / 100);
      $('[data-aviso-personalizado]', form).hidden = !itens.some((i) => i.texto);
      const z = zonaEscolhida().value;
      $('[data-morada]', form).hidden = z === 'mao';
      $('[data-pais]', form).hidden = z !== 'estrangeiro';
      return itens;
    };
    desenhar();
    form.addEventListener('change', (e) => {
      if (e.target.name === 'envio') desenhar();
      if (e.target.matches('[data-oferta]')) $('[data-mensagem]', form).hidden = !e.target.checked;
      if (e.target.matches('input')) { e.target.removeAttribute('aria-invalid'); const err = $('#' + (e.target.id || e.target.name) + '-erro'); if (err) err.textContent = ''; }
    });
    const mostrarErros = (erros) => {
      const caixa = $('[data-resumo-erros]', form);
      $('ul', caixa).innerHTML = erros.map(([id, m]) => `<li><a href="#${id === 'termos' ? 'termos-erro' : id}">${esc(m)}</a></li>`).join('');
      caixa.hidden = false;
      document.title = 'Erro: ' + tituloOriginal;
      caixa.focus();
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (botao.disabled) return;
      erroEnvio.textContent = '';
      const erros = [];
      const verificar = (id, ok, msg) => {
        const el = form.elements[id];
        const err = $('#' + id + '-erro');
        if (ok) { el?.removeAttribute?.('aria-invalid'); if (err) err.textContent = ''; return; }
        el?.setAttribute?.('aria-invalid', 'true');
        if (err) err.textContent = msg;
        erros.push([id, msg]);
      };
      const v = (id) => (form.elements[id]?.value || '').trim();
      const zona = zonaEscolhida().value;
      verificar('nome', !!v('nome'), 'Escreve o teu nome.');
      verificar('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email')), 'Escreve um email como nome@exemplo.pt.');
      verificar('telemovel', v('telemovel').replace(/\D/g, '').length >= 9, 'Escreve o telemóvel com 9 algarismos.');
      verificar('nif', !v('nif') || /^\d{9}$/.test(v('nif').replace(/\s/g, '')), 'O NIF tem 9 algarismos (ou deixa em branco).');
      if (zona !== 'mao') {
        verificar('morada', !!v('morada'), 'Escreve a morada.');
        verificar('codigo-postal', zona === 'estrangeiro' ? !!v('codigo-postal') : /^\d{4}-?\d{3}$/.test(v('codigo-postal')), zona === 'estrangeiro' ? 'Escreve o código postal.' : 'Escreve o código postal como 4440-000.');
        verificar('localidade', !!v('localidade'), 'Escreve a localidade.');
        if (zona === 'estrangeiro') verificar('pais', !!v('pais'), 'Escreve o país.');
      }
      verificar('termos', form.elements.termos.checked, 'Para encomendar, aceita os termos e condições.');
      if (erros.length) { mostrarErros(erros); return; }
      $('[data-resumo-erros]', form).hidden = true;
      document.title = tituloOriginal;

      const itens = await desenhar();
      if (!itens) return;
      // a pré-visualização, sem o Worker das encomendas no ar: confere tudo e não envia nada
      if (!API) { $('#pre-visualizacao')?.showModal(); return; }
      const cp = v('codigo-postal');
      const pedido = {
        linhas: itens.map((i) => ({ produto: i.slug, ...(i.tamanho ? { tamanho: i.tamanho } : {}), ...(i.cor ? { cor: i.cor } : {}), opcoes: i.opcoes || {}, personalizar: !!i.personalizar, texto: i.texto || '', qtd: i.qtd })),
        entrega: zona,
        cliente: {
          nome: v('nome'), email: v('email'), telefone: v('telemovel'),
          ...(v('nif') ? { nif: v('nif').replace(/\s/g, '') } : {}),
          ...(zona !== 'mao' ? { morada: v('morada'), codigoPostal: zona === 'estrangeiro' ? cp : cp.replace(/^(\d{4})(\d{3})$/, '$1-$2'), localidade: v('localidade') } : {}),
          ...(zona === 'estrangeiro' ? { pais: v('pais') } : {}),
        },
        oferta: !!form.elements.oferta.checked,
        ...(form.elements.oferta.checked && v('mensagem') ? { mensagem: v('mensagem') } : {}),
        ...(v('notas') ? { notas: v('notas') } : {}),
        termos: true,
        total_cents: totalMostrado,
      };
      botao.disabled = true;
      const textoBotao = botao.textContent;
      botao.textContent = 'A enviar…';
      try {
        const r = await fetch(API + '/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido) });
        const resposta = await r.json().catch(() => ({}));
        if (r.ok && resposta.url) { location.assign(resposta.url); return; }
        if (r.ok && resposta.encomenda) {
          gravar([]);
          location.assign(`${BASE}/obrigado/?e=${encodeURIComponent(resposta.encomenda)}&c=${encodeURIComponent(resposta.chave)}`);
          return;
        }
        if (r.status === 409) { await desenhar(true); erroEnvio.textContent = resposta.erro || 'Os preços mudaram. Confirma o total e envia outra vez.'; }
        else if (r.status === 400 && resposta.campo && form.elements[{ codigoPostal: 'codigo-postal', telefone: 'telemovel' }[resposta.campo] || resposta.campo]) {
          const id = { codigoPostal: 'codigo-postal', telefone: 'telemovel' }[resposta.campo] || resposta.campo;
          verificar(id, false, resposta.erro);
          mostrarErros(erros);
        } else erroEnvio.textContent = resposta.erro || 'Não conseguimos enviar a encomenda. Tenta outra vez daqui a pouco, ou manda-nos mensagem.';
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
    const pedido = id && q.get('c') ? `e=${encodeURIComponent(id)}&c=${encodeURIComponent(q.get('c'))}` : q.get('s') ? `s=${encodeURIComponent(q.get('s'))}` : '';
    if (q.get('s')) gravar([]);  // voltou da Stripe: o carrinho já foi
    const simples = (n) => `<p>Recebemos a tua encomenda${n ? ` <strong>${esc(n)}</strong>` : ''}. Mandámos-te um email com o resumo; se não o vires, espreita o spam.</p>`;
    if (!pedido || !API) corpo.innerHTML = simples(id);
    else {
      fetch(`${API}/encomenda?${pedido}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((e) => {
        const linhas = e.linhas.map((l) => `<li><span>${esc(l.nome)}${l.qtd > 1 ? ' × ' + l.qtd : ''}${l.escolhas?.length ? `<small>${l.escolhas.map(esc).join(' · ')}</small>` : ''}</span><b>${euro(l.total_cents / 100)}</b></li>`).join('');
        const pago = ['paga', 'pronta', 'enviada', 'levantada'].includes(e.estado);
        const proximo = e.modo === 'online'
          ? (pago ? 'O pagamento entrou. Antes de produzirmos, mandamos-te a pré-visualização para aprovares.' : 'Assim que o pagamento entrar, avisamos-te por email.')
          : 'Vamos confirmar a encomenda e combinar contigo o pagamento. Antes de produzirmos, mandamos-te a pré-visualização para aprovares.';
        corpo.innerHTML = `<p>${e.cliente?.nome ? `${esc(e.cliente.nome)}, recebemos` : 'Recebemos'} a tua encomenda <strong>${esc(e.encomenda)}</strong>.</p><p>${proximo}</p>
          <ul class="obrigado__linhas">${linhas}</ul>
          <dl class="obrigado__totais"><dt>Artigos</dt><dd>${euro(e.artigos_cents / 100)}</dd><dt>Portes</dt><dd>${e.portes_por_confirmar ? 'A confirmar' : e.portes_cents ? euro(e.portes_cents / 100) : 'Grátis'}</dd><dt>Total</dt><dd>${euro(e.total_cents / 100)}${e.portes_por_confirmar ? ' + portes' : ''}</dd></dl>`;
      }).catch(() => { corpo.innerHTML = simples(id); });
    }
    $('h1', obrigado).focus();
  }
})();
