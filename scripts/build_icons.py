from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

SRC = Path("assets/icon.png")
OUT = {
    "icon-192.png": (192, "any"),
    "icon-512.png": (512, "any"),
    "icon-192-maskable.png": (192, "maskable"),
    "icon-512-maskable.png": (512, "maskable"),
}


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    sys.exit(1)


def render_any(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), Image.Resampling.LANCZOS)


def render_maskable(source: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * 0.8)
    offset = (size - inner) // 2
    rendered = source.resize((inner, inner), Image.Resampling.LANCZOS)
    canvas.paste(rendered, (offset, offset), rendered)
    return canvas


def main() -> None:
    if not SRC.exists():
        fail("Missing source file: assets/icon.png")

    with Image.open(SRC) as img:
        source = img.convert("RGBA")

    min_side = min(source.size)
    if min_side < 512:
        fail(
            "assets/icon.png is too small. Minimum recommended size is 512x512. "
            "Provide a larger square image, then rerun this script."
        )

    for filename, (size, kind) in OUT.items():
        output = Path("assets") / filename
        if kind == "maskable":
            rendered = render_maskable(source, size)
        else:
            rendered = render_any(source, size)
        rendered.save(output, format="PNG", optimize=True)
        print(f"Generated {output} ({size}x{size}, {kind})")


if __name__ == "__main__":
    main()
