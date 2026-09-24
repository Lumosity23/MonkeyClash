"""Render frames of the banner animation to PNG with headless Chrome.

Usage: python3 scripts/banner/preview.py <banner.svg> <out_dir> 0.3 0.62 3
Each number is a time in seconds; writes <out_dir>/frame_<t>.png.
"""

import os
import subprocess
import sys

svg_path, out_dir, *times = sys.argv[1:]
svg = open(svg_path).read()
os.makedirs(out_dir, exist_ok=True)
out_dir = os.path.abspath(out_dir)

for t in times:
    html_path = os.path.join(out_dir, f"frame_{t}.html")
    # inline the SVG, then freeze every animation at time t
    open(html_path, "w").write(
        f'<html><body style="margin:0;background:#000">{svg}<script>'
        f"document.getAnimations().forEach(a => {{ a.pause(); a.currentTime = {float(t) * 1000}; }});"
        "</script></body></html>"
    )
    subprocess.run(
        ["google-chrome", "--headless=new", "--disable-gpu", "--hide-scrollbars",
         "--window-size=793,275", f"--screenshot={out_dir}/frame_{t}.png", f"file://{html_path}"],
        capture_output=True,
        check=True,
    )
    print(f"{out_dir}/frame_{t}.png")
