# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "fonttools==4.68.0",
#     "brotli==1.2.1",
# ]
# ///
"""Build the static ttf files that the /og card route hands to next/og.

next/og (satori) reads ttf, otf and woff, not woff2, and ignores variable-font axes.
The site's fonts are variable woff2 (public/fonts/subset/), so this pins each axis
and writes a static ttf, from those same files, so the card matches the site.
Nothing is downloaded. Run by hand when the woff2 sources change:

    uv run apps/website/src/app/og/fonts/build-fonts.py

Output (committed beside this script):
  inter-600.ttf          card title, Inter at weight 600
  jetbrains-mono-500.ttf section label and wraps.dev, JetBrains Mono at weight 500

Both fonts are SIL OFL 1.1.
"""

from __future__ import annotations

import io
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = Path(__file__).resolve().parent
SUBSET = HERE.parents[3] / "public" / "fonts" / "subset"

# (source glob in public/fonts/subset, output name, axis pins; pins for axes a font lacks are skipped)
FACES = [
    ("inter-core.*.woff2", "inter-600.ttf", {"wght": 600}),
    ("jetbrains-mono-core.*.woff2", "jetbrains-mono-500.ttf", {"wght": 500}),
]


def main() -> None:
    for pattern, out_name, pins in FACES:
        (source,) = sorted(SUBSET.glob(pattern))
        font = TTFont(source)
        axes = {a.axisTag for a in font["fvar"].axes}
        locations = {tag: value for tag, value in pins.items() if tag in axes}
        static = instancer.instantiateVariableFont(font, locations)
        static.flavor = None  # woff2 -> plain ttf
        buf = io.BytesIO()
        static.save(buf)
        (HERE / out_name).write_bytes(buf.getvalue())
        print(f"{source.name} {sorted(axes)} pinned {locations} -> {out_name} ({buf.tell()} bytes)")


if __name__ == "__main__":
    main()
