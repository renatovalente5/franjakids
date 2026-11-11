// Páginas de ajuda e legais. Os dados da empresa e os portes vêm de content/loja.json (o painel
// edita-os; o que ainda não foi dito aparece «[por confirmar: …]» na pré-visualização, e em produção
// as regras param a publicação antes de chegar aqui); os textos da lei vêm da legal-comum.
import {
  COMO_SE_FAZ_A_ENCOMENDA, LIVRE_RESOLUCAO, SEM_LIVRE_RESOLUCAO_PERSONALIZADO, FORMULARIO_LIVRE_RESOLUCAO,
  textoGarantia, ralHtml, destinatariosHtml, direitosHtml, BOTAO_ENCOMENDA,
} from '../legal-comum/index.mjs';
import { url, esc, euro, icone, porConfirmar } from './util.mjs';
import { MEIOS_ONLINE } from './lib/regras.mjs';
import { texto } from './paginas.mjs';

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
  const mao = zona('mao');
  const continente = zona('continente');
  const online = loja.pagamentos?.modo === 'online';
  const gratis = typeof ent.gratisAPartirDe === 'number' ? euro(ent.gratisAPartirDe) : null;
  const portesDe = (z) => (typeof z.portes === 'number' ? (z.portes === 0 ? 'grátis' : euro(z.portes)) : (z.id === 'continente' ? porConfirmar('portes para Portugal continental') : 'confirmamos antes do pagamento'));
  const pagamentos = online ? [...MEIOS_ONLINE] : [];
  // «MB WAY, Multibanco, cartão, Apple Pay ou Google Pay»
  const meios = `${MEIOS_ONLINE.slice(0, -1).join(', ')} ou ${MEIOS_ONLINE.at(-1)}`;
  const botao = online ? BOTAO_ENCOMENDA : 'Enviar encomenda';
  // «Como se faz a encomenda»: em modo «encomenda» o botão é outro e o pagamento combina-se depois
  const comoSeFaz = () => {
    const h = COMO_SE_FAZ_A_ENCOMENDA({ canal: 'site', pagamentos, linguas: ['português'], urlTermos: url('/termos/'), prazoConfirmacao: 'no próprio dia', arquivo: '10 anos' });
    return online ? h : h.replace(`«${BOTAO_ENCOMENDA}».`, `«${botao}». O pagamento combinamos contigo depois de confirmarmos a encomenda, por MB WAY ou transferência.`);
  };
  const frasePagamento = online
    ? `Pagas no fim da encomenda, com ${meios}. A encomenda fica feita quando carregas em «${botao}».`
    : `A encomenda fica feita quando carregas em «${botao}». Depois confirmamos tudo contigo e combinamos o pagamento, por MB WAY ou transferência.`;
  return [
    texto('/como-funciona/', 'Como funciona', 'Do pedido à tua porta, em quatro passos.', `
${cartoes([
  ['saco', '1. Escolhe a peça', 'O tamanho, a cor e a ocasião. Se não encontrares o que imaginas, manda-nos mensagem: fazemos à medida.'],
  ['lapis', '2. Diz-nos o nome ou a frase', 'Escreve-o como queres que fique. Também mudamos a cor, a letra ou o desenho.'],
  ['olho', '3. Aprovas a pré-visualização', 'Depois da encomenda, mandamos-te a pré-visualização. Só produzimos depois do teu sim.'],
  ['carrinha', '4. Recebes em casa', `Cada peça leva ${esc(loja.producao)} a fazer. Enviamos por CTT${mao ? `, ou ${esc(mao.nome.charAt(0).toLowerCase() + mao.nome.slice(1))}` : ''}.`],
])}
<h2>Pagamento</h2>
<p>${frasePagamento}</p>
<h2>Para uma data certa</h2>
<p>Batizado, aniversário, Natal? Diz-nos a data nas notas da encomenda, ou antes de encomendar por mensagem, para confirmarmos que chega a tempo.</p>
<h2>Passo a passo</h2>
${comoSeFaz()}`,
    'Como se encomenda na Franja Kids: escolher a peça, personalizar, aprovar a pré-visualização e receber em casa.'),

    texto('/envios/', 'Envios e prazos', gratis ? `Portes grátis em Portugal continental a partir de ${gratis}.` : 'Os prazos e os portes de cada entrega.', `
${cartoes([
  ['relogio', 'Produção', `As peças personalizadas levam cerca de ${esc(loja.producao)} a fazer.`],
  ['carrinha', esc(continente.nome), `Correio registado CTT; chega em até ${esc(ent.prazoContinente)} depois de enviado.`],
  ...(mao ? [['local', esc(mao.nome), 'Sem custo. Combinamos o dia por mensagem.']] : []),
  ['presente', 'Açores, Madeira e estrangeiro', 'Enviamos para todo o lado. Confirmamos o prazo e os portes antes do pagamento.'],
])}
<h2>Portes</h2>
<ul>${ent.zonas.map((z) => `<li>${esc(z.nome)}: ${portesDe(z)}${z.id === 'continente' && gratis ? ` (grátis a partir de ${gratis} em artigos)` : ''}.</li>`).join('')}</ul>
<p>Os portes aparecem no finalizar, antes de encomendares.</p>`,
    // a descrição vai em texto simples: o layout.mjs escapa-a (aqui escapada também, um «&» saía «&amp;amp;»)
    `Prazos de produção, envios por CTT${mao ? ` e ${mao.nome.charAt(0).toLowerCase() + mao.nome.slice(1)}` : ''}.`),

    texto('/trocas-e-devolucoes/', 'Trocas e devoluções', 'O que podes devolver, como, e o que fazer se alguma coisa chegar mal.', `
<h2>Artigos sem personalização</h2>
<p>${LIVRE_RESOLUCAO}</p>
<h2>Artigos personalizados</h2>
<p>${SEM_LIVRE_RESOLUCAO_PERSONALIZADO}</p>
<p>Por isso, antes de produzirmos mandamos-te a pré-visualização: confirma o nome, a frase, o tamanho e a cor.</p>
<h2>Se chegar com defeito ou diferente do que pediste</h2>
<p>Diz-nos logo, com uma fotografia, e resolvemos. ${textoGarantia({ feitoAMao: true })}</p>
<h2>Como pedir</h2>
<p>Por email para ${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : porConfirmar('email')} ou por <a href="https://ig.me/m/${loja.instagram}">mensagem no Instagram</a>. Também podes usar este formulário:</p>
<pre>${esc(FORMULARIO_LIVRE_RESOLUCAO)}</pre>`,
    'Trocas e devoluções na Franja Kids: 14 dias nos artigos sem personalização; os personalizados não têm livre resolução.'),

    texto('/contactos/', 'Contactos', 'Respondemos por mensagem no Instagram, normalmente no próprio dia.', `
<div class="heroi__botoes"><a class="botao botao--cheio" href="https://ig.me/m/${loja.instagram}">${icone('mensagem', 'icone icone--pequeno')} Enviar mensagem</a><a class="ligacao" href="https://www.instagram.com/${loja.instagram}/">@${loja.instagram} ${icone('seta', 'icone icone--pequeno')}</a></div>
${mao ? `<h2>${esc(mao.nome)}</h2>
<p>Sem custo. Combinamos o dia por mensagem.</p>` : ''}
<h2>Quem somos</h2>
${identificacao(e)}`),

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
<p>As peças personalizadas levam cerca de ${esc(loja.producao)} a fazer. Em Portugal continental, o envio por correio registado CTT chega em até ${esc(ent.prazoContinente)}. Para as ilhas e o estrangeiro, confirmamos prazo e portes antes do pagamento.${mao ? ` ${esc(mao.nome)}, sem custo.` : ''}</p>
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
  <li><strong>Encomendas:</strong> nome, email, telemóvel, NIF (se o der), morada e o texto da personalização, para fazer, enviar e faturar a encomenda (execução do contrato e obrigações fiscais). Guardamos as encomendas 10 anos, como a lei fiscal obriga; o texto da personalização apaga-se no fim da garantia.</li>
  <li><strong>Mensagens:</strong> o que nos escreve por mensagem ou email, para responder (12 meses).</li>
  <li><strong>Carrinho:</strong> fica guardado só no seu browser (armazenamento local), para não o perder entre páginas. Enquanto paga na página da Stripe, os dados do finalizar ficam também só neste separador do browser, para voltarem aos campos se voltar atrás; saem quando a encomenda fica feita ou o separador se fecha. Não usamos cookies nem estatísticas.</li>
</ul>
<h2>A quem os damos</h2>
${destinatariosHtml({ alojamento: 'cloudflare', dns: 'cloudflare', ...(online ? { pagamentos: 'stripe' } : {}), instagram: true }, { formato: 'lista' })
  /* A Cloudflare aloja o site e o DNS desde 10 nov 2026 (antes, o GitHub Pages), guarda as encomendas (o Worker
     franjakids-encomendas) e manda os emails delas (Email Sending; a Resend não se usa): estas duas finalidades a
     legal-comum ainda não tem. O testar.mjs confere que entram, e que não fica o GitHub nem a Resend. */
  .replace('DNS do domínio.', 'DNS do domínio; guardar as encomendas feitas no site e passá-las para nós; envio dos emails das encomendas (confirmações e avisos).')}
<h2>Os seus direitos</h2>
${direitosHtml({ email: e.email || porConfirmar('email') })}`,
    'Política de privacidade da Franja Kids.', { indexar: false }),
  ];
}
