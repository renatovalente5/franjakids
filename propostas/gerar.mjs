// Gera as propostas da página inicial: node propostas/gerar.mjs
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const propostas = [['a', 'Creme'], ['b', 'Oliva'], ['c', 'Areia']].filter(([p]) => existsSync(`${AQUI}${p}/pagina.mjs`));
for (const [p] of propostas) {
  const { default: pagina } = await import(`./${p}/pagina.mjs`);
  writeFileSync(`${AQUI}${p}/index.html`, pagina());
  console.log('escrita', `${p}/index.html`);
}
writeFileSync(`${AQUI}index.html`, `<!doctype html>
<html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Franja Kids · Propostas</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-content:center;gap:12px;background:#FFF7E4;color:#3E2A22;font:18px/1.5 system-ui,sans-serif;padding:24px}a{display:block;padding:16px 22px;border-radius:16px;background:#fff;text-decoration:none;font-weight:600}</style>
<h1 style="font-size:22px;margin:0 0 8px">Franja Kids · propostas da página inicial</h1>
${propostas.map(([p, n]) => `<a href="${p}/">Proposta ${p.toUpperCase()} · ${n}</a>`).join('\n')}
</html>
`);
