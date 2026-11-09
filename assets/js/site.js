// Franja Kids — menu, filtros, ficha do produto, carrinho e finalizar. Sem dependências.
(() => {
  const BASE = document.body.dataset.base || '';
  const CHAVE = 'franja:carrinho:v1';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const euro = (n) => n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const anunciar = (t) => { const a = $('[data-anuncio]'); if (a) { a.textContent = ''; setTimeout(() => { a.textContent = t; }, 50); } };

  // ── Carrinho guardado no browser ──
  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE)) || []; } catch { return []; } };
  const gravar = (itens) => { try { localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch { /* sem armazenamento: o carrinho dura só esta página */ } contar(); };
  const chaveDe = (i) => JSON.stringify([i.slug, i.escolhas, i.texto || '', !!i.personalizar]);
  function contar() {
    const n = ler().reduce((s, i) => s + i.qtd, 0);
    $$('[data-carrinho-conta]').forEach((el) => { el.textContent = n; el.hidden = !n; });
    $$('[data-carrinho-ligacao]').forEach((el) => el.setAttribute('aria-label', n ? `Carrinho, ${n} ${n === 1 ? 'artigo' : 'artigos'}` : 'Carrinho'));
  }
  contar();
  addEventListener('pageshow', (e) => { if (e.persisted) { contar(); if ($('[data-carrinho]')) desenharCarrinho(); } });

  let catalogo = null;
  const obterCatalogo = async () => catalogo || (catalogo = await fetch(BASE + '/assets/catalogo.json').then((r) => r.json()));
  const precoDe = (i, cat) => {
    const p = cat[i.slug];
    if (!p || p.preco == null) return null;
    let v = p.preco;
    for (const [o, valor] of Object.entries(i.escolhas || {})) v += p.sup?.[o]?.[valor] || 0;
    if (p.pers?.opcional && i.personalizar) v += p.pers.suplemento;
    return Math.round(v * 100) / 100;
  };
  const fotoDe = (p) => `<picture><img src="${BASE}/assets/fotos/${p.foto}-360.jpg" alt="" width="360" height="450" loading="lazy"></picture>`;
  const escolhasDe = (i) => Object.entries(i.escolhas || {}).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ');
  const textoDe = (i, p) => (i.texto ? `<p class="item__texto">${esc(p.pers?.rotulo || 'Personalização')}: «${esc(i.texto)}»</p>` : '');
  const progresso = (el, subtotal, limite) => {
    if (!el || !limite) return;
    const falta = Math.max(0, limite - subtotal);
    el.innerHTML = (falta ? `<span>Faltam <strong>${euro(falta)}</strong> para portes grátis.</span>` : '<span><strong>Tens portes grátis.</strong></span>')
      + `<span class="progresso__barra" aria-hidden="true"><span style="width:${Math.min(100, (subtotal / limite) * 100)}%"></span></span>`;
  };

  // ── Menu do telemóvel ──
  const botaoMenu = $('[data-menu]');
  const painel = $('#menu-telemovel');
  if (botaoMenu && painel) {
    const fechar = () => { botaoMenu.setAttribute('aria-expanded', 'false'); painel.hidden = true; };
    botaoMenu.addEventListener('click', () => { const aberto = botaoMenu.getAttribute('aria-expanded') === 'true'; botaoMenu.setAttribute('aria-expanded', String(!aberto)); painel.hidden = aberto; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !painel.hidden) { fechar(); botaoMenu.focus(); } });
    matchMedia('(min-width: 1024px)').addEventListener('change', (m) => { if (m.matches) fechar(); });
  }

  // ── Diálogos: fechar e clicar fora ──
  $$('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-fechar]')) d.close(); });
  });

  // ── Filtros das linhas da loja (mudam no sítio; o endereço guarda a escolha) ──
  const filtros = $('[data-filtros]');
  if (filtros) {
    const grelha = $('[data-grelha]');
    const itens = $$('li', grelha);
    const estado = { categoria: '', ocasiao: '' };
    const q = new URLSearchParams(location.search);
    for (const k of Object.keys(estado)) if ($(`[data-filtro="${k}"][data-valor="${CSS.escape(q.get(k) || '')}"]`, filtros)) estado[k] = q.get(k) || '';
    const aplicar = (escrever) => {
      $$('[data-filtro]', filtros).forEach((b) => b.setAttribute('aria-pressed', String(estado[b.dataset.filtro] === b.dataset.valor)));
      let n = 0;
      for (const li of itens) {
        const ok = (!estado.categoria || li.dataset.categoria === estado.categoria) && (!estado.ocasiao || li.dataset.ocasiao.split(' ').includes(estado.ocasiao));
        li.hidden = !ok; n += ok;
      }
      $('[data-contagem]').textContent = `${n} ${n === 1 ? 'artigo' : 'artigos'}`;
      $('[data-vazio]').hidden = n > 0;
      if (escrever) {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(estado)) if (v) p.set(k, v);
        history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
      }
    };
    filtros.addEventListener('click', (e) => {
      const b = e.target.closest('[data-filtro]');
      if (!b) return;
      estado[b.dataset.filtro] = b.dataset.valor;
      aplicar(true);
    });
    $('[data-limpar]')?.addEventListener('click', () => { estado.categoria = ''; estado.ocasiao = ''; aplicar(true); });
    aplicar(false);
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
      let v = dados.preco || 0;
      $$('input[type="radio"]:checked', ficha).forEach((r) => { v += Number(r.dataset.suplemento) || 0; });
      if (caixa?.checked) v += Number(caixa.dataset.suplemento) || 0;
      return Math.round(v * 100) / 100;
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
    const contar = () => {
      if (!campo) return true;
      const max = Number(campo.dataset.max);
      const n = [...campo.value].length;
      const c = $('[data-contador]', ficha);
      const passou = n > max;
      c.textContent = passou ? `${n - max} ${n - max === 1 ? 'caractere' : 'caracteres'} a mais` : `${max - n} de ${max} caracteres disponíveis`;
      c.classList.toggle('campo__contador--erro', passou);
      return !passou;
    };
    campo?.addEventListener('input', () => { contar(); campo.removeAttribute('aria-invalid'); $('#texto-erro').textContent = ''; });
    contar();
    $('[data-menos]', ficha)?.addEventListener('click', () => { qtd.value = Math.max(1, (parseInt(qtd.value, 10) || 1) - 1); actualizar(); });
    $('[data-mais]', ficha)?.addEventListener('click', () => { qtd.value = Math.min(20, (parseInt(qtd.value, 10) || 1) + 1); actualizar(); });
    qtd?.addEventListener('input', actualizar);
    actualizar();

    ficha.addEventListener('submit', async (e) => {
      e.preventDefault();
      let primeiro = null;
      for (const f of $$('[data-opcao][data-obrigatoria]', ficha)) {
        const r = $('input:checked', f);
        $('[data-erro]', f).textContent = r ? '' : `Escolhe ${f.dataset.opcao === 'Tamanho' ? 'o tamanho' : 'uma opção'}.`;
        if (!r && !primeiro) primeiro = $('input', f);
      }
      if (campo && !blocoTexto.hidden) {
        const vazio = !campo.value.trim();
        const precisa = campo.hasAttribute('data-obrigatorio') || caixa?.checked;
        let msg = '';
        if (precisa && vazio) msg = 'Escreve o texto para personalizarmos.';
        else if (!contar()) msg = `Usa no máximo ${campo.dataset.max} caracteres.`;
        $('#texto-erro').textContent = msg;
        if (msg) { campo.setAttribute('aria-invalid', 'true'); primeiro ||= campo; }
      }
      if (primeiro) { primeiro.focus(); return; }
      const item = {
        slug: dados.slug,
        escolhas: Object.fromEntries($$('[data-opcao]', ficha).map((f) => [f.dataset.opcao, $('input:checked', f)?.value]).filter(([, v]) => v)),
        texto: campo && !blocoTexto.hidden ? campo.value.trim().replace(/\s+/g, ' ') : '',
        personalizar: !!caixa?.checked,
        qtd: Math.min(20, Math.max(1, parseInt(qtd.value, 10) || 1)),
      };
      const itens = ler();
      const igual = itens.find((i) => chaveDe(i) === chaveDe(item));
      if (igual) igual.qtd = Math.min(20, igual.qtd + item.qtd); else itens.push(item);
      gravar(itens);
      anunciar(`Juntámos ao carrinho: ${dados.nome}.`);
      await abrirGaveta(item);
    });
  }

  async function abrirGaveta(item) {
    const g = $('#gaveta');
    if (!g) return;
    const cat = await obterCatalogo();
    const p = cat[item.slug];
    const preco = precoDe(item, cat);
    $('[data-gaveta-corpo]', g).innerHTML = `<div class="item"><div class="item__foto">${fotoDe(p)}</div><div><h3>${esc(p.nome)}</h3><p class="item__escolhas">${escolhasDe(item)}${item.qtd > 1 ? ' · ' + item.qtd + ' unidades' : ''}</p>${textoDe(item, p)}</div><p class="item__preco">${preco == null ? '' : euro(preco * item.qtd)}</p></div>`;
    const subtotal = ler().reduce((s, i) => s + (precoDe(i, cat) || 0) * i.qtd, 0);
    progresso($('[data-progresso]', g), subtotal, Number($('[data-portes-gratis]')?.dataset.portesGratis) || 50);
    g.showModal();
  }

  // ── Página do carrinho ──
  async function desenharCarrinho() {
    const raiz = $('[data-carrinho]');
    const cat = await obterCatalogo();
    const itens = ler().filter((i) => cat[i.slug] && cat[i.slug].preco != null);
    const lista = $('[data-itens]', raiz);
    const resumo = $('[data-resumo]', raiz);
    if (!itens.length) {
      lista.innerHTML = `<p class="vazio">O carrinho está vazio. <a href="${BASE}/personalizados/">Ver os personalizados</a></p>`;
      resumo.hidden = true;
      return;
    }
    lista.innerHTML = itens.map((i, k) => {
      const p = cat[i.slug];
      return `<div class="item"><div class="item__foto">${fotoDe(p)}</div><div><h3><a href="${BASE}/produtos/${i.slug}/">${esc(p.nome)}</a></h3><p class="item__escolhas">${escolhasDe(i)}${p.pers?.opcional && i.personalizar ? ' · com nome' : ''}</p>${textoDe(i, p)}
        <div class="item__accoes"><div class="quantidade"><button type="button" data-menos="${k}" aria-label="Diminuir a quantidade">−</button><input type="text" inputmode="numeric" value="${i.qtd}" aria-label="Quantidade" data-qtd="${k}"><button type="button" data-mais="${k}" aria-label="Aumentar a quantidade">+</button></div><button class="item__remover" type="button" data-remover="${k}">Remover</button></div></div>
        <p class="item__preco">${euro(precoDe(i, cat) * i.qtd)}</p></div>`;
    }).join('');
    const subtotal = itens.reduce((s, i) => s + precoDe(i, cat) * i.qtd, 0);
    $('[data-subtotal]', raiz).textContent = euro(subtotal);
    $('[data-portes]', raiz).textContent = subtotal >= Number(raiz.dataset.portesGratis) ? 'Grátis' : 'No passo seguinte';
    progresso($('[data-progresso]', raiz), subtotal, Number(raiz.dataset.portesGratis));
    resumo.hidden = false;
  }
  const raizCarrinho = $('[data-carrinho]');
  if (raizCarrinho) {
    desenharCarrinho();
    raizCarrinho.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const itens = ler();
      const k = Number(b.dataset.menos ?? b.dataset.mais ?? b.dataset.remover);
      if (Number.isNaN(k) || !itens[k]) return;
      if ('remover' in b.dataset) { const [fora] = itens.splice(k, 1); anunciar(`Removido: ${fora.slug.replace(/-/g, ' ')}.`); }
      else if ('menos' in b.dataset) itens[k].qtd = Math.max(1, itens[k].qtd - 1);
      else itens[k].qtd = Math.min(20, itens[k].qtd + 1);
      gravar(itens);
      desenharCarrinho();
    });
    raizCarrinho.addEventListener('change', (e) => {
      if (!e.target.matches('[data-qtd]')) return;
      const itens = ler();
      itens[Number(e.target.dataset.qtd)].qtd = Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1));
      gravar(itens);
      desenharCarrinho();
    });
  }

  // ── Finalizar ──
  const form = $('[data-finalizar]');
  if (form) {
    const tituloOriginal = document.title;
    const desenhar = async () => {
      const cat = await obterCatalogo();
      const itens = ler().filter((i) => cat[i.slug] && cat[i.slug].preco != null);
      if (!itens.length) { location.replace(BASE + '/carrinho/'); return; }
      $('[data-itens-resumo]', form).innerHTML = itens.map((i) => { const p = cat[i.slug]; return `<div class="item"><div class="item__foto">${fotoDe(p)}</div><div><h3>${esc(p.nome)}${i.qtd > 1 ? ' × ' + i.qtd : ''}</h3><p class="item__escolhas">${escolhasDe(i)}</p>${textoDe(i, p)}</div><p class="item__preco">${euro(precoDe(i, cat) * i.qtd)}</p></div>`; }).join('');
      const subtotal = itens.reduce((s, i) => s + precoDe(i, cat) * i.qtd, 0);
      const envio = $('input[name="envio"]:checked', form);
      const gratis = subtotal >= Number(form.dataset.portesGratis);
      const preco = envio.dataset.preco === '' ? null : Number(envio.dataset.preco);
      const portes = preco === 0 || (gratis && envio.value === 'ctt') ? 0 : preco;
      $('[data-subtotal]', form).textContent = euro(subtotal);
      $('[data-portes]', form).textContent = portes === 0 ? 'Grátis' : portes == null ? 'A confirmar' : euro(portes);
      $('[data-total]', form).textContent = portes == null ? `${euro(subtotal)} + portes` : euro(subtotal + portes);
      $('[data-aviso-personalizado]', form).hidden = !itens.some((i) => cat[i.slug].semDevolucao || i.personalizar);
      $('[data-morada]', form).hidden = envio.value === 'valongo';
    };
    desenhar();
    form.addEventListener('change', (e) => {
      if (e.target.name === 'envio') desenhar();
      if (e.target.matches('[data-oferta]')) $('[data-mensagem]', form).hidden = !e.target.checked;
      if (e.target.matches('input')) { e.target.removeAttribute('aria-invalid'); const err = $('#' + (e.target.id || e.target.name) + '-erro'); if (err) err.textContent = ''; }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
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
      verificar('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email')), 'Escreve um email como nome@exemplo.pt.');
      verificar('telemovel', v('telemovel').replace(/\D/g, '').length >= 9, 'Escreve o telemóvel com 9 algarismos.');
      if (!$('[data-morada]', form).hidden) {
        verificar('nome', !!v('nome'), 'Escreve o nome de quem recebe.');
        verificar('morada', !!v('morada'), 'Escreve a morada.');
        verificar('codigo-postal', /^\d{4}-?\d{3}$/.test(v('codigo-postal')) || $('input[name="envio"]:checked', form).value === 'estrangeiro', 'Escreve o código postal como 4440-000.');
        verificar('localidade', !!v('localidade'), 'Escreve a localidade.');
      }
      verificar('termos', form.elements.termos.checked, 'Para encomendar, aceita os termos e condições.');
      const caixa = $('[data-resumo-erros]', form);
      if (erros.length) {
        $('ul', caixa).innerHTML = erros.map(([id, m]) => `<li><a href="#${id === 'termos' ? 'termos-erro' : id}">${esc(m)}</a></li>`).join('');
        caixa.hidden = false;
        document.title = 'Erro: ' + tituloOriginal;
        caixa.focus();
        return;
      }
      caixa.hidden = true;
      document.title = tituloOriginal;
      $('#pre-visualizacao').showModal();
    });
  }
})();
