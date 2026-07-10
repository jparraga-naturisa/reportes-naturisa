"""
Genera el icono AP1.ico para el acceso directo de escritorio.
Diseño: fondo degradado navy, texto AP1 blanco, borde redondeado.
"""

import math
from PIL import Image, ImageDraw, ImageFilter

NAVY   = (31,  56, 100)   # #1F3864
BLUE   = (46, 117, 182)   # #2E75B6
WHITE  = (255, 255, 255)
CYAN   = (168, 200, 232)  # #A8C8E8 — acento suave


def make_frame(size: int) -> Image.Image:
    s = size
    scale = 4                          # supersamplear para bordes suaves
    S = s * scale

    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # --- Fondo con degradado navy → blue -----------------------------------
    for y in range(S):
        t = y / S
        r = int(NAVY[0] + (BLUE[0] - NAVY[0]) * t * 0.6)
        g = int(NAVY[1] + (BLUE[1] - NAVY[1]) * t * 0.6)
        b = int(NAVY[2] + (BLUE[2] - NAVY[2]) * t * 0.6)
        d.line([(0, y), (S, y)], fill=(r, g, b, 255))

    # --- Bordes redondeados (radio = 22 % del lado) -------------------------
    r = int(S * 0.22)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
    img.putalpha(mask)

    # --- Línea de acento en la parte superior -------------------------------
    stripe_h = max(4, int(S * 0.06))
    stripe_mask = Image.new("L", (S, S), 0)
    smd = ImageDraw.Draw(stripe_mask)
    smd.rounded_rectangle([0, 0, S - 1, stripe_h * 2], radius=r, fill=255)
    smd.rectangle([0, stripe_h, S, stripe_h * 2], fill=0)
    stripe_layer = Image.new("RGBA", (S, S), (*CYAN, 220))
    img = Image.composite(stripe_layer, img, stripe_mask)

    # --- Texto "AP1" --------------------------------------------------------
    d2 = ImageDraw.Draw(img)

    # Intentar cargar fuente bold; caer a default si no existe
    font_ap1 = None
    font_nat = None
    for path in [
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\calibrib.ttf",
        r"C:\Windows\Fonts\consola.ttf",
    ]:
        try:
            from PIL import ImageFont
            font_ap1 = ImageFont.truetype(path, int(S * 0.44))
            font_nat = ImageFont.truetype(path, int(S * 0.13))
            break
        except Exception:
            continue

    # "JP" centrado verticalmente
    text_jp = "JP"
    bbox = d2.textbbox((0, 0), text_jp, font=font_ap1)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (S - tw) // 2 - bbox[0]
    ty = (S - th) // 2 - bbox[1] + int(S * 0.04)
    # sombra suave
    d2.text((tx + 3, ty + 3), text_jp, font=font_ap1, fill=(0, 0, 0, 80))
    d2.text((tx, ty), text_jp, font=font_ap1, fill=(*WHITE, 255))

    # --- Reducir al tamaño final con antialiasing ---------------------------
    img = img.resize((s, s), Image.LANCZOS)
    return img


sizes = [256, 128, 64, 48, 32, 16]
frames = [make_frame(s) for s in sizes]

output = r"c:\Scripts\Naturisa\AP1.ico"
frames[0].save(
    output,
    format="ICO",
    sizes=[(s, s) for s in sizes],
    append_images=frames[1:],
)
print(f"Icono guardado: {output}")
