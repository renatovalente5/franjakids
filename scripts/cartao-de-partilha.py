"""O cartão de partilha (og:image) do início e das páginas gerais: o logótipo ao centro, no fundo do site, 1200×630.

Regra do Renato (16 nov 2026): quem recebe o link no WhatsApp vê a marca, nunca a fotografia de uma peça com o nome
de um cliente. O logótipo vai reduzido do desenho de 1185 px (nunca aumentado). JPEG com subsampling=0 (as letras
ficam nítidas). O nome leva um resumo do conteúdo, porque os ficheiros de assets/ ficam um ano em cache.

    python3 scripts/cartao-de-partilha.py        → assets/marca/franjakids-<resumo>-partilha.jpg (e diz o nome)
"""
import hashlib, io, pathlib
from PIL import Image

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FUNDO = (0xF7, 0xEE, 0xDF)          # --fundo do site.css
LARGURA, ALTURA = 1200, 630
ALTURA_DO_LOGO = 470                 # deixa 80 px de margem em cima e em baixo

logo = Image.open(RAIZ / 'assets/marca/logotipo-1185.png').convert('RGBA')
escala = ALTURA_DO_LOGO / logo.height
assert escala <= 1, 'o logótipo nunca se aumenta'
logo = logo.resize((round(logo.width * escala), ALTURA_DO_LOGO), Image.LANCZOS)
cartao = Image.new('RGB', (LARGURA, ALTURA), FUNDO)
cartao.paste(logo, ((LARGURA - logo.width) // 2, (ALTURA - logo.height) // 2), logo)

saida = io.BytesIO()
cartao.save(saida, 'JPEG', quality=90, subsampling=0, optimize=True, progressive=True)
dados = saida.getvalue()
resumo = hashlib.sha256(dados).hexdigest()[:10]
pasta = RAIZ / 'assets/marca'
for velho in pasta.glob('franjakids-*-partilha.jpg'):
    velho.unlink()
nome = f'franjakids-{resumo}-partilha.jpg'
(pasta / nome).write_bytes(dados)
print(nome, len(dados), 'bytes')
