#!/usr/bin/env python3
"""Build the globe textures used by the site from the three-globe example images.

Outputs (public/textures/):
  earth-day-{4k,2k}.jpg  Blue Marble day imagery
  earth-aux-{4k,2k}.jpg  Packed helper maps: R = city lights, G = water mask, B = clouds

Run after `npm install` (the source images ship inside node_modules/three-globe):
  python3 tools/prepare_textures.py
Requires Pillow and numpy.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules" / "three-globe" / "example"
OUT = ROOT / "public" / "textures"

SIZES = {"4k": (4096, 2048), "2k": (2048, 1024)}


def load_rgb(path):
    return Image.open(path).convert("RGB")


def city_lights(night):
    """Isolate the warm city lights from the bluish 'black marble' night image."""
    a = np.asarray(night).astype(np.float32)
    r, b = a[..., 0], a[..., 2]
    lights = np.clip((r - 0.25 * b - 6.0) * 3.0, 0, 255) / 255.0
    lights = np.power(lights, 0.9)  # lift mid-tones a little
    return Image.fromarray((lights * 255).astype(np.uint8), "L")


def cloud_alpha(path):
    clouds = Image.open(path).convert("RGBA")
    return clouds.getchannel("A")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    day = load_rgb(SRC / "img" / "earth-blue-marble.jpg")
    lights = city_lights(load_rgb(SRC / "img" / "earth-night.jpg"))
    water = Image.open(SRC / "img" / "earth-water.png").convert("L")
    clouds = cloud_alpha(SRC / "clouds" / "clouds.png")

    for tag, size in SIZES.items():
        d = day.resize(size, Image.LANCZOS)
        d.save(OUT / f"earth-day-{tag}.jpg", quality=86, optimize=True, progressive=True)

        aux = Image.merge(
            "RGB",
            (
                lights.resize(size, Image.LANCZOS),
                water.resize(size, Image.BILINEAR),
                clouds.resize(size, Image.LANCZOS),
            ),
        )
        # 4:4:4 chroma keeps the packed channels from bleeding into each other.
        aux.save(OUT / f"earth-aux-{tag}.jpg", quality=84, subsampling=0, optimize=True, progressive=True)

    for f in sorted(OUT.iterdir()):
        print(f"{f.name:24s} {f.stat().st_size / 1024:8.0f} KB")


if __name__ == "__main__":
    main()
