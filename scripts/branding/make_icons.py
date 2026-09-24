"""Draw the MonkeyClash logo into every icon.

Monkeytype has two marks: the keyboard ("m" and "t." keys) used by the big
icons and the banner, and the "mt" letters used by the small favicons. In
MonkeyClash the "t" is a "c". This script:
- writes frontend/static/images/monkeyclash-logo.svg from the header logo
  (frontend/src/ts/components/layout/header/Logo.tsx),
- replaces the keyboard in the big icons and the banner base image,
- redraws the small favicons (png, ico, svg) with the "mc" letters.

Run recolor_icons.py first (yellow -> red), then this, from the repo root:
    python3 scripts/branding/make_icons.py
Needs Pillow and google-chrome (used to render the SVGs).
"""

import os
import re
import subprocess
import tempfile

from PIL import Image

RED = (202, 71, 84)  # #ca4754, main color of the monkeyclash theme
BG = "#323437"
SCALE = 4  # render bigger then downsample, for clean antialiasing

IMAGES = "frontend/static/images"
KEYBOARD_ICONS = [
    f"{IMAGES}/favicon/android-chrome-192x192.png",
    f"{IMAGES}/favicon/android-chrome-512x512.png",
    f"{IMAGES}/favicon/apple-touch-icon.png",
    f"{IMAGES}/favicon/mstile-70x70.png",
    f"{IMAGES}/favicon/mstile-150x150.png",
    f"{IMAGES}/favicon/mstile-310x150.png",
    f"{IMAGES}/favicon/mstile-310x310.png",
    f"{IMAGES}/icons/general_icon_x512.png",
    f"{IMAGES}/icons/maskable_icon_x512.png",
    f"{IMAGES}/githubbanner-monkeyclash.png",
]

# "mc" letters for the small favicons, in the favicon's 64x64 box. The "m" is
# Monkeytype's, moved left to make room for the "c".
M_PATH = (
    "M9.09 24.1v21.2h5.12V33.1q.256-4.61 4.48-4.61 3.46.384 3.46 3.84v12.9h5.12"
    "v-11.5q-.128-5.25 4.48-5.25 3.46.384 3.46 3.84v12.9h5.12v-12.2q0-9.47-7.04"
    "-9.47-4.22 0-7.04 3.46-2.18-3.46-6.02-3.46-3.46 0-6.02 2.43v-2.05"
)
M_SHIFT = -4.8
C_PATH = "M 57.13 28.67 A 8.24 8.24 0 1 0 57.13 40.33"
BG_PATH = "M0 16Q0 0 16 0h32q16 0 16 16v32q0 16-16 16H16Q0 64 0 48"


def favicon_svg(main, bg):
    return f"""<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path d="{BG_PATH}" fill="{bg}"/>
  <path d="{M_PATH}" transform="translate({M_SHIFT} 0)" fill="{main}"/>
  <path d="{C_PATH}" fill="none" stroke="{main}" stroke-width="5.12"/>
</svg>
"""


def logo_svg():
    """The header logo as a standalone svg (viewBox = the keyboard frame)."""
    tsx = open("frontend/src/ts/components/layout/header/Logo.tsx").read()
    svg = re.search(r"<svg.*?</svg>", tsx, re.S).group(0)
    svg = re.sub(r"\{/\*.*?\*/\}", "", svg)
    svg = re.sub(r'\s+class=\{cn\(.*?\)\}', "", svg, flags=re.S)
    # JSX style objects -> plain svg attributes
    svg = re.sub(
        r"style=\{\{(.*?)\}\}",
        lambda m: " ".join(
            f'{k}="{v}"' for k, v in re.findall(r'"([\w-]+)":\s*"([^"]*)"', m.group(1))
        ),
        svg,
    )
    svg = svg.replace("></path>", "/>").replace("currentColor", "#ca4754")
    return svg.replace("<g>", '<g fill="#ca4754">', 1)


def render(svg, width, height):
    """Render an svg to a transparent RGBA image of the given size."""
    with tempfile.TemporaryDirectory() as tmp:
        html = os.path.join(tmp, "page.html")
        png = os.path.join(tmp, "shot.png")
        sized = re.sub(
            r"<svg ",
            f'<svg width="{width}" height="{height}" preserveAspectRatio="none" ',
            svg,
            count=1,
        )
        with open(html, "w") as f:
            f.write(f'<html><body style="margin:0;background:transparent">{sized}</body></html>')
        subprocess.run(
            ["google-chrome", "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--default-background-color=00000000", f"--window-size={width},{height}",
             f"--screenshot={png}", f"file://{html}"],
            capture_output=True,
            check=True,
        )
        return Image.open(png).convert("RGBA").crop((0, 0, width, height))


def logo_bbox(image):
    """Bounding box of the red logo pixels."""
    px = image.load()
    xs, ys = [], []
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = px[x, y]
            if a > 128 and abs(r - RED[0]) + abs(g - RED[1]) + abs(b - RED[2]) < 40:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def redraw_keyboard(path, logo):
    image = Image.open(path).convert("RGBA")
    x0, y0, x1, y1 = logo_bbox(image)
    w, h = x1 - x0, y1 - y0
    # just left of the keyboard frame is plain background
    background = image.getpixel((max(x0 - 2, 0), y0 + h // 2))
    image.paste(background, (x0, y0, x1, y1))
    drawn = render(logo, w * SCALE, h * SCALE).resize((w, h), Image.LANCZOS)
    image.alpha_composite(drawn, (x0, y0))
    image.save(path)
    print("redrew keyboard in", path, (x0, y0, w, h))


def main():
    logo = logo_svg()
    with open(f"{IMAGES}/monkeyclash-logo.svg", "w") as f:
        f.write(logo)
    print("wrote", f"{IMAGES}/monkeyclash-logo.svg")

    for path in KEYBOARD_ICONS:
        redraw_keyboard(path, logo)

    favicon = favicon_svg("#ca4754", BG)
    with open(f"{IMAGES}/favicon/favicon.svg", "w") as f:
        f.write(favicon)
    for size in (16, 32):
        image = render(favicon, size * SCALE, size * SCALE)
        image.resize((size, size), Image.LANCZOS).save(f"{IMAGES}/favicon/favicon-{size}x{size}.png")
    big = render(favicon, 48 * SCALE, 48 * SCALE).resize((48, 48), Image.LANCZOS)
    big.save(f"{IMAGES}/favicon/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("redrew favicon svg, png and ico")


main()
