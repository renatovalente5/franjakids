// Páginas de ajuda e legais. Os dados da empresa vêm de dados/loja.json (marcadores «[por confirmar: …]» até o
// cliente os dar); os textos da lei vêm da legal-comum.
import {
  COMO_SE_FAZ_A_ENCOMENDA, LIVRE_RESOLUCAO, SEM_LIVRE_RESOLUCAO_PERSONALIZADO, FORMULARIO_LIVRE_RESOLUCAO,
  textoGarantia, ralHtml, destinatariosHtml, direitosHtml, BOTAO_ENCOMENDA,
} from '../legal-comum/index.mjs';
import { url, esc, euro, icone } from './util.mjs';
import { texto } from './paginas.mjs';

const identificacao = (e) => `<ul>
  <li>Nome: ${esc(e.nome)}</li>
  <li>NIF: ${esc(e.nif)}</li>
  <li>Morada: ${esc(e.morada)}</li>
  <li>Email: ${e.email.startsWith('[') ? esc(e.email) : `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>`}</li>
</ul>`;

const cartoes = (itens) => `<ul class="cartoes-ajuda">${itens.map(([i, t, d]) => `<li><span class="passos__icone">${icone(i)}</span><div><h2>${t}</h2><p>${d}</p></div></li>`).join('')}</ul>`;

export function paginasDeTexto(loja) {
  const e = loja.empresa;
  const portes = euro(loja.portesGratisDesde);
  return [
    texto('/como-funciona/', 'Como funciona', 'Do pedido à tua porta, em quatro passos.', `
${cartoes([
  ['saco', '1. Escolhe a peça', 'O tamanho, a cor e a ocasião. Se não encontrares o que imaginas, manda-nos mensagem: fazemos à medida.'],
  ['lapis', '2. Diz-nos o nome ou a frase', 'Escreve-o como queres que fique. Também mudamos a cor, a letra ou o desenho.'],
  ['olho', '3. Aprovas a pré-visualização', 'Depois do pagamento, mandamos-te a pré-visualização. Só produzimos depois do teu sim.'],
  ['carrinha', '4. Recebes em casa', `Cada peça leva ${loja.producao} a fazer. Enviamos por CTT, ou entregamos em mão em ${loja.entregaEmMao}.`],
])}
<h2>Pagamento</h2>
<p>Pagas no fim da encomenda, com MB WAY ou cartão. A encomenda fica feita quando carregas em «${BOTAO_ENCOMENDA}».</p>
<h2>Para uma data certa</h2>
<p>Batizado, aniversário, Natal? Diz-nos a data nas notas da encomenda, ou antes de encomendar por mensagem, para confirmarmos que chega a tempo.</p>
<h2>Passo a passo</h2>
${COMO_SE_FAZ_A_ENCOMENDA({ canal: 'site', pagamentos: loja.pagamentos, linguas: ['português'], urlTermos: url('/termos/'), prazoConfirmacao: 'no próprio dia', arquivo: '10 anos' })}`,
    'Como se encomenda na Franja Kids: escolher a peça, personalizar, aprovar a pré-visualização e receber em casa.'),

    texto('/envios/', 'Envios e prazos', `Portes grátis a partir de ${portes}.`, `
${cartoes([
  ['relogio', 'Produção', `As peças personalizadas levam cerca de ${loja.producao} a fazer.`],
  ['carrinha', 'Portugal continental', `Correio registado CTT; chega em até ${loja.entregaContinente} depois de enviado.`],
  ['local', `Entrega em mão em ${loja.entregaEmMao}`, 'Sem custo. Combinamos o dia por mensagem.'],
  ['presente', 'Açores, Madeira e estrangeiro', 'Enviamos para todo o lado. Confirmamos o prazo e os portes antes do pagamento.'],
])}
<h2>Portes</h2>
<p>Os portes aparecem antes de pagares e são grátis nas encomendas a partir de ${portes}. [por confirmar: tabela de portes para Portugal continental, ilhas e estrangeiro]</p>`,
    `Prazos de produção, envios por CTT e entrega em mão em ${loja.entregaEmMao}.`),

    texto('/trocas-e-devolucoes/', 'Trocas e devoluções', 'O que podes devolver, como, e o que fazer se alguma coisa chegar mal.', `
<h2>Artigos sem personalização</h2>
<p>${LIVRE_RESOLUCAO}</p>
<h2>Artigos personalizados</h2>
<p>${SEM_LIVRE_RESOLUCAO_PERSONALIZADO}</p>
<p>Por isso, antes de produzirmos mandamos-te a pré-visualização: confirma o nome, a frase, o tamanho e a cor.</p>
<h2>Se chegar com defeito ou diferente do que pediste</h2>
<p>Diz-nos logo, com uma fotografia, e resolvemos. ${textoGarantia({ feitoAMao: true })}</p>
<h2>Como pedir</h2>
<p>Por email para ${esc(e.email)} ou por <a href="https://ig.me/m/${loja.instagram}">mensagem no Instagram</a>. Também podes usar este formulário:</p>
<pre>${esc(FORMULARIO_LIVRE_RESOLUCAO)}</pre>`,
    'Trocas e devoluções na Franja Kids: 14 dias nos artigos sem personalização; os personalizados não têm livre resolução.'),

    texto('/contactos/', 'Contactos', 'Respondemos por mensagem no Instagram, normalmente no próprio dia.', `
<div class="heroi__botoes"><a class="botao botao--cheio" href="https://ig.me/m/${loja.instagram}">${icone('mensagem', 'icone icone--pequeno')} Enviar mensagem</a><a class="ligacao" href="https://www.instagram.com/${loja.instagram}/">@${loja.instagram} ${icone('seta', 'icone icone--pequeno')}</a></div>
<h2>Entrega em mão</h2>
<p>Em ${loja.entregaEmMao}, sem custo. Combinamos o dia por mensagem.</p>
<h2>Quem somos</h2>
${identificacao(e)}`),

    texto('/termos/', 'Termos e condições', 'As condições das compras na loja online da Franja Kids.', `
<h2>1. Quem vende</h2>
${identificacao(e)}
<h2>2. Como se faz a encomenda</h2>
${COMO_SE_FAZ_A_ENCOMENDA({ canal: 'site', pagamentos: loja.pagamentos, linguas: ['português'], urlTermos: url('/termos/'), prazoConfirmacao: 'no próprio dia', arquivo: '10 anos' })}
<h2>3. Preços e pagamento</h2>
<p>Os preços incluem IVA. Os portes aparecem antes do pagamento e são grátis a partir de ${portes}. Paga-se por MB WAY ou cartão, através da Stripe, no fim da encomenda.</p>
<h2>4. Personalização</h2>
<p>Depois do pagamento, mandamos a pré-visualização por email; só produzimos depois da sua aprovação. O texto é usado exactamente como foi escrito na encomenda.</p>
<h2>5. Prazos e entrega</h2>
<p>As peças personalizadas levam cerca de ${loja.producao} a fazer. Em Portugal continental, o envio por correio registado CTT chega em até ${loja.entregaContinente}. Para as ilhas e o estrangeiro, confirmamos prazo e portes antes do pagamento. Entrega em mão em ${loja.entregaEmMao}, sem custo.</p>
<h2>6. Direito de livre resolução</h2>
<p>${LIVRE_RESOLUCAO}</p>
<p>${SEM_LIVRE_RESOLUCAO_PERSONALIZADO}</p>
<h2>7. Garantia</h2>
<p>${textoGarantia({ feitoAMao: true })}</p>
<h2>8. Litígios e reclamações</h2>
${ralHtml({ ambito: 'local', concelhos: [loja.concelho] })}
<p>Pode também usar o <a href="https://www.livroreclamacoes.pt/inicio" rel="noopener">Livro de Reclamações Eletrónico</a>.</p>`,
    'Termos e condições da loja online da Franja Kids.'),

    texto('/privacidade/', 'Política de privacidade', 'Que dados pedimos, para quê, e os teus direitos.', `
<h2>Quem trata os dados</h2>
${identificacao(e)}
<h2>Que dados e para quê</h2>
<ul>
  <li><strong>Encomendas:</strong> nome, email, telemóvel, morada e o texto da personalização, para fazer, enviar e faturar a encomenda (execução do contrato e obrigações fiscais). Guardamos as encomendas 10 anos, como a lei fiscal obriga; o texto da personalização apaga-se no fim da garantia.</li>
  <li><strong>Mensagens:</strong> o que nos escreve por mensagem ou email, para responder (12 meses).</li>
  <li><strong>Carrinho:</strong> fica guardado só no seu browser (armazenamento local), para não o perder entre páginas. Não usamos cookies nem estatísticas.</li>
</ul>
<h2>A quem os damos</h2>
${destinatariosHtml({ alojamento: 'github', pagamentos: 'stripe', instagram: true }, { formato: 'lista' })}
<h2>Os seus direitos</h2>
${direitosHtml({ email: e.email })}`,
    'Política de privacidade da Franja Kids.'),
  ];
}
