# Franja Kids — loja online

Roupa e presentes personalizados para bebés, crianças e família (@franjakids). Pré-visualização em
https://renatovalente5.github.io/franjakids/ (sem indexação; pagamentos ainda por ligar).

- `node src/build.mjs` gera o site em `_site/` (sem dependências). `BASE` e `SITE_URL` para o endereço;
  `PRODUCAO=1` torna-o indexável e pára a construção se faltar um preço ou a identificação da empresa.
- Dados: `dados/loja.json` (empresa, envios, portes grátis, «Mais pedidos»), `dados/catalogo.json` (linhas,
  categorias, ocasiões) e `dados/produtos.json` (produtos, fotografias, opções e personalização).
- Fotografias: `python3 ferramentas/imagens.py` lê `_cliente/` (fora do git: o Instagram e o logótipo) e escreve
  `assets/fotos/` e `assets/marca/`.
- Textos legais: `legal-comum/` (cópia da biblioteca partilhada, v1.1.2).
- `propostas/`: as três propostas da página inicial (escolhida a C, 9 nov 2026).
- Boas práticas aplicadas: `docs/boas-praticas.md`.
