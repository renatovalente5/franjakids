"""Fotografias e logótipo do site a partir de _cliente/ (que fica fora do git).

    python3 ferramentas/imagens.py

Lê  ferramentas/fotos.json  (fotografias soltas: nome → ficheiro do Instagram, texto alternativo, foco)
e   dados/produtos.json     (as de cada produto: p-<slug>-<n>)
Escreve assets/fotos/<nome>-<largura>.avif|webp|jpg (360/720/1080/1440, até à largura do original; nos produtos até 1080),
assets/fotos/fotos.json (tamanho, alt e foco de cada uma, para o gerador)
e assets/marca/logotipo-<largura>.png|webp a partir do recorte transparente.
Uma fotografia já feita e mais nova do que o original não se volta a fazer."""
import json, os
from PIL import Image, ImageOps

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
INSTAGRAM = os.path.join(RAIZ, '_cliente', 'instagram')
FOTOS = os.path.join(RAIZ, 'assets', 'fotos')
MARCA = os.path.join(RAIZ, 'assets', 'marca')


def origem(nome):
    # «CODIGO_01» é uma publicação; «17-t-shirt-adultos_05» é uma história de um destaque
    pasta = 'media' if nome[0].isupper() else os.path.join('destaques', 'media')
    return os.path.join(INSTAGRAM, pasta, nome if nome.endswith('.jpg') else nome + '.jpg')


def fazer(nome, src, larguras_max):
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    larguras = [w for w in (360, 720, 1080, 1440) if w <= min(im.width, larguras_max)] or [im.width]
    for w in larguras:
        base = os.path.join(FOTOS, f'{nome}-{w}')
        if os.path.exists(base + '.avif') and os.path.getmtime(base + '.avif') > os.path.getmtime(src):
            continue
        r = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        r.save(base + '.avif', quality=58, speed=6)
        r.save(base + '.webp', quality=80, method=6)
        r.save(base + '.jpg', quality=82, optimize=True, progressive=True)
    return {'w': im.width, 'h': im.height, 'larguras': larguras}


def fotos():
    os.makedirs(FOTOS, exist_ok=True)
    indice = {}
    for nome, f in json.load(open(os.path.join(RAIZ, 'ferramentas', 'fotos.json'))).items():
        indice[nome] = {**fazer(nome, origem(f['origem'].removesuffix('.jpg')), 1440), 'alt': f['alt'], 'foco': f.get('foco', '50% 50%')}
    for p in json.load(open(os.path.join(RAIZ, 'dados', 'produtos.json')))['produtos']:
        for i, (src, alt, *_) in enumerate(p['fotos'], 1):
            indice[f"p-{p['slug']}-{i}"] = {**fazer(f"p-{p['slug']}-{i}", origem(src), 1080), 'alt': alt, 'foco': '50% 45%'}
    json.dump(indice, open(os.path.join(FOTOS, 'fotos.json'), 'w'), ensure_ascii=False, indent=1)
    print(len(indice), 'fotografias')


def logotipo():
    os.makedirs(MARCA, exist_ok=True)
    im = Image.open(os.path.join(RAIZ, '_cliente', 'logotipo', 'logotipo-transparente.png')).convert('RGBA')
    for w in (320, 640, im.width):
        r = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        r.save(os.path.join(MARCA, f'logotipo-{w}.png'), optimize=True)
        r.save(os.path.join(MARCA, f'logotipo-{w}.webp'), quality=88, method=6)
    # ícone do separador: os três meninos, sem o nome, num quadrado creme
    caixa = im.getchannel('A').getbbox()
    bonecos = im.crop((caixa[0], caixa[1], caixa[2], caixa[1] + round((caixa[3] - caixa[1]) * 0.66)))
    lado = max(bonecos.size) + 40
    quadrado = Image.new('RGBA', (lado, lado), (255, 247, 228, 255))
    quadrado.alpha_composite(bonecos, ((lado - bonecos.width) // 2, (lado - bonecos.height) // 2))
    for w in (32, 180, 512):
        quadrado.resize((w, w), Image.LANCZOS).save(os.path.join(MARCA, f'icone-{w}.png'), optimize=True)
    print('logótipo', im.size)


if __name__ == '__main__':
    fotos()
    logotipo()
