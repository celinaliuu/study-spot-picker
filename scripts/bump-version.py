#!/usr/bin/env python3
"""Stamp a fresh ?v=<version> on every CSS/JS URL in index.html.

Run before each deploy so phones never mix a cached old file with a new page:
    python3 scripts/bump-version.py
Also checks that every app module in js/ is listed in the import map.
"""
import pathlib
import re
import sys
import time

root = pathlib.Path(__file__).resolve().parent.parent
index = root / "index.html"
html = index.read_text()

version = time.strftime("%Y%m%d%H%M%S")
new_html, count = re.subn(r"\?v=[A-Za-z0-9]+", f"?v={version}", html)
index.write_text(new_html)
print(f"Stamped v={version} on {count} URLs in index.html")

modules = {p.name for p in (root / "js").glob("*.js")} - {"app.js", "tests.js"}
mapped = set(re.findall(r'"\./js/([\w-]+\.js)"\s*:', new_html))
missing = sorted(modules - mapped)
if missing:
    print("WARNING: add these to the import map in index.html:", ", ".join(missing))
    sys.exit(1)
