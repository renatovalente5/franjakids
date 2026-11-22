// Páginas de ajuda e legais. Os dados da empresa, os prazos e os portes vêm de content/loja.json (o painel
// edita-os; o que ainda não foi dito aparece «[por confirmar: …]» na pré-visualização, e em produção
// as regras param a publicação antes de chegar aqui); os textos da lei vêm da legal-comum. Os textos das
// páginas «Como funciona» e «Envios e prazos» são os da loja (o pedido de 20 nov 2026).
import {
  COMO_SE_FAZ_A_ENCOMENDA, LIVRE_RESOLUCAO, SEM_LIVRE_RESOLUCAO_PERSONALIZADO, FORMULARIO_LIVRE_RESOLUCAO, formularioLivreResolucao,
  textoGarantia, ralHtml, destinatariosHtml, direitosHtml, notaChamada, BOTAO_ENCOMENDA,
} from '../legal-comum/index.mjs';
import { url, esc, euro, euroRedondo, icone, porConfirmar } from './util.mjs';
import { MEIOS_ONLINE, zonaSobConsulta } from './lib/regras.mjs';
import { texto, coracao, mensagemInstagram } from './paginas.mjs';

const valor = (v, falta) => (typeof v === 'string' && v.trim() ? esc(v.trim()) : porConfirmar(falta));
/* A morada com «4100-083 Porto» junto: o código postal e a localidade não se partem em duas linhas. */
const moradaJunta = (html) => html.replace(/(\d{4}-\d{3}) /, '$1&nbsp;');
/* O telefone com o custo da chamada ao lado (DL 59/2021; a forma «Chamada para a rede…» que o Renato usa nos sites). */
const telefone = (t) => { const n = notaChamada(t, { frase: 'com-a' }); return `${esc(t)}${n ? ` <small>(${n.charAt(0).toLowerCase() + n.slice(1)})</small>` : ''}`; };
/* A conversa no WhatsApp com o telemóvel da loja (só um número móvel português tem WhatsApp por certo). */
const ligacaoWhatsapp = (t) => { const d = String(t || '').replace(/\D/g, ''); const n = /^9\d{8}$/.test(d) ? `351${d}` : d; return /^3519\d{8}$/.test(n) ? `https://wa.me/${n}` : null; };
const identificacao = (e) => `<ul>
  <li>Nome: ${valor(e.nome, 'nome ou firma')}</li>
  <li>NIF: ${valor(e.nif, 'NIF')}</li>
  <li>Morada: ${moradaJunta(valor(e.morada, 'morada'))}</li>
  <li>Email: ${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : porConfirmar('email')}</li>
  ${e.telefone ? `<li>Telefone: ${telefone(e.telefone)}</li>` : ''}
</ul>`;

const cartoes = (itens, classe = '') => `<ul class="cartoes-ajuda${classe ? ` ${classe}` : ''}">${itens.map(([i, t, d]) => `<li><span class="passos__icone">${icone(i)}</span><div><h2>${t}</h2><p>${d}</p></div></li>`).join('')}</ul>`;

export function paginasDeTexto(loja) {
  const e = loja.empresa;
  const ent = loja.entrega;
  const zona = (id) => ent.zonas.find((z) => z.id === id);
  const mao = zona('mao') && !zonaSobConsulta(zona('mao')) ? zona('mao') : null;
  const online = loja.pagamentos?.modo === 'online';
  const gratis = typeof ent.gratisAPartirDe === 'number' ? euroRedondo(ent.gratisAPartirDe) : null;
  const producao = esc(loja.producao);
  const preparacao = typeof loja.preparacao === 'string' && loja.preparacao.trim() ? esc(loja.preparacao.trim()) : porConfirmar('preparação dos artigos sem personalização');
  const pagamentos = online ? [...MEIOS_ONLINE] : [];
  // «MB WAY, Multibanco, cartão, Apple Pay ou Google Pay»
  const meios = `${MEIOS_ONLINE.slice(0, -1).join(', ')} ou ${MEIOS_ONLINE.at(-1)}`;
  const botao = online ? BOTAO_ENCOMENDA : 'Enviar encomenda';
  const falarNoInstagram = `<div class="heroi__botoes"><a class="botao botao--cheio" href="${mensagemInstagram(loja)}">${coracao('Fala connosco no Instagram ♡')}</a></div>`;
  // os portes de uma zona, por extenso: «5,50 €», «gratuito», «sob consulta» (o continente sem portes é a falta que a lei não deixa)
  const portesDe = (z) => (zonaSobConsulta(z) ? (z.id === 'continente' ? porConfirmar('portes para Portugal continental') : 'sob consulta') : z.portes === 0 ? 'gratuito' : euro(z.portes));
  // pela ordem da lista da loja: o levantamento em mão antes dos restantes países
  const ordemDaLista = ['continente', 'ilhas', 'ue', 'mao', 'estrangeiro'];
  const listaDePortes = `<ul>${[...ent.zonas].sort((a, b) => ordemDaLista.indexOf(a.id) - ordemDaLista.indexOf(b.id)).flatMap((z) => [
    `<li>${z.id === 'mao' ? `Levantamento em mão em ${esc(ent.concelho)}` : esc(z.nome)}: ${portesDe(z)}.</li>`,
    ...(z.id === 'continente' && gratis ? [`<li>${esc(z.nome)}: portes grátis em compras iguais ou superiores a ${gratis}.</li>`] : []),
  ]).join('')}</ul>`;
  /* A lista das perguntas frequentes (o texto da loja de 21 nov 2026): o continente numa linha, com os portes
     grátis, e os restantes países antes do levantamento em mão. */
  const ordemDasPerguntas = ['continente', 'ilhas', 'ue', 'estrangeiro', 'mao'];
  const listaDasPerguntas = `<ul>${[...ent.zonas].sort((a, b) => ordemDasPerguntas.indexOf(a.id) - ordemDasPerguntas.indexOf(b.id)).map((z) =>
    `<li>${z.id === 'mao' ? `Levantamento em mão em ${esc(ent.concelho)}` : esc(z.nome)}: ${portesDe(z)}${z.id === 'continente' && gratis && !zonaSobConsulta(z) ? ` — grátis em compras a partir de ${gratis}` : ''}.</li>`).join('')}</ul>`;
  // as zonas para onde se envia com portes (as ilhas e a UE), e as sob consulta, para os termos
  const comPortes = ent.zonas.filter((z) => !zonaSobConsulta(z) && !['continente', 'mao'].includes(z.id));
  const sobConsulta = ent.zonas.filter((z) => zonaSobConsulta(z) && z.id !== 'continente');
  // «Para os Açores e a Madeira, e para os países da União Europeia, …» (o «e» de dentro de uma zona não se mistura)
  const juntar = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')}, e para ${l.at(-1)}` : l.join(''));
  // a zona numa frase: «para os Açores e a Madeira», «para os países da União Europeia», «para os restantes países»
  const comArtigo = (z) => ({ ilhas: 'os Açores e a Madeira', ue: 'os países da União Europeia', estrangeiro: 'os restantes países' })[z.id] || esc(z.nome);
  // «Como se faz a encomenda»: em modo «encomenda» o botão é outro e o pagamento combina-se depois
  /* (a revisão de 20 nov 2026) os meios com «ou» no fim; e o pagamento combinado tratado por «você», como o resto dos
     termos. (22 nov 2026) Os emails, tal como o Worker os manda (o texto comum prometia um aviso de recepção logo e, à
     parte, a confirmação com anexos): no modo online sai um só quando o pagamento entra, com o resumo, a desistência e
     a ligação para os termos (no Multibanco vem antes o da referência); no modo «encomenda», o resumo logo e outro
     quando o pagamento entrar. Se o texto comum mudar, a construção pára em vez de deixar a promessa antiga. */
  const AVISO_COMUM = 'Recebe logo um aviso de recepção por email e, até ao fim do próprio dia e sempre antes da entrega, a confirmação da encomenda com as condições inteiras em anexo.';
  const EMAILS = online
    ? 'Assim que o pagamento entra, recebe por email a confirmação da encomenda, com o resumo, as condições de desistência e a ligação para os termos e condições.'
    : 'Recebe logo por email o resumo da encomenda, com as condições de desistência e a ligação para os termos e condições, e outro email quando o pagamento entrar.';
  const comoSeFaz = () => {
    const comum = COMO_SE_FAZ_A_ENCOMENDA({ canal: 'site', pagamentos, linguas: ['português'], urlTermos: url('/termos/'), prazoConfirmacao: 'ao fim do próprio dia', arquivo: '10 anos' });
    if (!comum.includes(AVISO_COMUM)) throw new Error('legal-comum: a frase dos emails em «Como se faz a encomenda» mudou; rever src/textos.mjs');
    const h = comum
      .replace(`Pode pagar por ${MEIOS_ONLINE.join(', ')}.`, `Pode pagar por ${meios}.`)
      .replace(AVISO_COMUM, EMAILS);
    return online ? h : h.replace(`«${BOTAO_ENCOMENDA}».`, `«${botao}». O pagamento é combinado consigo depois de confirmarmos a encomenda, por MB WAY ou transferência.`);
  };
  const pagamentoHtml = online
    ? '<p>Podes realizar o pagamento diretamente no nosso site, através dos métodos disponíveis no momento da compra.</p>\n<p>Após a confirmação do pagamento, receberás um e-mail com os detalhes da tua encomenda.</p>'
    : `<p>A encomenda fica feita quando carregas em «${botao}». Depois confirmamos tudo contigo e combinamos o pagamento, por MB WAY ou transferência.</p>`;
  return [
    texto('/como-funciona/', 'Como funciona', 'Do pedido à tua porta, em quatro passos.', `
${cartoes([
  ['saco', '1. Escolhe o teu favorito', 'Explora a nossa coleção de roupa, acessórios e presentes para bebés, crianças e toda a família. Encontra o artigo perfeito para ti ou para ofereceres a alguém especial.'],
  ['lapis', '2. Personaliza ao teu gosto', 'Nos artigos personalizáveis, escolhe os detalhes disponíveis e acrescenta o nome ou a frase que torna a tua peça única.'],
  ['cartao', '3. Finaliza a tua encomenda', online
    ? 'Adiciona os teus artigos ao carrinho, confirma os dados e realiza o pagamento diretamente no nosso site, de forma simples e segura.'
    : `Adiciona os teus artigos ao carrinho, confirma os dados e carrega em «${botao}». Depois combinamos contigo o pagamento.`],
  ['carrinha', '4. Recebe com carinho', 'Preparamos cada encomenda com todo o cuidado e carinho. Assim que estiver pronta, segue viagem até ti!'],
])}
<h2>Pagamento</h2>
${pagamentoHtml}
<h2>${coracao('Precisas da tua encomenda para uma data especial? ♡')}</h2>
<p>Um nascimento, batizado, aniversário ou outra ocasião especial?</p>
<p>Os nossos artigos personalizados são preparados especialmente para ti, com todo o cuidado e carinho. Por isso, o prazo habitual de produção é de ${producao}, mais o tempo do envio.</p>
<p>Recomendamos que faças a tua encomenda com a maior antecedência possível, especialmente se tiveres uma data importante a cumprir.</p>
<h2>${coracao('Não encontraste o que procuravas? ♡')}</h2>
<p>Na Franja Kids, adoramos dar vida às tuas ideias!</p>
<p>Se procuras uma personalização diferente das que encontras no nosso site, tens uma ideia especial em mente ou precisas de confirmar se conseguimos entregar a tua encomenda a tempo de uma ocasião importante, estamos aqui para ajudar!</p>
<p>${coracao('Fala connosco através do Instagram. Teremos todo o gosto em conhecer a tua ideia, esclarecer as tuas dúvidas e ajudar-te a criar algo verdadeiramente especial. ♡')}</p>
${falarNoInstagram}`,
    'Como se encomenda na Franja Kids: escolher o artigo, personalizar com o nome ou a frase, finalizar a encomenda e receber em casa.'),

    texto('/como-personalizar/', 'Como personalizar', 'O nome, a frase e os detalhes que tornam a tua peça única.', `
${cartoes([
  ['saco', '1. Escolhe o artigo', 'Na página de cada artigo personalizável, escolhe o tamanho, a cor e as opções disponíveis.'],
  ['lapis', '2. Escreve o nome ou a frase', 'Escreve exatamente como queres que fique, com as maiúsculas e os acentos. Por baixo do campo vês quantos caracteres ainda podes usar.'],
  ['olho', '3. Confere', 'Fazemos a peça exatamente como escreves. Vê bem o nome, a frase, o tamanho e a cor antes de encomendar.'],
  ['coracao', '4. Feito para ti', `Cada peça personalizada leva ${producao} a ficar pronta.`],
])}
<h2>Personalização opcional</h2>
<p>Em alguns artigos, o nome é opcional: marca a caixa para o acrescentar, e o acréscimo aparece logo no preço.</p>
<h2>Trocas e devoluções</h2>
<p>Os artigos personalizados são feitos só para ti, por isso não têm troca nem devolução por desistência. <a href="${url('/trocas-e-devolucoes/')}">Trocas e devoluções</a></p>
<h2>${coracao('Tens outra ideia? ♡')}</h2>
<p>Se procuras uma personalização diferente das que encontras no site, fala connosco no Instagram: combinamos contigo e mandamos-te a pré-visualização antes de produzir.</p>
${falarNoInstagram}`,
    'Como personalizar na Franja Kids: escolher o artigo, escrever o nome ou a frase e conferir tudo antes de encomendar.'),

    texto('/envios/', 'Envios e prazos', 'Na Franja Kids, cada encomenda é preparada com todo o cuidado e carinho, para que chegue até ti da melhor forma possível. ♡', `
${cartoes([
  ['relogio', 'Produção e preparação', `Os artigos personalizados têm um prazo habitual de produção de ${producao}. Os artigos não personalizados são preparados para envio em ${preparacao}.`],
  ['carrinha', 'Portugal Continental', `Enviamos através dos CTT, em correio registado. Após a expedição, a entrega demora habitualmente até ${esc(ent.prazoContinente)}.`],
  ...(mao ? [['local', `Levantamento em mão em ${esc(ent.concelho)}`, 'Seleciona esta opção ao finalizar a compra e não pagues portes! Quando a tua encomenda estiver pronta, contactamos-te pelo WhatsApp para combinar o levantamento.']] : []),
  ['presente', 'Açores, Madeira e estrangeiro', 'Enviamos para as ilhas e para vários destinos internacionais. Os prazos de entrega variam consoante o destino.'],
])}
<p>Os prazos de transporte acrescem aos prazos de produção ou preparação. A página de cada artigo diz o prazo dele.</p>
<h2>Portes de envio</h2>
${listaDePortes}
<p>Os portes de envio são apresentados antes de finalizares a tua encomenda.</p>
<h2>${coracao('Envios para o resto do mundo ♡')}</h2>
<p>Gostavas de receber uma encomenda da Franja Kids fora da União Europeia?</p>
<p>Fala connosco através do Instagram! Teremos todo o gosto em verificar as possibilidades de envio, os portes e os prazos de entrega para o teu país.</p>
<p>Tem em atenção que os envios internacionais podem estar sujeitos a taxas alfandegárias ou impostos adicionais, conforme as regras do país de destino.</p>
${falarNoInstagram}`,
    `Prazos de produção e de envio, portes por CTT para Portugal, ilhas e União Europeia${mao ? `, e levantamento em mão em ${ent.concelho}` : ''}.`, { indexar: false }),

    texto('/trocas-e-devolucoes/', 'Trocas e devoluções', 'O que podes devolver, como, e o que fazer se alguma coisa chegar mal.', `
<h2>Artigos sem personalização</h2>
<p>${LIVRE_RESOLUCAO}</p>
<h2>Artigos personalizados</h2>
<p>${SEM_LIVRE_RESOLUCAO_PERSONALIZADO}</p>
<p>Por isso, confirma bem o nome, a frase, o tamanho e a cor antes de encomendares: fazemos a peça exatamente como escreves.</p>
<h2>Se chegar com defeito ou diferente do que pediste</h2>
<p>Diz-nos logo, com uma fotografia, e resolvemos. ${textoGarantia()}</p>
<h2>Como pedir</h2>
<p>Por email para ${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : porConfirmar('email')} ou por <a href="${mensagemInstagram(loja)}">mensagem no Instagram</a>. Também podes usar este formulário:</p>
<pre>${esc(e.nome && e.morada && e.email ? formularioLivreResolucao({ nome: e.nome.trim(), morada: e.morada.trim(), email: e.email.trim() }) : FORMULARIO_LIVRE_RESOLUCAO)}</pre>`,
    'Trocas e devoluções na Franja Kids: 14 dias nos artigos sem personalização; os personalizados não têm livre resolução.', { indexar: false }),

    /* O texto da loja (o Samuel, 21 nov 2026), com os prazos, os portes e o nome do levantamento lidos dos dados:
       o painel muda-os num sítio só. O pagamento só fala das opções do checkout quando o site recebe pagamentos. */
    texto('/perguntas-frequentes/', 'Perguntas frequentes', 'Encontra aqui as respostas às dúvidas mais comuns sobre encomendas, personalizações, pagamentos e envios. Se precisares de ajuda, estamos sempre por perto! ♡', `
<h2>Quanto tempo demora a minha encomenda?</h2>
<p>Cada peça é preparada com todo o carinho e atenção aos detalhes.</p>
<ul>
  <li>Artigos personalizados: o prazo de preparação é, geralmente, de ${producao}.</li>
  <li>Artigos sem personalização: o prazo de preparação é de ${preparacao}.</li>
</ul>
<p>Após o envio, a entrega em Portugal continental demora habitualmente até ${esc(ent.prazoContinente)}.</p>
<p>Os prazos de preparação e transporte são distintos e podem variar. A página de cada artigo diz o prazo dele.</p>
<h2>Quanto custam os portes de envio?</h2>
${listaDasPerguntas}
<p>Podes consultar todas as informações em <a href="${url('/envios/')}">Envios e prazos</a>.</p>
${mao ? `<h2>Posso levantar a minha encomenda em mão?</h2>
<p>${coracao('Claro que sim! ♡')}</p>
<p>Podes levantar a tua encomenda gratuitamente em ${esc(ent.concelho)}. Basta selecionares a opção «${esc(mao.nome)}» ao finalizar a compra.</p>
<p>Assim que estiver pronta, entraremos em contacto contigo para combinar a entrega.</p>` : ''}
<h2>Fazem envios internacionais?</h2>
${comPortes.some((z) => z.id === 'ue') ? `<p>${coracao('Sim! A Franja Kids também chega além-fronteiras. ♡')}</p>
<p>Enviamos para países da União Europeia, ${zona('ue').portes === 0 ? 'sem portes' : `com portes de ${euro(zona('ue').portes)}`}.</p>
<p>Para outros destinos, fala connosco antes de encomendares para confirmarmos a disponibilidade, os custos e os prazos de envio.</p>` : `<p>Fala connosco antes de encomendares para confirmarmos a disponibilidade, os custos e os prazos de envio.</p>`}
<h2>Como posso pagar a minha encomenda?</h2>
${online ? `<p>Podes consultar os métodos de pagamento disponíveis ao finalizar a tua encomenda.</p>
<p>O pagamento é realizado através das opções apresentadas no checkout, de forma simples e segura.</p>` : '<p>Depois de confirmarmos a encomenda, combinamos contigo o pagamento, por MB WAY ou transferência.</p>'}
<h2>Posso trocar ou devolver um artigo?</h2>
<p>Queremos que fiques feliz com a tua encomenda!</p>
<p>Nos artigos não personalizados, podes exercer o direito de livre resolução no prazo legal de 14 dias após a receção, nas condições previstas na nossa política de devoluções.</p>
<p>Os artigos feitos de acordo com as tuas especificações ou claramente personalizados estão, em regra, excluídos desse direito.</p>
<p>Se receberes um artigo com defeito ou diferente do encomendado, entra em contacto connosco para resolvermos a situação, respeitando os teus direitos legais.</p>
<p>Consulta a página <a href="${url('/trocas-e-devolucoes/')}">Trocas e devoluções</a> para mais informações.</p>
<h2>Como indico o nome ou a personalização que pretendo?</h2>
<p>Nos artigos personalizáveis, encontrarás um campo para indicares o nome, a frase ou os detalhes pretendidos.</p>
<p>Confirma sempre a escrita antes de finalizares a encomenda, pois cada peça será preparada de acordo com as informações fornecidas.</p>
<h2>Posso alterar a minha encomenda depois de a realizar?</h2>
<p>Se precisares de alterar algum detalhe, entra em contacto connosco o mais rapidamente possível.</p>
<p>Se a personalização ainda não tiver sido iniciada, faremos o possível para ajudar.</p>
<h2>Como sei qual o tamanho mais indicado?</h2>
<p>Sempre que disponível, consulta as informações de tamanho na página do artigo.</p>
<p>Se tiveres dúvidas, fala connosco! Teremos todo o gosto em ajudar-te a escolher o tamanho mais adequado.</p>
<h2>Preciso da encomenda para uma data especial. Chega a tempo?</h2>
<p>Se tens uma data especial em mente, recomendamos que faças a encomenda com antecedência.</p>
<p>Podes indicar a data pretendida nas notas da encomenda ou falar connosco antes de comprar.</p>
<p>Faremos o possível para ajudar, mas a entrega numa data específica só fica garantida quando expressamente confirmada.</p>
<h2>Fazem personalizações que não estão no site?</h2>
<p>${coracao('Adoramos dar vida a ideias especiais! ♡')}</p>
<p>Se tens uma frase, um nome ou uma ideia diferente daquilo que encontras na nossa loja, fala connosco.</p>
<p>Vamos adorar conhecer a tua ideia e verificar se conseguimos torná-la realidade!</p>
<h2>Não encontraste a resposta que procuravas?</h2>
<p>${coracao(`Estamos à distância de uma mensagem. Entra em contacto connosco através do Instagram ou dos nossos <a href="${url('/contactos/')}">canais de atendimento</a>. ♡`)}</p>
${falarNoInstagram}`,
    'Perguntas frequentes da Franja Kids: prazos, portes, levantamento em mão, envios para o estrangeiro, pagamento, trocas e personalização.'),

    /* O texto da loja (o Samuel, 21 nov 2026), por «tu» como o resto do site. O email e o WhatsApp vêm dos dados
       da loja (o painel muda-os); o nome, o NIF e a morada ficam nas Informações legais, ligadas no rodapé. */
    texto('/contactos/', 'Contactos', 'Estamos aqui para ajudar! ♡', `
<p>Tens alguma dúvida sobre os nossos artigos, personalizações ou encomendas? Entra em contacto connosco. Teremos todo o gosto em ajudar!</p>
${cartoes([
  ['email', 'Email', e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : porConfirmar('email')],
  ...(ligacaoWhatsapp(e.telefone) ? [['whatsapp', 'WhatsApp', `<a href="${ligacaoWhatsapp(e.telefone)}">${esc(e.telefone)}</a>`]] : []),
  ['instagram', 'Instagram', `<a href="${mensagemInstagram(loja)}">@${esc(loja.instagram)}</a>`],
], 'cartoes-ajuda--lista')}
<p>Respondemos a todas as mensagens com a maior brevidade possível.</p>
<p class="contactos__fecho">${coracao('Franja Kids — Feito com amor, pensado para os mais pequenos. ♡')}</p>`,
    'Os contactos da Franja Kids: email, WhatsApp e Instagram, para dúvidas sobre os artigos, as personalizações e as encomendas.'),

    texto('/informacoes-legais/', 'Informações legais', 'Quem é a Franja Kids, para efeitos legais.', `
<dl class="dados-legais">
  <dt>Nome comercial</dt><dd>${esc(loja.nome)}</dd>
  <dt>Titular da atividade</dt><dd>${valor(e.nome, 'nome do titular')}</dd>
  <dt>NIF</dt><dd>${valor(e.nif, 'NIF')}</dd>
  <dt>Morada</dt><dd>${moradaJunta(valor(e.morada, 'morada'))}</dd>
  <dt>Email</dt><dd>${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : porConfirmar('email')}</dd>
  ${e.telefone ? `<dt>Telefone</dt><dd>${telefone(e.telefone)}</dd>` : ''}
</dl>`,
    'As informações legais da Franja Kids: o titular da atividade, o NIF, a morada e os contactos.', { indexar: false }),

    texto('/termos/', 'Termos e condições', 'As condições das compras na loja online da Franja Kids.', `
<h2>1. Quem vende</h2>
${identificacao(e)}
<h2>2. Como se faz a encomenda</h2>
${comoSeFaz()}
<h2>3. Preços e pagamento</h2>
<p>Os preços incluem IVA. Os portes aparecem antes da encomenda${gratis ? ` e são grátis em Portugal continental a partir de ${gratis} em artigos` : ''}. ${online ? `Paga-se por ${meios}, através da Stripe, no fim da encomenda. Com Multibanco, a encomenda só avança depois de a referência ser paga, e fica sem efeito se não for paga dentro do prazo indicado.` : 'Depois de confirmarmos a encomenda, combinamos o pagamento por MB WAY ou transferência; só produzimos depois de recebido.'}</p>
<h2>4. Personalização</h2>
<p>O texto é usado exatamente como foi escrito na encomenda, com as opções escolhidas. Nos pedidos à medida, combinados por mensagem, enviamos a pré-visualização antes de produzir e só produzimos depois da sua aprovação.</p>
<h2>5. Prazos e entrega</h2>
<p>As peças personalizadas, e as estampadas ou bordadas por encomenda, levam cerca de ${producao} a fazer; os outros artigos são preparados para envio em ${preparacao}. A página de cada artigo diz o prazo dele, e os prazos de transporte acrescem a estes. Em Portugal continental, o envio por correio registado CTT chega habitualmente em até ${esc(ent.prazoContinente)} depois de enviado.${comPortes.length ? ` Para ${juntar(comPortes.map(comArtigo))}, o prazo varia consoante o destino.` : ''}${sobConsulta.length ? ` Para ${juntar(sobConsulta.map(comArtigo))}, os portes e o prazo são sob consulta, e a encomenda não se faz no site.` : ''}${mao ? ` ${esc(mao.nome)}: sem custo; quando a encomenda estiver pronta, combinamos o levantamento pelo WhatsApp.` : ''}</p>
<h2>6. Direito de livre resolução</h2>
<p>${LIVRE_RESOLUCAO}</p>
<p>${SEM_LIVRE_RESOLUCAO_PERSONALIZADO}</p>
<h2>7. Garantia</h2>
<p>${textoGarantia()}</p>
<h2>8. Litígios e reclamações</h2>
${ralHtml({ ambito: 'local', concelhos: [ent.concelho] })}
<p>Pode também usar o <a href="https://www.livroreclamacoes.pt/inicio" rel="noopener">Livro de Reclamações Eletrónico</a>.</p>`,
    'Termos e condições da loja online da Franja Kids.', { indexar: false }),

    texto('/privacidade/', 'Política de privacidade', 'Que dados pedimos, para quê, e os seus direitos.', `
<h2>Quem trata os dados</h2>
${identificacao(e)}
<h2>Que dados e para quê</h2>
<ul>
  <li><strong>Encomendas:</strong> nome, email, telemóvel, NIF (se o der), morada e o texto da personalização, para fazer, enviar e faturar a encomenda (execução do contrato e obrigações fiscais).${mao ? ' No levantamento em mão, o telemóvel serve também para combinarmos o levantamento pelo WhatsApp.' : ''} Guardamos as encomendas 10 anos, como a lei fiscal obriga; o texto da personalização apaga-se no fim da garantia.</li>
  <li><strong>Avisos de stock:</strong> o email que deixa na página de um artigo esgotado, para o avisarmos uma vez quando voltar (a seu pedido). Apagamo-lo depois do aviso, ou ao fim de 6 meses.</li>
  <li><strong>Mensagens:</strong> o que nos escreve por mensagem ou email, para responder (12 meses).</li>
  <li><strong>Carrinho:</strong> fica guardado só no seu browser (armazenamento local), para não o perder entre páginas.${online ? ' Enquanto paga na página da Stripe, os dados do finalizar ficam também só neste separador do browser, para voltarem aos campos se voltar atrás; saem quando a encomenda fica feita ou o separador se fecha.' : ''} Não usamos cookies nem estatísticas.</li>
</ul>
<h2>A quem os damos</h2>
${destinatariosHtml({ alojamento: 'cloudflare', dns: 'cloudflare', ...(/@(gmail|googlemail)\.com$/i.test(String(e.email || '').trim()) ? { email: 'google' } : /@franjakids\.com$/i.test(String(e.email || '').trim()) ? { email: 'hostinger' } : {}), ...(online ? { pagamentos: 'stripe' } : {}), instagram: true, ...(mao ? { whatsapp: true } : {}) }, { formato: 'lista' })
  /* A Cloudflare aloja o site e o DNS desde 10 nov 2026 (antes, o GitHub Pages), guarda as encomendas e os avisos de
     stock (o Worker franjakids-encomendas) e manda os emails delas (Email Sending; a Resend não se usa): estas
     finalidades a legal-comum ainda não tem. O testar.mjs confere que entram, e que não fica o GitHub nem a Resend. */
  .replace('DNS do domínio.', 'DNS do domínio; guardar as encomendas feitas no site e os avisos de stock, e passá-los para nós; envio dos emails das encomendas e dos avisos.')
  /* A caixa geral@ (22 nov 2026) é do Hostinger Mail: as caixas ficam em centros de dados em França e na Alemanha
     (a página «Where are Hostinger servers located», 22 nov 2026), sem transferência para fora da UE. A legal-comum
     deixa «Por confirmar» porque o centro de dados do alojamento depende do plano; o do correio não. */
  .replace('(Chipre (UE); o centro de dados depende do plano) — caixa de correio (Hostinger Email): os emails que nos envia e as respostas. Por confirmar.', '(Chipre, UE) — caixa de correio (Hostinger Email): os emails que nos envia, as respostas e os avisos das encomendas. Sem transferência: as caixas ficam em centros de dados em França e na Alemanha.')}
<h2>Os seus direitos</h2>
${direitosHtml({ email: e.email || porConfirmar('email') })}`,
    'Política de privacidade da Franja Kids.', { indexar: false }),
  ];
}
