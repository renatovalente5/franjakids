#!/usr/bin/env python3
"""As fotografias do site da Franja Kids em versões para a web (e as duas que o painel mostra).

Lê:
  media/fotos/*.jpg     as fotografias originais (cada uma tem de estar em content/fotos.json, com a
                        descrição e o ponto de foco)

Escreve em .cache/imagens/ (fica entre publicações; cada ficheiro leva no nome um resumo do
original, por isso só se refaz o que mudou) e um manifesto, .cache/imagens/manifesto.json, que o
src/build.mjs lê para escrever os <picture> e copia para _site/assets/img/.

    python3 scripts/imagens.py              # faz o que falta
    python3 scripts/imagens.py --verificar  # só confere que fotos.json e media/fotos batem certo

(O logótipo e os ícones estão feitos em assets/marca/: não mudam com o conteúdo.)
"""
import hashlib
import json
import os
import sys

from PIL import Image, ImageOps, features

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FOTOS = os.path.join(RAIZ, 'media', 'fotos')
INDICE = os.path.join(RAIZ, 'content', 'fotos.json')
CACHE = os.path.join(RAIZ, '.cache', 'imagens')

LARGURAS = [360, 720, 1080, 1440]
QUALIDADE_AVIF = 58
QUALIDADE_WEBP = 80
QUALIDADE_JPEG = 82
LARGURA_JPEG = 1080             # uma só, para o cartão de partilha (o WhatsApp e o Facebook não leem AVIF)
FORMATOS = ('avif', 'webp') if features.check('avif') else ('webp',)
VERSAO = f'v1-fk-{LARGURAS}-{QUALIDADE_AVIF}-{QUALIDADE_WEBP}-{QUALIDADE_JPEG}-{LARGURA_JPEG}'


def resumo(caminho, extra=''):
    h = hashlib.sha256((VERSAO + extra).encode())
    with open(caminho, 'rb') as f:
        h.update(f.read())
    return h.hexdigest()[:10]


def abrir(caminho):
    return ImageOps.exif_transpose(Image.open(caminho)).convert('RGB')


def guardar(im, destino, formato):
    if os.path.exists(destino):
        return
    tmp = destino + '.tmp'
    if formato == 'avif':
        im.save(tmp, 'AVIF', quality=QUALIDADE_AVIF, speed=6)
    elif formato == 'webp':
        im.save(tmp, 'WEBP', quality=QUALIDADE_WEBP, method=6)
    else:
        im.save(tmp, 'JPEG', quality=QUALIDADE_JPEG, optimize=True, progressive=True)
    os.replace(tmp, destino)


def versoes(nome, origem):
    """AVIF + WebP nas larguras que a fotografia aguenta (nunca se aumenta), e um JPEG."""
    h = resumo(origem)
    im = None
    with Image.open(origem) as cabeca:
        largura, altura = ImageOps.exif_transpose(cabeca).size
    larguras = [w for w in LARGURAS if w < largura] + [largura] if largura < LARGURAS[-1] else list(LARGURAS)
    jpg = min(LARGURA_JPEG, largura)
    precisa = [f'{nome}-{h}-{w}.{fmt}' for w in larguras for fmt in FORMATOS] + [f'{nome}-{h}-{jpg}.jpg']
    if not all(os.path.exists(os.path.join(CACHE, f)) for f in precisa):
        im = abrir(origem)
        for w in sorted(set(larguras + [jpg])):
            reduzida = im if w == im.width else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
            if w in larguras:
                for fmt in FORMATOS:
                    guardar(reduzida, os.path.join(CACHE, f'{nome}-{h}-{w}.{fmt}'), fmt)
            if w == jpg:
                guardar(reduzida, os.path.join(CACHE, f'{nome}-{h}-{w}.jpg'), 'jpg')
    return {'largura': largura, 'altura': altura, 'resumo': h, 'larguras': larguras, 'formatos': list(FORMATOS), 'jpg': jpg}


# As duas versões que o PAINEL mostra (o painel só sabe o nome da fotografia, não o resumo das
# versões web): a miniatura das grelhas e a grande da janela de cada fotografia.
PAINEL = {'miniatura': 320, 'grande': 1024}


def para_o_painel(nome, origem, tipo):
    """assets/img/<tipo>-<nome>.webp, com o lado maior de PAINEL[tipo] px. Nome fixo de propósito:
    uma fotografia nova tem sempre um nome novo, por isso o conteúdo de um nome nunca muda. O
    <ficheiro>.resumo ao lado diz de que original foi feita (e não vai para o site)."""
    destino = os.path.join(CACHE, f'{tipo}-{nome}.webp')
    marca = destino + '.resumo'
    h = resumo(origem, extra=f'{tipo}-{PAINEL[tipo]}')
    if os.path.exists(destino) and os.path.exists(marca) and open(marca).read() == h:
        return os.path.basename(destino)
    im = abrir(origem)
    im.thumbnail((PAINEL[tipo], PAINEL[tipo]), Image.LANCZOS)
    if os.path.exists(destino):
        os.remove(destino)
    guardar(im, destino, 'webp')
    with open(marca, 'w') as f:
        f.write(h)
    return os.path.basename(destino)


def verificar():
    """→ (erros, avisos). Uma fotografia sem descrição pára (o site não a pode mostrar sem o texto
    alternativo); uma descrição sem fotografia só avisa (o gerador nunca a usa)."""
    indice = json.load(open(INDICE, encoding='utf-8'))
    ficheiros = {os.path.splitext(f)[0] for f in os.listdir(FOTOS) if f.lower().endswith('.jpg')}
    erros, avisos = [], []
    for nome in sorted(ficheiros - set(indice)):
        erros.append(f'Fotografias: a fotografia «{nome}» não tem descrição (texto alternativo) em content/fotos.json')
    for nome in sorted(set(indice) - ficheiros):
        avisos.append(f'Fotografias: a descrição de «{nome}» não tem fotografia em media/fotos/')
    for nome, d in indice.items():
        if nome in ficheiros and not (isinstance(d, dict) and (d.get('alt') or '').strip()):
            erros.append(f'Fotografias: a fotografia «{nome}» não tem descrição (texto alternativo)')
    return erros, avisos


def anotar(nivel, texto):
    """No GitHub Actions, a mensagem vai também como anotação: é o que o painel lê para dizer porque
    é que a publicação parou (o título é o ecrã, antes dos dois pontos)."""
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        return
    dados = lambda t: t.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    titulo, _, resto = texto.partition(': ')
    if resto:
        print(f'::{nivel} title={dados(titulo).replace(":", "%3A").replace(",", "%2C")}::{dados(resto)}')
    else:
        print(f'::{nivel}::{dados(texto)}')


def principal():
    erros, avisos = verificar()
    for a in avisos:
        print(f'  ! {a}', file=sys.stderr)
        anotar('warning', a)
    if erros:
        print('\n'.join(erros), file=sys.stderr)
        for e in erros[:10]:
            anotar('error', e)
        sys.exit(1)
    if '--verificar' in sys.argv:
        print('fotografias conferidas:', len(json.load(open(INDICE, encoding='utf-8'))))
        return
    os.makedirs(CACHE, exist_ok=True)
    manifesto = {'fotos': {}}
    for f in sorted(os.listdir(FOTOS)):
        nome, ext = os.path.splitext(f)
        if ext.lower() != '.jpg':
            continue
        origem = os.path.join(FOTOS, f)
        manifesto['fotos'][nome] = versoes(nome, origem)
        manifesto['fotos'][nome]['painel'] = [para_o_painel(nome, origem, t) for t in PAINEL]
    # tira da cache o que já não é de nenhuma versão actual (fotografias trocadas ou apagadas)
    vivos = set()
    for nome, d in manifesto['fotos'].items():
        for w in d['larguras']:
            for fmt in d['formatos']:
                vivos.add(f'{nome}-{d["resumo"]}-{w}.{fmt}')
        vivos.add(f'{nome}-{d["resumo"]}-{d["jpg"]}.jpg')
        for f in d['painel']:
            vivos.update([f, f + '.resumo'])
    for f in os.listdir(CACHE):
        if f != 'manifesto.json' and f not in vivos:
            os.remove(os.path.join(CACHE, f))
    with open(os.path.join(CACHE, 'manifesto.json'), 'w', encoding='utf-8') as f:
        json.dump(manifesto, f, ensure_ascii=False, indent=1)
    print(f'imagens: {len(manifesto["fotos"])} fotografias ({", ".join(FORMATOS)} + jpg)')


if __name__ == '__main__':
    principal()
