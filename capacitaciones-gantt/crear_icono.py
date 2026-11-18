"""
Genera el icono CAP.ico para el acceso directo de escritorio del Plan de capacitaciones.
Diseño: fondo degradado navy (paleta del dashboard), texto CAP blanco, franja celeste, borde redondeado.
"""

from PIL import Image, ImageDraw, ImageFont

TEAL_DARK = (15, 35, 56)     # navy oscuro
TEAL      = (26, 58, 92)     # #1a3a5c --primary
WHITE     = (255, 255, 255)
RUST      = (0, 180, 216)    # #00b4d8 --accent

TEXT = "CAP"


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

    # Barras tipo Gantt bajo el texto
    bar_x = int(S * 0.22)
    bar_w = [int(S * 0.40), int(S * 0.30), int(S * 0.46)]
    bar_off = [0, int(S * 0.10), int(S * 0.05)]
    bar_h = int(S * 0.055)
    bar_y = int(S * 0.66)
    for i, (w, off) in enumerate(zip(bar_w, bar_off)):
        y0 = bar_y + i * int(bar_h * 1.75)
        col = (*RUST, 235) if i % 2 == 0 else (*WHITE, 190)
        d2.rounded_rectangle([bar_x + off, y0, bar_x + off + w, y0 + bar_h],
                             radius=bar_h // 2, fill=col)

    # Texto
    font = None
    font_size = int(S * 0.34) if len(TEXT) > 2 else int(S * 0.42)
    for path in [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\calibrib.ttf"]:
        try:
            font = ImageFont.truetype(path, font_size)
            break
        except Exception:
            continue

    bbox = d2.textbbox((0, 0), TEXT, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (S - tw) // 2 - bbox[0]
    ty = int(S * 0.30) - th // 2 - bbox[1]
    d2.text((tx + 3, ty + 3), TEXT, font=font, fill=(0, 0, 0, 80))
    d2.text((tx, ty), TEXT, font=font, fill=(*WHITE, 255))

    img = img.resize((s, s), Image.LANCZOS)
    return img


sizes = [256, 128, 64, 48, 32, 16]
frames = [make_frame(s) for s in sizes]

output = r"C:\Scripts\Naturisa\capacitaciones-gantt\CAP.ico"
frames[0].save(output, format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[1:])
print(f"Icono guardado: {output}")
