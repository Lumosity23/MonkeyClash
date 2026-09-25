"""Generate the loading page intro: the README banner animation (a red "clash"
falls on the "monkeytype" wordmark and knocks "type" off) as a vector wordmark
that takes the theme's colors.

Usage (needs `pip install fonttools`, fonts as in make_banner.py):
    python3 scripts/banner/make_intro.py fonts frontend/src/html/pages/loading.html

It replaces the <svg class="clashIntro"> of the page. The animation itself is
in frontend/src/styles/loading.scss, with the banner's timings.
"""

import os
import re
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONTS_DIR, PAGE = sys.argv[1], sys.argv[2]
LOGO_TSX = "frontend/src/ts/components/layout/header/Logo.tsx"

X_HEIGHT = 23  # px, like "clash" on the banner
BASELINE = 40
PAD = 8


def font(name, wght):
    f = TTFont(os.path.join(FONTS_DIR, name))
    glyphs = f.getGlyphSet(location={"wght": wght} if "fvar" in f else None)
    return f, glyphs


def word_path(fnt, text, x, tracking=0.0):
    """Path of `text` with its x-height at X_HEIGHT px, baseline at BASELINE.
    Returns the path and the x where the next word starts."""
    f, glyphs = fnt
    scale = X_HEIGHT / f["OS/2"].sxHeight
    cmap = f.getBestCmap()
    pen = SVGPathPen(glyphs, ntos=lambda n: f"{n:.2f}".rstrip("0").rstrip("."))
    for char in text:
        name = cmap[ord(char)]
        glyph = glyphs[name]
        glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, x, BASELINE)))
        x += glyph.width * scale + tracking
    return pen.getCommands(), x


lexend = font("LexendDeca.ttf", 400)
mono = font("RobotoMono.ttf", 600)
em = X_HEIGHT / lexend[0]["OS/2"].sxHeight * lexend[0]["head"].unitsPerEm

# the logo, like the header: 1.5 x-heights tall, centred on the x-height
tsx = open(LOGO_TSX).read()
logo_paths = re.findall(r'<path d="([^"]+)"', tsx)
logo_c = re.search(r'd="(M -465[^"]+)"', tsx).group(1)
logo_h = X_HEIGHT * 1.5
logo_scale = logo_h / 180
logo_w = 300 * logo_scale
logo_y = BASELINE - X_HEIGHT / 2 - logo_h / 2
logo = (
    f'<g class="ciLogo" transform="translate({PAD} {logo_y:.2f}) '
    f'scale({logo_scale:.4f}) translate(680 1030)">'
    + "".join(f'<path d="{d.strip()}"/>' for d in logo_paths)
    + f'<path d="{logo_c}" fill="none" stroke="currentColor" '
    'stroke-width="20" stroke-linecap="round"/></g>'
)

x = PAD + logo_w + em * 0.25
monkey, x = word_path(lexend, "monkey", x)
type_x = x
typ, type_end = word_path(lexend, "type", x)
clash, clash_end = word_path(mono, "clash", x, tracking=-1)
width = max(type_end, clash_end) + PAD
height = BASELINE + X_HEIGHT

# where the banner's transforms pivot: the middle of each word
style = (
    f"--ci-type-origin: {(type_x + type_end) / 2:.1f}px {BASELINE - X_HEIGHT / 2:.1f}px;"
    f" --ci-clash-origin: {(type_x + clash_end) / 2:.1f}px {BASELINE:.1f}px"
)

svg = (
    f'<svg class="clashIntro" viewBox="0 0 {width:.1f} {height:.1f}" '
    f'style="{style}" role="img" aria-label="MonkeyClash">'
    f'<g class="ciShake">{logo}<path class="ciText" d="{monkey}"/></g>'
    f'<g class="ciKnocked"><path class="ciText" d="{typ}"/></g>'
    f'<g class="ciDrop"><path d="{clash}"/></g>'
    "</svg>"
)

page = open(PAGE).read()
page, count = re.subn(
    r'<svg class="clashIntro".*?</svg>|<img class="clashIntro"[^>]*/>',
    svg,
    page,
    flags=re.S,
)
assert count == 1, "no clashIntro in the page"
open(PAGE, "w").write(page)
print(f"intro written to {PAGE} ({len(svg)} bytes, {width:.0f}x{height:.0f})")
