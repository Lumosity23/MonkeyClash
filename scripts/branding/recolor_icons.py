"""Recolor Monkeytype's yellow icons and banner to the MonkeyClash red.

Every pixel between the serika background and the yellow logo color is moved
to the same spot between the background and the red, so antialiasing stays.
Usage (from the repo root): python3 scripts/branding/recolor_icons.py
"""

import glob

from PIL import Image

BG = (50, 52, 55)
YELLOW = (226, 183, 20)
RED = (202, 71, 84)  # #ca4754, main color of the monkeyclash theme
# how far from the bg->yellow line a pixel may be, grows with how yellow it is
# so faint grey antialiasing (e.g. banner text) is left alone
TOLERANCE = 45

FILES = (
    glob.glob("frontend/static/images/favicon/*.png")
    + glob.glob("frontend/static/images/icons/*.png")
)


def recolor_pixel(r, g, b):
    d = [YELLOW[i] - BG[i] for i in range(3)]
    p = [(r, g, b)[i] - BG[i] for i in range(3)]
    t = sum(p[i] * d[i] for i in range(3)) / sum(x * x for x in d)
    t = min(max(t, 0.0), 1.0)
    closest = [BG[i] + t * d[i] for i in range(3)]
    distance = sum(((r, g, b)[i] - closest[i]) ** 2 for i in range(3)) ** 0.5
    if t < 0.05 or distance > max(4.0, TOLERANCE * t):
        return r, g, b
    return tuple(round(BG[i] + t * (RED[i] - BG[i])) for i in range(3))


def recolor(image):
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            pixels[x, y] = (*recolor_pixel(r, g, b), a)
    return image


for path in FILES:
    recolor(Image.open(path)).save(path)
    print("recolored", path)

ico = "frontend/static/images/favicon/favicon.ico"
source = Image.open(ico)
sizes = sorted(source.info.get("sizes", {source.size}))
recolor(source).save(ico, sizes=sizes)
print("recolored", ico, sizes)

# base image of the README banner (scripts/banner/make_banner.py)
banner = "frontend/static/images/githubbanner-monkeyclash.png"
recolor(Image.open("frontend/static/images/githubbanner2.png")).save(banner)
print("recolored", banner)

svg = "frontend/static/images/favicon/favicon.svg"
with open(svg) as f:
    content = f.read()
with open(svg, "w") as f:
    f.write(content.replace("#e2b714", "#ca4754"))
print("recolored", svg)
