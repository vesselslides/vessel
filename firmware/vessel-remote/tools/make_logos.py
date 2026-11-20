"""Turn Vessel's logo PNGs into RGB565 arrays for the screen (logos.h).

The screen has no transparency, so each logo is blended over the screen's
background colour (Vessel's dark theme, #0f161e).

    python3 -m pip install pillow
    python3 tools/make_logos.py
"""

from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent.parent
PNG = HERE.parent.parent / "brand" / "logo" / "png"
BG = (0x0F, 0x16, 0x1E)

# name, source file, box to fit in (width, height)
LOGOS = [
    ("LOGO_SPLASH", "vessel-slides-stacked-caps-reverse.png", (240, 200)),
    ("LOGO_HEADER", "vessel-slides-horizontal-reverse.png", (150, 40)),
    ("LOGO_SYMBOL", "vessel-slides-symbol-reverse.png", (26, 26)),
]


def rgb565(r: int, g: int, b: int) -> int:
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


def convert(name: str, file: str, box: tuple[int, int]) -> str:
    img = Image.open(PNG / file).convert("RGBA")
    img = img.crop(img.getbbox())  # trim the transparent edges
    img.thumbnail(box, Image.LANCZOS)
    bg = Image.new("RGBA", img.size, BG + (255,))
    flat = Image.alpha_composite(bg, img).convert("RGB")
    w, h = flat.size
    words = [rgb565(*flat.getpixel((x, y))) for y in range(h) for x in range(w)]
    rows = [", ".join(f"0x{v:04X}" for v in words[i : i + 16]) for i in range(0, len(words), 16)]
    body = ",\n  ".join(rows)
    return f"// {file}, {w}x{h}\nconst int {name}_W = {w}, {name}_H = {h};\nconst uint16_t {name}[] PROGMEM = {{\n  {body}\n}};\n"


def main() -> None:
    parts = ["// Made by tools/make_logos.py from brand/logo/png. Don't edit by hand.", "#pragma once", "#include <Arduino.h>", ""]
    parts += [convert(*logo) for logo in LOGOS]
    (HERE / "logos.h").write_text("\n".join(parts))
    print("Wrote", HERE / "logos.h")


if __name__ == "__main__":
    main()
