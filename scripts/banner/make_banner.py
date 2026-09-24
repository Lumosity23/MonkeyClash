"""Generate the MonkeyClash README banner: the Monkeytype banner with a red
"clash" that falls from the top and crashes onto it.

Usage (needs `pip install fonttools`), with the fonts in one directory:
    mkdir fonts && cd fonts
    curl -Lo LexendDeca.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/lexenddeca/LexendDeca%5Bwght%5D.ttf"
    curl -Lo RobotoMono.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/robotomono/RobotoMono%5Bwght%5D.ttf"
    curl -LO https://raw.githubusercontent.com/google/fonts/main/ofl/sedgwickavedisplay/SedgwickAveDisplay-Regular.ttf
    cd ..
    python3 scripts/banner/make_banner.py fonts \
        frontend/static/images/githubbanner2.png frontend/static/images/monkeyclash-banner.svg [variant]

`variant` picks one of the VARIANTS below (default: "mono").
"""

import base64
import math
import os
import random
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.pointInsidePen import PointInsidePen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONTS_DIR = sys.argv[1]
PNG = sys.argv[2]
OUT = sys.argv[3]
VARIANT = sys.argv[4] if len(sys.argv) > 4 else "mono"

W, H = 793, 275
# serika dark, Monkeytype's default theme
BG, ERROR = "#323437", "#ca4754"
# where the "monkeytype" wordmark sits in githubbanner2.png
BASELINE = 137
TYPE_BOX = (474, 102, 576, 150)  # the "type" half, descenders included
MONKEY_BOX = (215, 95, 476, 150)  # logo and "monkey"

BASE = dict(
    font="LexendDeca.ttf",
    wght=400,  # for variable fonts
    word="clash",
    size=("x", 23),  # ("x", x-height px) or ("cap", cap height px)
    tracking=0,  # extra space between letters, px
    # "baseline": land = (left x, baseline y); "center": land = tag centre
    anchor="baseline",
    land=(477, BASELINE),
    tilt=0,
    fill=(ERROR, ERROR, ERROR),  # gradient top, middle, bottom
    edge=None,  # thin line hugging the fill
    # outlines drawn under the fill, outermost first: (colour, stroke width)
    outlines=[],
    shadow=None,  # (colour, (dx, dy), stroke width)
    highlight=False,
    rough=0,  # edge wobble of the letters
    overspray=0,  # opacity of the speckled paint halo
    knock=None,  # banner rect knocked off the banner by the impact
    strike=None,  # banner rect struck through before the fall
    drips=(0, 0),  # min, max drips per letter
    drip_len=(30, 62),
    splats=0,
    splat_dist=(140, 230),
    splat_r=(2, 6.5),
    splat_sides=False,  # True: droplets only fly out left and right
    splat_avoid=[],  # banner rects (x0, y0, x1, y1) no droplet may land in
    fall="translate(0,-200px) scale(.96,1.12)",
    fall_delay=0,
    fall_time=0.45,
    squash=(1.14, 0.82),
    shake=4,  # px
    seed=7,
)

VARIANTS = {
    # "clash" in the wordmark's own font knocks "type" off: monkeyclash
    "swap": dict(
        knock=TYPE_BOX,
        splats=8,
        splat_r=(1.5, 3.5),
        splat_dist=(90, 170),
        splat_sides=True,
        splat_avoid=[MONKEY_BOX],
    ),
    # the banner: "clash" in Roboto Mono, Monkeytype's default typing font,
    # knocks "type" off the wordmark
    "mono": dict(
        font="RobotoMono.ttf",
        wght=600,
        tracking=-1,
        knock=TYPE_BOX,
    ),
    # a typo fix: "type" struck through, "clash" slammed on top of it
    "fix": dict(
        wght=700,
        size=("x", 20),
        anchor="center",
        land=(530, 89),
        tilt=-7,
        strike=TYPE_BOX,
        fall_delay=0.35,
        fall_time=0.4,
    ),
    # the previous graffiti throw-up, kept for comparison
    "throwup": dict(
        font="SedgwickAveDisplay-Regular.ttf",
        word="Clash",
        size=("cap", 106),
        tracking=-6,
        anchor="center",
        land=(579, 121),
        tilt=-6,
        fill=("#ff5a4f", "#e8262f", "#9e0f18"),
        edge="#9e0f18",
        outlines=[("#111214", 22), ("#f4f1ea", 13)],
        shadow=("#000000", (5, 6), 22),
        highlight=True,
        rough=2.2,
        overspray=0.3,
        splats=16,
        splat_dist=(150, 250),
        splat_sides=True,
        splat_avoid=[MONKEY_BOX],
        fall="translate(0,-300px) scale(.96,1.12)",
    ),
}

cfg = {**BASE, **VARIANTS[VARIANT]}
TILT = cfg["tilt"]
FILL_LIGHT, FILL, FILL_DARK = cfg["fill"]
T_FALL = cfg["fall_delay"]
T_HIT = T_FALL + cfg["fall_time"]

font = TTFont(os.path.join(FONTS_DIR, cfg["font"]))
glyphs = font.getGlyphSet(location={"wght": cfg["wght"]} if "fvar" in font else None)
cmap = font.getBestCmap()
os2 = font["OS/2"]
kind, px = cfg["size"]
ref = os2.sxHeight if kind == "x" else os2.sCapHeight
scale = px / (ref or font["head"].unitsPerEm * 0.7)

# Lay the letters out left to right.
paths, letters, x = [], [], 0.0
for ch in cfg["word"]:
    g = glyphs[cmap[ord(ch)]]
    # font units are y-up: flip, scale and shift each glyph into place
    xf = (scale, 0, 0, -scale, x, 0)
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    g.draw(TransformPen(pen, xf))
    bp = BoundsPen(glyphs)
    g.draw(TransformPen(bp, xf))
    paths.append(pen.getCommands())
    if bp.bounds:
        letters.append((g, xf, bp.bounds))
    x += g.width * scale + cfg["tracking"]

xmin = min(b[0] for _, _, b in letters)
xmax = max(b[2] for _, _, b in letters)
ymin = min(b[1] for _, _, b in letters)
ymax = max(b[3] for _, _, b in letters)
tag_w, tag_h = xmax - xmin, ymax - ymin
word_d = " ".join(paths)

if cfg["anchor"] == "baseline":
    # glyph y=0 is the baseline, so only shift the ink to start at x=0
    local = f"translate({-xmin:.1f},0)"
    LAND_X, LAND_Y = cfg["land"]
    ORIGIN = (LAND_X + tag_w / 2, LAND_Y)
else:
    local = f"translate({-xmin - tag_w / 2:.1f},{-ymin - tag_h / 2:.1f})"
    LAND_X, LAND_Y = cfg["land"]
    ORIGIN = (LAND_X, LAND_Y)
IMPACT = (ORIGIN[0], LAND_Y + (ymin + ymax) / 2 if cfg["anchor"] == "baseline" else LAND_Y)


def inside(g, xf, px, py):
    # map the point back to font units and ask the glyph
    a, _, _, d, e, f = xf
    pen = PointInsidePen(glyphs, ((px - e) / a, (py - f) / d))
    g.draw(pen)
    return pen.getResult()


def paint_bottom(g, xf, px, y_from, y_to):
    """Lowest painted y of the glyph in column px, or None."""
    y = y_to
    while y > y_from:
        if inside(g, xf, px, y):
            return y
        y -= 1
    return None


# Paint drips hanging from the lowest painted point of each letter.
random.seed(cfg["seed"])
drips = []
for g, xf, (bx0, by0, bx1, by1) in letters:
    lo, hi = cfg["drips"]
    placed, tries = 0, 0
    want = random.randint(lo, hi)
    while placed < want and tries < 40:
        tries += 1
        dx = random.uniform(bx0 + 6, bx1 - 6)
        bottom = paint_bottom(g, xf, dx, by0 + (by1 - by0) * 0.55, by1 + 1)
        if bottom is None or any(abs(dx - d[0]) < 12 for d in drips):
            continue
        top = bottom - 6
        length = random.uniform(*cfg["drip_len"])
        width = random.uniform(4.5, 8)
        delay = T_HIT + random.uniform(0.15, 0.7)
        drips.append((dx, top, width, length, delay))
        placed += 1


def drip_path(x, top, w, l):
    # wide where it leaves the letter, thinning out, ending in a fat bead
    n = w * 0.32
    return (
        f"M{x - w / 2:.1f},{top:.1f} "
        f"C{x - w / 2:.1f},{top + l * 0.3:.1f} {x - n:.1f},{top + l * 0.5:.1f} {x - n:.1f},{top + l:.1f} "
        f"L{x + n:.1f},{top + l:.1f} "
        f"C{x + n:.1f},{top + l * 0.5:.1f} {x + w / 2:.1f},{top + l * 0.3:.1f} {x + w / 2:.1f},{top:.1f}Z"
    )


# per-element timing lives in classes, not inline styles, so the SVG also
# survives renderers that drop style attributes
css = []
for i, (dx, top, w, l, d) in enumerate(drips):
    css.append(f".d{i} {{ animation-delay: {d:.2f}s; transform-origin: {dx:.1f}px {top:.1f}px; }}")

drip_svg = "\n      ".join(
    f'<g class="drip d{i}">'
    f'<path d="{drip_path(dx, top, w, l)}"/>'
    f'<ellipse cx="{dx:.1f}" cy="{top + l:.1f}" rx="{w * 0.55:.1f}" ry="{w * 0.7:.1f}"/></g>'
    for i, (dx, top, w, l, d) in enumerate(drips)
)


def blob(r):
    """An irregular paint drop: a main dot plus a few satellites."""
    parts = [f'<circle r="{r:.1f}"/>']
    for _ in range(random.randint(1, 3)):
        a = random.uniform(0, 2 * math.pi)
        dd = r * random.uniform(0.8, 1.6)
        parts.append(
            f'<circle cx="{math.cos(a) * dd:.1f}" cy="{math.sin(a) * dd:.1f}" r="{r * random.uniform(0.25, 0.5):.1f}"/>'
        )
    return "".join(parts)


# Splash droplets flying out of the impact; streaks point along their path.
IX, IY = IMPACT
splats = []
for i in range(cfg["splats"]):
    while True:
        ang = random.uniform(0, 360)
        if cfg["splat_sides"]:
            ang = random.choice([0, 180]) + random.uniform(-35, 35)
        dist = random.uniform(*cfg["splat_dist"])
        tx = math.cos(math.radians(ang)) * dist
        ty = math.sin(math.radians(ang)) * dist * 0.45
        hx, hy = IX + tx, IY + ty
        if not any(x0 - 8 < hx < x1 + 8 and y0 - 8 < hy < y1 + 8 for x0, y0, x1, y1 in cfg["splat_avoid"]):
            break
    r = random.uniform(*cfg["splat_r"])
    streak_ang = math.degrees(math.atan2(ty, tx))
    # teardrop: the tail points back to the impact
    tail = r * random.uniform(2, 3.2)
    streak = (
        f'<path d="M0,{-r * 0.9:.1f} L{-tail:.1f},0 L0,{r * 0.9:.1f}Z" '
        f'transform="rotate({streak_ang:.0f})"/>'
    )
    css.append(
        f"@keyframes s{i} {{ from {{ opacity: 1; transform: translate(0,0) scale(.4); }} "
        f"to {{ opacity: .9; transform: translate({tx:.0f}px,{ty:.0f}px) scale(1); }} }}\n"
        f"  .s{i} {{ animation: s{i} .55s cubic-bezier(.2,.7,.4,1) {T_HIT - 0.02:.2f}s 1 forwards; }}"
    )
    splats.append(
        f'<g transform="translate({IX:.0f},{IY:.0f})"><g class="splat s{i}">'
        f"{streak}{blob(r)}</g></g>"
    )
splat_svg = "\n".join(splats)

# "type" knocked off: a bg patch hides it on the banner, and a clipped copy
# of the banner on top of the patch falls away at the impact
knock_defs = knock_bg = knock_svg = ""
if cfg["knock"]:
    x0, y0, x1, y1 = cfg["knock"]
    knock_defs = (
        f'<clipPath id="knockclip"><rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}"/></clipPath>\n'
        # keep only the light letters: alpha from brightness, the dark ground drops out
        '  <filter id="ink"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2 2 2 0 -1.5"/></filter>'
    )
    knock_bg = f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" fill="{BG}"/>'
    knock_svg = f'<g class="knocked"><use href="#banner" xlink:href="#banner" clip-path="url(#knockclip)" filter="url(#ink)"/></g>'
    css.append(
        f".knocked {{ transform-origin: {(x0 + x1) / 2}px {(y0 + y1) / 2}px; "
        f"animation: knock .8s cubic-bezier(.3,0,.8,.5) {T_HIT - 0.02:.2f}s 1 forwards; }}\n"
        "  @keyframes knock {\n"
        "    0%   { transform: translate(0,0) rotate(0); }\n"
        "    20%  { transform: translate(14px,-18px) rotate(12deg); }\n"
        "    100% { transform: translate(70px,230px) rotate(55deg); }\n"
        "  }"
    )

# "type" struck through like a typo, before the fall
strike_svg = ""
if cfg["strike"]:
    x0, y0, x1, y1 = cfg["strike"]
    sy = BASELINE - 11
    length = x1 - x0 + 8
    strike_svg = (
        f'<path class="strike" d="M{x0 - 4},{sy + 2} L{x1 + 4},{sy - 2}" stroke="{ERROR}" '
        f'stroke-width="4" stroke-linecap="round" fill="none" '
        f'stroke-dasharray="{length:.0f}" stroke-dashoffset="{length:.0f}"/>'
    )
    css.append(
        f".strike {{ animation: strike .25s ease-out .1s 1 forwards; }}\n"
        "  @keyframes strike { to { stroke-dashoffset: 0; } }"
    )

png_b64 = base64.b64encode(open(PNG, "rb").read()).decode()

outline_svg = "\n      ".join(
    f'<use href="#word" xlink:href="#word" fill="{c}" stroke="{c}" stroke-width="{w}" stroke-linejoin="round"/>'
    for c, w in cfg["outlines"]
)
shadow_svg = ""
if cfg["shadow"]:
    c, (ox, oy), w = cfg["shadow"]
    shadow_svg = (
        f'<use href="#word" xlink:href="#word" transform="translate({ox},{oy})" '
        f'fill="{c}" stroke="{c}" stroke-width="{w}" stroke-linejoin="round"/>'
    )
overspray_svg = ""
if cfg["overspray"]:
    overspray_svg = f'<use class="mist" href="#word" xlink:href="#word" fill="{FILL}" filter="url(#overspray)"/>'
highlight_svg = ""
if cfg["highlight"]:
    highlight_svg = (
        '<use href="#word" xlink:href="#word" fill="none" stroke="#ffffff" stroke-opacity=".35" '
        'stroke-width="2" stroke-dasharray="14 40" transform="translate(-2,-3)"/>'
    )
edge_attrs = f' stroke="{cfg["edge"]}" stroke-width="1.5" stroke-linejoin="round"' if cfg["edge"] else ""
rough_attr = ' filter="url(#rough)"' if cfg["rough"] else ""
extra_css = "\n  ".join(css)
sx, sy_ = cfg["squash"]
k = cfg["shake"]

svg = f"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="MonkeyClash">
<title>MonkeyClash</title>
<defs>
  <path id="word" d="{word_d}"/>
  <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{FILL_LIGHT}"/>
    <stop offset="0.55" stop-color="{FILL}"/>
    <stop offset="1" stop-color="{FILL_DARK}"/>
  </linearGradient>
  <filter id="rough" x="-10%" y="-10%" width="120%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="{cfg["rough"]}"/>
  </filter>
  <!-- speckled halo around the letters, like the mist a spray can leaves -->
  <filter id="overspray" x="-25%" y="-40%" width="150%" height="180%">
    <feMorphology in="SourceAlpha" operator="dilate" radius="5" result="fat"/>
    <feGaussianBlur in="fat" stdDeviation="7" result="halo"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="9" result="grain"/>
    <feComponentTransfer in="grain" result="dots">
      <feFuncA type="discrete" tableValues="0 0 0 1 1"/>
    </feComponentTransfer>
    <feComposite in="halo" in2="dots" operator="in" result="speckle"/>
    <feFlood flood-color="{FILL}"/>
    <feComposite in2="speckle" operator="in"/>
  </filter>
  {knock_defs}
</defs>
<style>
  .bg {{ animation: shake .35s ease-out {T_HIT - 0.05:.2f}s 1 both; }}
  @keyframes shake {{
    0%   {{ transform: translate(0,0); }}
    20%  {{ transform: translate({-k}px,{k * 0.75:g}px); }}
    40%  {{ transform: translate({k}px,{-k / 2:g}px); }}
    60%  {{ transform: translate({-k * 0.75:g}px,{k / 4:g}px); }}
    80%  {{ transform: translate({k / 2:g}px,{-k / 4:g}px); }}
    100% {{ transform: translate(0,0); }}
  }}
  .drop {{
    transform-origin: {ORIGIN[0]:.1f}px {ORIGIN[1]:.1f}px;
    animation: fall {cfg["fall_time"]}s cubic-bezier(.55,0,.9,.45) {T_FALL}s 1 both, squash .5s ease-out {T_HIT:.2f}s 1 forwards;
  }}
  @keyframes fall {{
    0%   {{ transform: {cfg["fall"]}; }}
    100% {{ transform: translate(0,0) rotate(0) scale(1); }}
  }}
  @keyframes squash {{
    0%   {{ transform: scale({sx},{sy_}); }}
    40%  {{ transform: scale(.95,1.06); }}
    70%  {{ transform: scale(1.02,.98); }}
    100% {{ transform: scale(1,1); }}
  }}
  .mist {{ opacity: 0; animation: mist .9s ease-out {T_HIT - 0.02:.2f}s 1 forwards; }}
  @keyframes mist {{ from {{ opacity: 0; }} to {{ opacity: {cfg["overspray"]}; }} }}
  .drip {{ fill: url(#paint); transform: scaleY(0); animation: drip 1.6s cubic-bezier(.3,.6,.4,1) 1 forwards; }}
  @keyframes drip {{ from {{ transform: scaleY(0); }} to {{ transform: scaleY(1); }} }}
  .splat {{ fill: {FILL}; opacity: 0; }}
  {extra_css}
  @media (prefers-reduced-motion: reduce) {{
    .bg, .drop, .mist, .drip, .splat, .knocked, .strike {{ animation-duration: 1ms; animation-delay: 0s; }}
  }}
</style>

<rect width="{W}" height="{H}" fill="{BG}"/>
<g class="bg">
  <image id="banner" href="data:image/png;base64,{png_b64}" xlink:href="data:image/png;base64,{png_b64}" x="0" y="0" width="{W}" height="{H}"/>
  {knock_bg}
</g>
{knock_svg}
{strike_svg}

{splat_svg}

<g class="drop">
  <g transform="translate({LAND_X},{LAND_Y}) rotate({TILT})">
    <g transform="{local}">
      {overspray_svg}
      <g{rough_attr}>
      {shadow_svg}
      {outline_svg}
      <!-- the drips sit behind the fill so they look like they come out of it -->
      {drip_svg}
      <use href="#word" xlink:href="#word" fill="url(#paint)"{edge_attrs}/>
      {highlight_svg}
      </g>
    </g>
  </g>
</g>
</svg>
"""

open(OUT, "w").write(svg)
print(f"wrote {OUT}: {len(svg) / 1024:.1f} KB, tag {tag_w:.0f}x{tag_h:.0f}px, {len(drips)} drips")
