// Páginas de ajuda e legais. Os dados da empresa, os prazos e os portes vêm de content/loja.json (o painel
// edita-os; o que ainda não foi dito aparece «[por confirmar: …]» na pré-visualização, e em produção
// as regras param a publicação antes de chegar aqui); os textos da lei vêm da legal-comum. Os textos das
// páginas «Como funciona» e «Envios e prazos» são os da loja (o pedido de 20 nov 2026).
import {
  COMO_SE_FAZ_A_ENCOMENDA, LIVRE_RESOLUCAO, SEM_LIVRE_RESOLUCAO_PERSONALIZADO, FORMULARIO_LIVRE_RESOLUCAO,
  textoGarantia, ralHtml, destinatariosHtml, direitosHtml, BOTAO_ENCOMENDA,
} from '../legal-comum/index.mjs';
import { url, esc, euro, icone, porConfirmar } from './util.mjs';
import { MEIOS_ONLINE, zonaSobConsulta } from './lib/regras.mjs';
import { texto, coracao, mensagemInstagram } from './paginas.mjs';

const valor = (v, falta) => (typeof v === 'string' && v.trim() ? esc(v.trim()) : porConfirmar(falta));
const identificacao = (e) => `<ul>
  <li>Nome: ${valor(e.nome, 'nome ou firma')}</li>
  <li>NIF: ${valor(e.nif, 'NIF')}</li>
  <li>Morada: ${valor(e.morada, 'morada')}</li>
  <li>Email: ${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : porConfirmar('email')}</li>
  ${e.telefone ? `<li>Telefone: ${esc(e.telefone)}</li>` : ''}
</ul>`;

const cartoes = (itens) => `<ul class="cartoes-ajuda">${itens.map(([i, t, d]) => `<li><span class="passos__icone">${icone(i)}</span><div><h2>${t}</h2><p>${d}</p></div></li>`).join('')}</ul>`;

export function paginasDeTexto(loja) {
  const e = loja.empresa;
  const ent = loja.entrega;
  const zona = (id) => ent.zonas.find((z) => z.id === id);
  const mao = zona('mao') && !zonaSobConsulta(zona('mao')) ? zona('mao') : null;
  const online = loja.pagamentos?.modo === 'online';
  const gratis = typeof ent.gratisAPartirDe === 'number' ? euro(ent.gratisAPartirDe) : null;
  const producao = esc(loja.producao);
  const preparacao = typeof loja.preparacao === 'string' && loja.preparacao.trim() ? esc(loja.preparacao.trim()) : porConfirmar('preparação dos artigos sem personalização');
  const pagamentos = online ? [...MEIOS_ONLINE] : [];
  // «MB WAY, Multibanco, cartão, Apple Pay ou Google Pay»
  const meios = `${MEIOS_ONLINE.slice(0, -1).join(', ')} ou ${MEIOS_ONLINE.at(-1)}`;
  const botao = online ? BOTAO_ENCOMENDA : 'Enviar encomenda';
  const falarNoInstagram = `<div class="heroi__botoes"><a class="botao botao--cheio" href="${mensagemInstagram(loja)}">${coracao('Fala connosco no Instagram ♡')}</a></div>`;
  // os portes de uma zona, por extenso: «5,50 €», «gratuito», «sob consulta» (o continente sem portes é a falta que a lei não deixa)
  const portesDe = (z) => (zonaSobConsulta(z) ? (z.id === 'continente' ? porConfirmar('portes para Portugal continental') : 'sob consulta') : z.portes === 0 ? 'gratuito' : euro(z.portes));
  const listaDePortes = `<ul>${ent.zonas.flatMap((z) => [
    `<li>${esc(z.nome)}: ${portesDe(z)}.</li>`,
    ...(z.id === 'continente' && gratis ? [`<li>${esc(z.nome)}: portes grátis em compras iguais ou superiores a ${gratis}.</li>`] : []),
  ]).join('')}</ul>`;
  // as zonas para onde se envia com portes (as ilhas e a UE), e as sob consulta, para os termos
  const comPortes = ent.zonas.filter((z) => !zonaSobConsulta(z) && !['continente', 'mao'].includes(z.id));
  const sobConsulta = ent.zonas.filter((z) => zonaSobConsulta(z) && z.id !== 'continente');
  const juntar = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l.at(-1)}` : l.join(''));
  // a zona numa frase: «para os Açores e a Madeira», «para os países da União Europeia», «para os restantes países»
  const comArtigo = (z) => ({ ilhas: 'os Açores e a Madeira', ue: 'os países da União Europeia', estrangeiro: 'os restantes países' })[z.id] || esc(z.nome);
  // «Como se faz a encomenda»: em modo «encomenda» o botão é outro e o pagamento combina-se depois
  const comoSeFaz = () => {
    const h = COMO_SE_FAZ_A_ENCOMENDA({ canal: 'site', pagamentos, linguas: ['português'], urlTermos: url('/termos/'), prazoConfirmacao: 'no próprio dia', arquivo: '10 anos' });
    return online ? h : h.replace(`«${BOTAO_ENCOMENDA}».`, `«${botao}». O pagamento combinamos contigo depois de confirmarmos a encomenda, por MB WAY ou transferência.`);
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
    : `Adiciona os teus artigos ao carrinho, confirma os dados e carrega em «${botao}». O pagamento combinamos contigo depois.`],
  ['carrinha', '4. Recebe com carinho', 'Preparamos cada encomenda com todo o cuidado e carinho. Assim que estiver pronta, segue viagem até ti!'],
])}
<h2>Pagamento</h2>
${pagamentoHtml}
<h2>${coracao('Precisas da tua encomenda para uma data especial? ♡')}</h2>
<p>Um nascimento, batizado, aniversário ou outra ocasião especial?</p>
<p>Os nossos artigos personalizados são preparados especialmente para ti, com todo o cuidado e carinho. Por isso, o prazo habitual de produção e entrega é de ${producao}.</p>
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
  ['olho', '3. Confirmamos contigo', 'Antes de produzir, mandamos-te a pré-visualização.'],
  ['coracao', '4. Feito para ti', `Cada peça personalizada leva ${producao} a ficar pronta.`],
])}
<h2>Personalização opcional</h2>
<p>Em alguns artigos, o nome é opcional: marca a caixa para o acrescentar, e o acréscimo aparece logo no preço.</p>
<h2>Trocas e devoluções</h2>
<p>Os artigos personalizados são feitos só para ti, por isso não têm troca nem devolução por desistência. Confirma bem o nome, a frase, o tamanho e a cor antes de encomendares. <a href="${url('/trocas-e-devolucoes/')}">Trocas e devoluções</a></p>
<h2>${coracao('Tens outra ideia? ♡')}</h2>
<p>Se procuras uma personalização diferente das que encontras no site, fala connosco no Instagram.</p>
${falarNoInstagram}`,
    'Como personalizar na Franja Kids: escolher o artigo, escrever o nome ou a frase e confirmar antes de produzirmos.'),

    texto('/envios/', 'Envios e prazos', 'Na Franja Kids, cada encomenda é preparada com todo o cuidado e carinho, para que chegue até ti da melhor forma possível. ♡', `
${cartoes([
  ['relogio', 'Produção e preparação', `Os artigos personalizados têm um prazo habitual de produção de ${producao}. Os artigos não personalizados são preparados para envio em ${preparacao}.`],
  ['carrinha', 'Portugal Continental', `Enviamos através dos CTT, em correio registado. Após a expedição, a entrega demora habitualmente até ${esc(ent.prazoContinente)}.`],
  ...(mao ? [['local', `Levantamento em mão em ${esc(ent.concelho)}`, 'Seleciona esta opção ao finalizar a compra e não pagues portes! Quando a tua encomenda estiver pronta, contactamos-te pelo WhatsApp para combinar o levantamento.']] : []),
  ['presente', 'Açores, Madeira e estrangeiro', 'Enviamos para as ilhas e para vários destinos internacionais. Os prazos de entrega variam consoante o destino.'],
])}
<p>Os prazos de transporte acrescem aos prazos de produção ou preparação.</p>
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
<p>Por isso, antes de produzirmos mandamos-te a pré-visualização: confirma o nome, a frase, o tamanho e a cor.</p>
<h2>Se chegar com defeito ou diferente do que pediste</h2>
<p>Diz-nos logo, com uma fotografia, e resolvemos. ${textoGarantia({ feitoAMao: true })}</p>
<h2>Como pedir</h2>
<p>Por email para ${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : porConfirmar('email')} ou por <a href="${mensagemInstagram(loja)}">mensagem no Instagram</a>. Também podes usar este formulário:</p>
<pre>${esc(FORMULARIO_LIVRE_RESOLUCAO)}</pre>`,
    'Trocas e devoluções na Franja Kids: 14 dias nos artigos sem personalização; os personalizados não têm livre resolução.', { indexar: false }),

    texto('/perguntas-frequentes/', 'Perguntas frequentes', 'As dúvidas mais comuns sobre encomendas, prazos e envios.', `
<h2>Quanto tempo demora a minha encomenda?</h2>
<p>Os artigos personalizados levam ${producao} a ficar prontos; os não personalizados são preparados para envio em ${preparacao}. Depois, em Portugal continental, a entrega demora habitualmente até ${esc(ent.prazoContinente)}.</p>
<h2>Quanto custam os portes?</h2>
${listaDePortes}
<p>Tens tudo em <a href="${url('/envios/')}">Envios e prazos</a>.</p>
${mao ? `<h2>Posso levantar a encomenda em mão?</h2>
<p>Sim, em ${esc(ent.concelho)} e sem portes: escolhe «${esc(mao.nome)}» ao finalizar a encomenda. Quando estiver pronta, contactamos-te pelo WhatsApp para combinar o levantamento.</p>` : ''}
<h2>Enviam para fora de Portugal?</h2>
<p>${comPortes.some((z) => z.id === 'ue') ? `Para a União Europeia, sim, com portes de ${euro(zona('ue').portes)}. ` : ''}Para ${comPortes.some((z) => z.id === 'ue') ? 'os restantes países' : 'fora de Portugal'}, fala connosco no Instagram: vemos as possibilidades de envio, os portes e o prazo para o teu país.</p>
<h2>Como posso pagar?</h2>
<p>${online ? `No fim da encomenda, com ${meios}.` : 'Depois de confirmarmos a encomenda, combinamos contigo o pagamento, por MB WAY ou transferência.'}</p>
<h2>Posso trocar ou devolver?</h2>
<p>Nos artigos sem personalização, tens 14 dias para desistir depois de os receberes. Os personalizados são feitos só para ti e não têm troca nem devolução por desistência. Se alguma coisa chegar com defeito, resolvemos. <a href="${url('/trocas-e-devolucoes/')}">Trocas e devoluções</a></p>
<h2>Preciso da encomenda para uma data especial. Chega a tempo?</h2>
<p>Encomenda com a maior antecedência possível e diz-nos a data nas notas da encomenda, ou fala connosco no Instagram antes de encomendares.</p>
<h2>Fazem personalizações que não estão no site?</h2>
<p>Adoramos ideias novas! Fala connosco no Instagram e conta-nos o que imaginas.</p>
${falarNoInstagram}`,
    'Perguntas frequentes da Franja Kids: prazos, portes, levantamento em mão, envios para o estrangeiro, pagamento e trocas.'),

    texto('/contactos/', 'Contactos', 'Respondemos por mensagem no Instagram, normalmente no próprio dia.', `
<div class="heroi__botoes"><a class="botao botao--cheio" href="${mensagemInstagram(loja)}">${icone('mensagem', 'icone icone--pequeno')} Enviar mensagem</a><a class="ligacao" href="https://www.instagram.com/${loja.instagram}/">@${loja.instagram} ${icone('seta', 'icone icone--pequeno')}</a></div>
${mao ? `<h2>${esc(mao.nome)}</h2>
<p>Sem portes. Quando a tua encomenda estiver pronta, contactamos-te pelo WhatsApp para combinar o levantamento.</p>` : ''}
<h2>Quem somos</h2>
${identificacao(e)}`),

    texto('/informacoes-legais/', 'Informações legais', 'Quem é a Franja Kids, para efeitos legais.', `
<dl class="dados-legais">
  <dt>Nome comercial</dt><dd>${esc(loja.nome)}</dd>
  <dt>Titular da atividade</dt><dd>${valor(e.nome, 'nome do titular')}</dd>
  <dt>NIF</dt><dd>${valor(e.nif, 'NIF')}</dd>
  <dt>Morada</dt><dd>${valor(e.morada, 'morada')}</dd>
  <dt>Email</dt><dd>${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : porConfirmar('email')}</dd>
  ${e.telefone ? `<dt>Telefone</dt><dd><a href="tel:${esc(String(e.telefone).replace(/[^+\d]/g, ''))}">${esc(e.telefone)}</a></dd>` : ''}
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
<p>Depois da encomenda, mandamos a pré-visualização por email ou mensagem; só produzimos depois da sua aprovação. O texto é usado exatamente como foi escrito na encomenda.</p>
<h2>5. Prazos e entrega</h2>
<p>As peças personalizadas levam cerca de ${producao} a fazer; os artigos sem personalização são preparados para envio em ${preparacao}. Os prazos de transporte acrescem a estes. Em Portugal continental, o envio por correio registado CTT chega habitualmente em até ${esc(ent.prazoContinente)} depois de enviado.${comPortes.length ? ` Para ${juntar(comPortes.map(comArtigo))}, o prazo varia consoante o destino.` : ''}${sobConsulta.length ? ` Para ${juntar(sobConsulta.map(comArtigo))}, os portes e o prazo são sob consulta, e a encomenda não se faz no site.` : ''}${mao ? ` ${esc(mao.nome)}: sem custo; quando a encomenda estiver pronta, combinamos o levantamento pelo WhatsApp.` : ''}</p>
<h2>6. Direito de livre resolução</h2>
<p>${LIVRE_RESOLUCAO}</p>
<p>${SEM_LIVRE_RESOLUCAO_PERSONALIZADO}</p>
<h2>7. Garantia</h2>
<p>${textoGarantia({ feitoAMao: true })}</p>
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
  <li><strong>Carrinho:</strong> fica guardado só no seu browser (armazenamento local), para não o perder entre páginas. Enquanto paga na página da Stripe, os dados do finalizar ficam também só neste separador do browser, para voltarem aos campos se voltar atrás; saem quando a encomenda fica feita ou o separador se fecha. Não usamos cookies nem estatísticas.</li>
</ul>
<h2>A quem os damos</h2>
${destinatariosHtml({ alojamento: 'cloudflare', dns: 'cloudflare', ...(online ? { pagamentos: 'stripe' } : {}), instagram: true, ...(mao ? { whatsapp: true } : {}) }, { formato: 'lista' })
  /* A Cloudflare aloja o site e o DNS desde 10 nov 2026 (antes, o GitHub Pages), guarda as encomendas e os avisos de
     stock (o Worker franjakids-encomendas) e manda os emails delas (Email Sending; a Resend não se usa): estas
     finalidades a legal-comum ainda não tem. O testar.mjs confere que entram, e que não fica o GitHub nem a Resend. */
  .replace('DNS do domínio.', 'DNS do domínio; guardar as encomendas feitas no site e os avisos de stock, e passá-los para nós; envio dos emails das encomendas e dos avisos.')}
<h2>Os seus direitos</h2>
${direitosHtml({ email: e.email || porConfirmar('email') })}`,
    'Política de privacidade da Franja Kids.', { indexar: false }),
  ];
}
