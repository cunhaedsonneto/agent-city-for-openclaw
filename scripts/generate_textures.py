"""Gera as cinco texturas da maquete apenas com desenho procedural local.

Sem imagens de entrada ou acesso à rede. Requer Pillow; a semente e os parâmetros
fixos tornam a geração reproduzível na mesma versão da biblioteca.
"""

from math import cos, hypot, pi, sin
from pathlib import Path
from random import Random

from PIL import Image


OUTPUT = Path(__file__).resolve().parents[1] / "public" / "tex"
OUTPUT.mkdir(parents=True, exist_ok=True)


def save_rgb(name, size, pixel):
    rng = Random(1601026)
    image = Image.new("RGB", (size, size))
    image.putdata([pixel(x, y, size, rng) for y in range(size) for x in range(size)])
    image.save(OUTPUT / name, "JPEG", quality=86, optimize=True, progressive=True)


def clamp(value):
    return max(0, min(255, round(value)))


def asphalt(x, y, size, rng):
    broad = 6 * sin(2 * pi * x / size) * cos(2 * pi * y / size)
    grit = rng.gauss(0, 9)
    speck = 17 if rng.random() < 0.015 else 0
    shade = clamp(69 + broad + grit + speck)
    return shade, clamp(shade + 2), clamp(shade + 5)


def paving(x, y, size, rng):
    cell = size // 4
    joint = min(x % cell, y % cell) < 3
    slab = ((x // cell * 13 + y // cell * 7) % 9 - 4) * 1.5
    grain = rng.gauss(0, 3.5)
    shade = -52 if joint else slab + grain
    return tuple(clamp(base + shade) for base in (204, 199, 187))


def wood(x, y, size, rng):
    warp = 2.5 * sin(2 * pi * x / size) + 0.7 * sin(6 * pi * x / size)
    grain = sin(2 * pi * (y * 17 / size + warp / 17))
    streak = 0.5 * sin(2 * pi * (y * 47 / size + warp / 47))
    shade = 19 * grain + 6 * streak + rng.gauss(0, 2.5)
    return tuple(clamp(base + shade) for base in (151, 105, 68))


def plaster(x, y, size, rng):
    shade = 4 * sin(2 * pi * x / size) * cos(4 * pi * y / size) + rng.gauss(0, 3)
    value = clamp(231 + shade)
    return value, value, value


def contact_shadow():
    size = 256
    image = Image.new("RGBA", (size, size))
    center = (size - 1) / 2
    image.putdata([
        (0, 0, 0, clamp(230 * max(0, 1 - hypot(x - center, y - center) / center) ** 1.7))
        for y in range(size)
        for x in range(size)
    ])
    image.save(OUTPUT / "sombra_contato.png", optimize=True)


if __name__ == "__main__":
    save_rgb("asfalto_albedo.jpg", 512, asphalt)
    save_rgb("calcada_albedo.jpg", 512, paving)
    save_rgb("madeira_albedo.jpg", 512, wood)
    save_rgb("reboco_albedo.jpg", 512, plaster)
    contact_shadow()
    for path in sorted(OUTPUT.iterdir()):
        print(f"{path.name}: {path.stat().st_size} bytes")
