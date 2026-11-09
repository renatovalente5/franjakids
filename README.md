# Franja Kids — loja online

Roupa e presentes personalizados para bebés, crianças e família (@franjakids). Pré-visualização em
https://renatovalente5.github.io/franjakids/ (sem indexação; o pagamento no site liga-se no fim).

## Gerar

```bash
python3 scripts/imagens.py      # as versões web das fotografias (.cache/imagens; só refaz o que mudou)
node src/build.mjs              # o site em _site/ (sem dependências)
PYTHON=python3 node scripts/testar.mjs
```

`src/build.mjs` aceita `--base=/franjakids`, `--site=https://…`, `--producao` (indexável; as regras de
produção param a publicação sem os dados legais e escondem os produtos sem preço) e `--api=` (o Worker
das encomendas).

## O conteúdo (o que o painel edita)

- `content/loja.json`: a marca, o tempo de produção, as entregas e os portes (quatro zonas fixas), o modo
  da loja online (`encomenda` ou `online`) e os dados legais.
- `content/catalogo.json`: as três linhas (Personalizados, Bebé, Presentes), as categorias, as ocasiões,
  os conjuntos de tamanhos e a paleta das cores.
- `content/produtos/<slug>.json`: um produto por ficheiro (o nome do ficheiro é o endereço).
- `content/fotos.json` e `media/fotos/<nome>.jpg`: a biblioteca das fotografias (os originais, com a
  descrição e o ponto de foco).

As regras de tudo isto estão num só ficheiro, `src/lib/regras.mjs`, que o gerador, o painel (cópia byte
a byte) e o Worker das encomendas usam. O CI (`.github/workflows/pre-visualizacao.yml`) faz as imagens,
corre os testes sobre um conteúdo de ensaio próprio (`scripts/testes/conteudo`) e publica no GitHub
Pages; as razões de uma publicação parada vão em anotações, que o painel mostra.

## As encomendas

O contrato entre o site, o Worker `franjakids-encomendas` (`worker/encomendas/`) e o painel
(`renatovalente5/franjakids-painel`) está em [docs/ENCOMENDAS.md](docs/ENCOMENDAS.md).

## Outros

- Textos legais: `legal-comum/` (cópia da biblioteca partilhada, v1.1.2).
- `propostas/`: as três propostas da página inicial (escolhida a C, 9 nov 2026).
- Boas práticas aplicadas: `docs/boas-praticas.md`.
- `_cliente/` (fora do git): o material do Instagram e da conversa com o cliente.
