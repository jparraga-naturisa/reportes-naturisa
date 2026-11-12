"""
Genera el icono AF.ico para el acceso directo de escritorio de Activos Fijos.
Diseño: fondo degradado teal (paleta del dashboard), texto AF blanco, borde redondeado.
"""

from PIL import Image, ImageDraw, ImageFont

TEAL_DARK = (22, 48, 46)     # #16302E
TEAL      = (14, 124, 123)   # #0E7C7B
WHITE     = (255, 255, 255)
RUST      = (181, 96, 44)    # #B5602C — acento


def make_frame(size: int) -> Image.Image:
    s = size
    scale = 4
    S = s * scale

    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    for y in range(S):
        t = y / S
        r = int(TEAL_DARK[0] + (TEAL[0] - TEAL_DARK[0]) * t)
        g = int(TEAL_DARK[1] + (TEAL[1] - TEAL_DARK[1]) * t)
        b = int(TEAL_DARK[2] + (TEAL[2] - TEAL_DARK[2]) * t)
        d.line([(0, y), (S, y)], fill=(r, g, b, 255))

    r = int(S * 0.22)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
    img.putalpha(mask)

    stripe_h = max(4, int(S * 0.06))
    stripe_mask = Image.new("L", (S, S), 0)
    smd = ImageDraw.Draw(stripe_mask)
    smd.rounded_rectangle([0, 0, S - 1, stripe_h * 2], radius=r, fill=255)
    smd.rectangle([0, stripe_h, S, stripe_h * 2], fill=0)
    stripe_layer = Image.new("RGBA", (S, S), (*RUST, 220))
    img = Image.composite(stripe_layer, img, stripe_mask)

    d2 = ImageDraw.Draw(img)
    font = None
    for path in [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\calibrib.ttf"]:
        try:
            font = ImageFont.truetype(path, int(S * 0.42))
            break
        except Exception:
            continue

    text = "AF"
    bbox = d2.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (S - tw) // 2 - bbox[0]
    ty = (S - th) // 2 - bbox[1] + int(S * 0.04)
    d2.text((tx + 3, ty + 3), text, font=font, fill=(0, 0, 0, 80))
    d2.text((tx, ty), text, font=font, fill=(*WHITE, 255))

    img = img.resize((s, s), Image.LANCZOS)
    return img


sizes = [256, 128, 64, 48, 32, 16]
frames = [make_frame(s) for s in sizes]

output = r"C:\Scripts\Naturisa\activos-fijos\AF.ico"
frames[0].save(output, format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[1:])
print(f"Icono guardado: {output}")
