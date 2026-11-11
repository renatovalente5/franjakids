/* O HTML DOS EMAILS. O HTML de email não é o do site: tabelas com role="presentation", uma coluna
 * de 600 px, tudo inline (o Gmail limita o <style> e ignora-o em parte), cores por extenso (não há
 * var() em email), sem flex nem grid. As regras vêm do email-html.js da LF Mobile, que as trouxe do
 * Armazém dos Pneus, já visto no Outlook, no Gmail e no Apple Mail.
 *
 * As cores são as da marca, as do site (assets/css/site.css, proposta C «Areia»): o fundo areia,
 * o cartão creme, a tinta castanha, o botão castanho e as ligações a coral. Os contrastes medem-se
 * nos testes (email.test.mjs), não se olham — também os do modo escuro. O logótipo é o PNG do site
 * (LOGO_URL; o Outlook não mostra WebP), com fundo transparente: os bonecos em tons pastel lêem-se
 * no creme e, no modo escuro, no castanho.
 */

export const CORES = Object.freeze({
  fundo: '#F7EEDF',        // --fundo
  cartao: '#FFF9EF',       // --superficie
  tinta: '#4A3428',        // --tinta: títulos e texto
  tintaSuave: '#765D51',   // --tinta-suave: o texto secundário e o rodapé
  linha: '#E6D6BE',        // --linha
  castanho: '#5A3E33',     // --castanho: o botão
  botaoTexto: '#FBF3E6',   // o texto dos botões cheios do site
  coral: '#B5523A',        // --coral: as ligações
});
/* O modo escuro (os clientes que respeitam prefers-color-scheme, e o Outlook com data-ogsc). */
export const CORES_ESCURAS = Object.freeze({
  fundo: '#1E1712',
  cartao: '#2A201A',
  tinta: '#F7EEDF',
  tintaSuave: '#D8C5B3',
  linha: '#4A3B31',
});

const FONTE = "'Figtree',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const FONTE_TITULOS = "'Varela Round','Figtree',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = CORES;
const E = CORES_ESCURAS;

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/* Um texto de várias linhas (a mensagem do cartão, as notas, a nota do painel): escapado, com as
   mudanças de linha. */
export const linhas = (s) => esc(s).replace(/\n/g, '<br>');
export const eurHtml = (c) => `${(c / 100).toFixed(2).replace('.', ',')}&nbsp;€`;

export const p = (html, ultimo) => `<p style="margin:0 0 ${ultimo ? '0' : '14px'} 0;">${html}</p>`;
export const pequeno = (html, ultimo) => `<p style="margin:0 0 ${ultimo ? '0' : '10px'} 0;font-size:13px;line-height:19px;color:${C.tintaSuave};">${html}</p>`;
export const ligacao = (url, txt) => `<a href="${esc(url)}" style="color:${C.coral};text-decoration:underline;">${esc(txt || url)}</a>`;
export const h2 = (txt) => `<h2 style="margin:0 0 6px 0;font-family:${FONTE};font-size:13px;line-height:18px;font-weight:700;color:${C.tinta};text-transform:uppercase;letter-spacing:.6px;">${esc(txt)}</h2>`;

/* Um bloco de texto, numa célula própria (o Outlook aplica a toda a linha o maior padding). */
export const bloco = (html, padding = '20px 40px 6px 40px') =>
  `<tr><td class="p t" style="padding:${padding};font-family:${FONTE};font-size:15px;line-height:23px;color:${C.tinta};">${html}</td></tr>`;

export const separador = () => `<tr><td class="p" style="padding:14px 40px 0 40px;"><div class="hr" style="border-top:1px solid ${C.linha};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;

/* A tabela dos produtos e dos totais: uma linha por produto, com as escolhas por baixo (o tamanho,
   a cor, as opções e o texto da personalização, tal e qual vai ser feito). */
export function tabelaArtigos(enc, { portes, total, desconto = null }) {
  const filas = (enc.linhas || []).map((l) => `
        <tr>
          <td class="t" style="padding:9px 0;border-bottom:1px solid ${C.linha};font-family:${FONTE};font-size:15px;line-height:22px;color:${C.tinta};">${esc(l.qtd)} × ${esc(l.nome)}${l.escolhas && l.escolhas.length ? `<br><span class="t2" style="font-size:13px;line-height:19px;color:${C.tintaSuave};">${esc(l.escolhas.join(' · '))}</span>` : ''}</td>
          <td align="right" valign="top" class="t" style="padding:9px 0 9px 12px;border-bottom:1px solid ${C.linha};font-family:${FONTE};font-size:15px;line-height:22px;color:${C.tinta};white-space:nowrap;">${eurHtml(l.total_cents)}</td>
        </tr>`).join('');
  return `<tr><td class="p" style="padding:6px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${filas}${desconto ? `
        <tr>
          <td class="t2" style="padding:7px 0 0 0;font-family:${FONTE};font-size:14px;line-height:20px;color:${C.tintaSuave};">${esc(desconto.rotulo)}</td>
          <td align="right" class="t2" style="padding:7px 0 0 12px;font-family:${FONTE};font-size:14px;line-height:20px;color:${C.tintaSuave};white-space:nowrap;">${esc(desconto.valor)}</td>
        </tr>` : ''}
        <tr>
          <td class="t2" style="padding:7px 0 0 0;font-family:${FONTE};font-size:14px;line-height:20px;color:${C.tintaSuave};">${esc(portes.rotulo)}</td>
          <td align="right" class="t2" style="padding:7px 0 0 12px;font-family:${FONTE};font-size:14px;line-height:20px;color:${C.tintaSuave};white-space:nowrap;">${esc(portes.valor)}</td>
        </tr>
        <tr>
          <td class="t" style="padding:12px 0 0 0;font-family:${FONTE};font-size:17px;line-height:24px;font-weight:700;color:${C.tinta};">Total</td>
          <td align="right" class="t" style="padding:12px 0 0 12px;font-family:${FONTE};font-size:17px;line-height:24px;font-weight:700;color:${C.tinta};white-space:nowrap;">${esc(total)}</td>
        </tr>
      </table>
    </td></tr>`;
}

/* Uma lista de pares rótulo/valor (os dados do cliente, no email à loja). O valor já vem em HTML. */
export function ficha(pares) {
  const filas = pares.map(([rotulo, valor]) => `
        <tr>
          <td valign="top" width="96" class="t2" style="width:96px;padding:4px 12px 4px 0;font-family:${FONTE};font-size:14px;line-height:21px;color:${C.tintaSuave};white-space:nowrap;">${esc(rotulo)}</td>
          <td valign="top" class="t" style="padding:4px 0;font-family:${FONTE};font-size:15px;line-height:21px;color:${C.tinta};">${valor}</td>
        </tr>`).join('');
  return `<tr><td class="p" style="padding:6px 40px 0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${filas}
      </table></td></tr>`;
}

/* O botão: VML para o Outlook clássico, tabela para os outros. 48 px de altura. */
export function botao(url, txt) {
  return `<tr><td align="center" class="p" style="padding:18px 40px 8px 40px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(url)}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="50%" strokecolor="${C.castanho}" fillcolor="${C.castanho}">
        <w:anchorlock/><center style="color:${C.botaoTexto};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${esc(txt)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="${C.castanho}" style="background-color:${C.castanho};border-radius:999px;">
          <a href="${esc(url)}" style="display:block;min-width:180px;padding:14px 28px;font-family:${FONTE};font-size:15px;line-height:20px;font-weight:700;color:${C.botaoTexto};text-decoration:none;border-radius:999px;">${esc(txt)}</a>
        </td></tr>
      </table>
      <!--<![endif]-->
    </td></tr>`;
}

/* O documento inteiro: o logótipo, o título, o subtítulo (o número e a data), o corpo e o rodapé.
   `preheader` é a linha que a lista de mensagens mostra. */
export function documento({ assunto, preheader, titulo, subtitulo, corpo, logo, marca, rodape }) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="pt-PT" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
<title>${esc(assunto)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>table,td,div,p,a,h1,h2{font-family:Arial,sans-serif !important;}</style>
<![endif]-->
<style>
  html,body{margin:0 !important;padding:0 !important;width:100% !important;}
  body{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;display:block;}
  a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}
  @media only screen and (max-width:620px){
    .w{width:100% !important;}
    .p{padding-left:20px !important;padding-right:20px !important;}
    .h1{font-size:24px !important;line-height:30px !important;}
  }
  @media (prefers-color-scheme:dark){
    .bg:not([class^="x_"]){background-color:${E.fundo} !important;}
    .card:not([class^="x_"]){background-color:${E.cartao} !important;}
    .t:not([class^="x_"]),.t:not([class^="x_"]) *{color:${E.tinta} !important;}
    .t2:not([class^="x_"]),.t2:not([class^="x_"]) *{color:${E.tintaSuave} !important;}
    .hr:not([class^="x_"]){border-color:${E.linha} !important;}
  }
  [data-ogsb] .bg{background-color:${E.fundo} !important;}
  [data-ogsb] .card{background-color:${E.cartao} !important;}
  [data-ogsc] .t,[data-ogsc] .t *{color:${E.tinta} !important;}
  [data-ogsc] .t2,[data-ogsc] .t2 *{color:${E.tintaSuave} !important;}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:${C.fundo};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bg" style="background-color:${C.fundo};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="w card" style="width:600px;max-width:600px;background-color:${C.cartao};border-radius:24px;">
    <tr><td align="center" class="card" style="background-color:${C.cartao};padding:28px 40px 4px 40px;border-radius:24px 24px 0 0;">
      <img src="${esc(logo)}" width="160" height="114" alt="${esc(marca)}" style="display:block;width:160px;height:114px;border:0;">
    </td></tr>
    <tr><td class="p" style="padding:16px 40px 2px 40px;">
      <h1 class="h1 t" style="margin:0 0 6px 0;font-family:${FONTE_TITULOS};font-size:26px;line-height:32px;font-weight:400;color:${C.tinta};">${esc(titulo)}</h1>
      <p class="t2" style="margin:0;font-family:${FONTE};font-size:14px;line-height:20px;color:${C.tintaSuave};">${esc(subtitulo)}</p>
    </td></tr>
${corpo}
    <tr><td style="padding:0 0 22px 0;font-size:0;line-height:0;">&nbsp;</td></tr>
  </table>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="w" style="width:600px;max-width:600px;">
    <tr><td align="center" class="t2" style="padding:18px 24px;font-family:${FONTE};font-size:12px;line-height:18px;color:${C.tintaSuave};">
      ${esc(rodape)}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
