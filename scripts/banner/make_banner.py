"""Generate the MonkeyClash README banner: the Monkeytype banner with a red
graffiti "Clash" tag that falls from the top and splats onto it.

Usage (needs `pip install fonttools`):
    curl -LO https://raw.githubusercontent.com/google/fonts/main/ofl/sedgwickavedisplay/SedgwickAveDisplay-Regular.ttf
    python3 scripts/banner/make_banner.py SedgwickAveDisplay-Regular.ttf \
        frontend/static/images/githubbanner2.png frontend/static/images/monkeyclash-banner.svg
"""

import base64
import math
import random
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT = sys.argv[1]
PNG = sys.argv[2]
OUT = sys.argv[3]

W, H = 793, 275
WORD = "Clash"
TAG_HEIGHT = 96  # cap height of the tag in px
RED, RED_DARK, RED_LIGHT = "#e8262f", "#9e0f18", "#ff5a4f"

font = TTFont(FONT)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
cap = font["OS/2"].sCapHeight or font["head"].unitsPerEm * 0.7
scale = TAG_HEIGHT / cap

# Lay the letters out left to right (slightly tightened like a real tag).
paths, letter_boxes, x = [], [], 0.0
for i, ch in enumerate(WORD):
    g = glyphs[cmap[ord(ch)]]
    pen = SVGPathPen(glyphs)
    # font units are y-up: flip, scale and shift each glyph into place
    g.draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
    bp = BoundsPen(glyphs)
    g.draw(TransformPen(bp, (scale, 0, 0, -scale, x, 0)))
    paths.append(pen.getCommands())
    if bp.bounds:
        letter_boxes.append(bp.bounds)
    x += g.width * scale - 6

xmin = min(b[0] for b in letter_boxes)
xmax = max(b[2] for b in letter_boxes)
ymin = min(b[1] for b in letter_boxes)
ymax = max(b[3] for b in letter_boxes)
tag_w, tag_h = xmax - xmin, ymax - ymin
word_d = " ".join(paths)

# Where the tag lands on the banner (centre point) and its tilt.
LAND_X, LAND_Y, TILT = 590, 162, -8
local = f"translate({-xmin - tag_w / 2:.1f},{-ymin - tag_h / 2:.1f})"

# Paint drips hanging under the bottom edge of the letters.
random.seed(7)
drips = []
for bx0, by0, bx1, by1 in letter_boxes:
    for _ in range(random.choice([1, 2, 2])):
        dx = random.uniform(bx0 + 8, bx1 - 8)
        top = by1 - 14
        length = random.uniform(30, 62)
        width = random.uniform(5, 8)
        delay = random.uniform(0.75, 1.3)
        drips.append((dx, top, width, length, delay))

drip_svg = "\n".join(
    f'<g class="drip" style="animation-delay:{d:.2f}s;transform-origin:{dx:.1f}px {top:.1f}px">'
    f'<rect x="{dx - w / 2:.1f}" y="{top:.1f}" width="{w:.1f}" height="{l:.1f}" rx="{w / 2:.1f}"/>'
    f'<circle cx="{dx:.1f}" cy="{top + l:.1f}" r="{w * 0.8:.1f}"/></g>'
    for dx, top, w, l, d in drips
)

# Splash droplets that fly out when the tag hits the banner.
splats = []
for i in range(12):
    ang = random.uniform(0, 360)
    dist = random.uniform(140, 230)
    r = random.uniform(2.5, 7)
    tx = math.cos(math.radians(ang)) * dist
    ty = math.sin(math.radians(ang)) * dist * 0.45
    splats.append(
        f'<circle class="splat" r="{r:.1f}" cx="{LAND_X}" cy="{LAND_Y}" '
        f'style="--tx:{tx:.0f}px;--ty:{ty:.0f}px"/>'
    )
splat_svg = "\n".join(splats)

png_b64 = base64.b64encode(open(PNG, "rb").read()).decode()

svg = f"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="MonkeyClash">
<title>MonkeyClash</title>
<defs>
  <path id="word" d="{word_d}"/>
  <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{RED_LIGHT}"/>
    <stop offset="0.55" stop-color="{RED}"/>
    <stop offset="1" stop-color="{RED_DARK}"/>
  </linearGradient>
  <filter id="rough" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2"/>
  </filter>
  <filter id="spray" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="6"/>
  </filter>
</defs>
<style>
  .bg {{ animation: shake .35s ease-out .55s 1 both; }}
  @keyframes shake {{
    0%   {{ transform: translate(0,0); }}
    20%  {{ transform: translate(-4px,3px); }}
    40%  {{ transform: translate(4px,-2px); }}
    60%  {{ transform: translate(-3px,1px); }}
    80%  {{ transform: translate(2px,-1px); }}
    100% {{ transform: translate(0,0); }}
  }}
  .drop {{
    transform-origin: {LAND_X}px {LAND_Y}px;
    animation: fall .6s cubic-bezier(.55,0,.9,.45) 0s 1 both, squash .5s ease-out .6s 1 both;
  }}
  @keyframes fall {{
    0%   {{ transform: translate(40px,-330px) rotate(-28deg) scale(1.25); }}
    100% {{ transform: translate(0,0) rotate(0) scale(1); }}
  }}
  @keyframes squash {{
    0%   {{ transform: scale(1.14,.82); }}
    40%  {{ transform: scale(.95,1.06); }}
    70%  {{ transform: scale(1.02,.98); }}
    100% {{ transform: scale(1,1); }}
  }}
  .mist {{ opacity: 0; animation: mist .9s ease-out .58s 1 forwards; }}
  @keyframes mist {{ from {{ opacity: 0; }} to {{ opacity: .35; }} }}
  .drip {{ fill: url(#paint); transform: scaleY(0); animation: drip 1.6s cubic-bezier(.3,.6,.4,1) 1 forwards; }}
  @keyframes drip {{ from {{ transform: scaleY(0); }} to {{ transform: scaleY(1); }} }}
  .splat {{ fill: {RED}; opacity: 0; animation: splat .55s cubic-bezier(.2,.7,.4,1) .58s 1 forwards; }}
  @keyframes splat {{
    0%   {{ opacity: 1; transform: translate(0,0); }}
    100% {{ opacity: .9; transform: translate(var(--tx),var(--ty)); }}
  }}
  @media (prefers-reduced-motion: reduce) {{
    .bg, .drop, .mist, .drip, .splat {{ animation-duration: 1ms; animation-delay: 0s; }}
  }}
</style>

<rect width="{W}" height="{H}" fill="#323437"/>
<g class="bg">
  <image href="data:image/png;base64,{png_b64}" xlink:href="data:image/png;base64,{png_b64}" x="0" y="0" width="{W}" height="{H}"/>
</g>

<g class="mist">
  <ellipse cx="{LAND_X}" cy="{LAND_Y}" rx="{tag_w * 0.55:.0f}" ry="{tag_h * 0.45:.0f}" fill="{RED}" filter="url(#spray)"/>
</g>
{splat_svg}

<g class="drop">
  <g transform="translate({LAND_X},{LAND_Y}) rotate({TILT})">
    <g transform="{local}" filter="url(#rough)">
      <!-- drop shadow -->
      <use href="#word" xlink:href="#word" transform="translate(7,8)" fill="#111214" stroke="#111214" stroke-width="16" stroke-linejoin="round"/>
      <!-- white outline, the classic tag border -->
      <use href="#word" xlink:href="#word" fill="#f4f1ea" stroke="#f4f1ea" stroke-width="14" stroke-linejoin="round"/>
      <!-- the drips sit behind the red fill so they look like they come out of it -->
      {drip_svg}
      <!-- red paint -->
      <use href="#word" xlink:href="#word" fill="url(#paint)" stroke="{RED_DARK}" stroke-width="1.5" stroke-linejoin="round"/>
      <!-- highlight streak -->
      <use href="#word" xlink:href="#word" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="2" stroke-dasharray="14 40" transform="translate(-2,-3)"/>
    </g>
  </g>
</g>
</svg>
"""

open(OUT, "w").write(svg)
print(f"wrote {OUT}: {len(svg) / 1024:.1f} KB, tag {tag_w:.0f}x{tag_h:.0f}px, {len(drips)} drips")
