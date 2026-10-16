"""
Draws the home-screen icon: a dumbbell in Life Hub's green and paper, so the
two sit together on the phone.

    py tools/icons.py        # writes src/icons/*.png (needs Pillow)

The PNGs are committed, so this only runs again if the design changes.
Drawn 4x larger and scaled down, since Pillow doesn't smooth its edges.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src" / "icons"
GREEN = "#2F5D50"  # --green
PAPER = "#F5F1E8"  # --paper
SS = 4


def icon(size: int) -> Image.Image:
    n = size * SS
    img = Image.new("RGB", (n, n), GREEN)  # full bleed: iOS rounds the corners itself
    d = ImageDraw.Draw(img)
    c = n / 2
    u = n / 100  # everything inside the middle 64%, so round Android masks keep it whole
    d.rounded_rectangle([c - 32 * u, c - 4.5 * u, c + 32 * u, c + 4.5 * u], radius=4 * u, fill=PAPER)  # the bar
    for side in (-1, 1):
        for x0, x1, h in ((13, 22, 22), (22, 29, 14)):  # big plates inside, small ones out
            a, b = sorted((c + side * x0 * u, c + side * x1 * u))
            d.rounded_rectangle([a, c - h * u, b, c + h * u], radius=2.5 * u, fill=PAPER)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, size in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
        icon(size).save(OUT / name, optimize=True)
        print(OUT / name)


if __name__ == "__main__":
    main()
