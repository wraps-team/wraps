# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "fonttools==4.68.0",
#     "brotli==1.2.1",
# ]
# ///
"""Build the marketing site's web fonts (apps/website/public/fonts/subset/).

Run by hand. Not part of the Next.js build:

    uv run apps/website/scripts/subset-fonts.py [--limit-weights]

Every face the served Google CSS listed for Inter, Space Grotesk and JetBrains Mono is
shipped, in the same order as the served CSS (a face listed earlier wins a shared range).
Each served face is the exact file next/font/google downloads (sha256-pinned in SOURCES),
with its served unicode-range copied verbatim. One face per family is built instead of
copied: the latin face ("core"), which is preloaded on every page.

  core  The served latin subset, with all of its OpenType features kept, and its cmap
        and metrics restored. Chrome reads GSUB in its light hinting, so pruning features
        changes rasterization. Outlines, advances and kerning are unchanged.
  rest  Every other served face (Inter: cyrillic(-ext), greek(-ext), vietnamese,
        latin-ext; Space Grotesk: vietnamese, latin-ext; JetBrains Mono: cyrillic(-ext),
        greek, vietnamese, latin-ext) is shipped byte-for-byte. Chrome picks the fallback
        for a character by range and face set, so dropping faces changed fallback glyphs.
        These load only when a page needs one of their ranges (no current page needs any
        except one that uses U+03BB, which loads Inter's greek face).

League Gothic: one file (no served range; the served file is one face; no page renders it).
Its internal names are changed because the OFL reserves the name "League Gothic".

Verified (see the report): every core codepoint renders identically to the served latin
face in FreeType (light, normal and unhinted, 4 sizes); kerning and advances identical;
the rest are byte-identical to the served files.

Sources are pinned by sha256 and cached (default ~/.cache/wraps-website-fonts).
Writes apps/website/public/fonts/subset/*, apps/website/src/app/font-subset.generated.css
and apps/website/src/lib/font-subset.generated.ts. Commit them. Output is deterministic.

Rerun when:
  - a page renders a character that is in SERVED_COVERAGE but not kept (the script
    stops and names it);
  - a new font-weight, or a new OpenType feature in CSS (features are all kept);
  - a source changes (update SOURCES and SERVED_RANGES together; a sha256 mismatch stops it).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont, newTable
from fontTools.varLib import instancer

WEBSITE = Path(__file__).resolve().parent.parent
SRC_DIR = WEBSITE / "src"
OUT_DIR = WEBSITE / "public" / "fonts" / "subset"
CSS_OUT = SRC_DIR / "app" / "font-subset.generated.css"
TS_OUT = SRC_DIR / "lib" / "font-subset.generated.ts"

# Sources, pinned by sha256 so an upstream change fails loudly.
SOURCES = {
    # Inter: the served Google subsets, exactly the files next/font/google downloaded
    # (CSS2 request with a Chrome 104 user agent). Outlines are the served outlines.
    "inter-latin": {
        "url": "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2",
        "sha256": "c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4",
        "member": None,
    },
    "inter-latin-ext": {
        "url": "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7W0Q5n-wU.woff2",
        "sha256": "a28eb6d3ccb534ae0c94ca999371df024aab60b08c3c8a5720ee9e32fa0faaa2",
        "member": None,
    },
    "inter-greek": {
        "url": "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1pL7W0Q5n-wU.woff2",
        "sha256": "46dd4cdca58c26ae87cc6927657bf83b2e8abfc39ffd0ab176e301a8d28d22bf",
        "member": None,
    },
    # Every served face of the three families, unmodified (see FACE_ORDER).
    "inter-cyrillic": {
        "url": "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa0ZL7W0Q5n-wU.woff2",
        "sha256": "aebf2ab4a4ce6810d73c1ac7be7cafb4e5ec4cee2d6db5fb3e09691747ec4bd6",
        "member": None,
    },
    "inter-cyrillic-ext": {
        "url": "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2JL7W0Q5n-wU.woff2",
        "sha256": "fccca918fea40089dacadc7045861314d1a6bc91f1f323cc1eeb22ebcdb321b5",
        "member": None,
    },
    "inter-greek-ext": {
        "url": "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2ZL7W0Q5n-wU.woff2",
        "sha256": "a2e2c783ca6f9c20486e81e72a279203e86730bbf8f01ff6a5ee9dbd09e1c271",
        "member": None,
    },
    "inter-vietnamese": {
        "url": "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2pL7W0Q5n-wU.woff2",
        "sha256": "8db00ff46c67b22cda8bed865acf7077651cac8d2841d5b40980556b48961931",
        "member": None,
    },
    "space-grotesk-vietnamese": {
        "url": "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPb54C_k3HqUtEw.woff2",
        "sha256": "d699664b145bfeeccc66a4cce7fa55e14eb63efd7ec6b0b2ec52e25dd98f3917",
        "member": None,
    },
    "jetbrains-mono-cyrillic": {
        "url": "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD_OwGtT0rU3BE.woff2",
        "sha256": "af7486955880be1c2b972e9c766acffb776768d669b6576ed9a0919ce72e7ca6",
        "member": None,
    },
    "jetbrains-mono-cyrillic-ext": {
        "url": "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD2OwGtT0rU3BE.woff2",
        "sha256": "992eea2f70210457ddd1196de4df3240919ffe068ad188c79d985fba4565d3bf",
        "member": None,
    },
    "jetbrains-mono-greek": {
        "url": "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD4OwGtT0rU3BE.woff2",
        "sha256": "3edf363dbf9d5fa0cdc784ae2b431a8a4152f4055a8a8858028c0bd668808273",
        "member": None,
    },
    "jetbrains-mono-vietnamese": {
        "url": "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD0OwGtT0rU3BE.woff2",
        "sha256": "1390e86cc2823e759358918c01c4fcc1b6e4f01bca915bdbeb6d68eb5c244405",
        "member": None,
    },
    "space-grotesk-latin": {
        "url": "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPbF4C_k3HqU.woff2",
        "sha256": "a0d054c4af557de20afd6ca59f47ab353bcaec49c63ff04b6c9d39d0f8910557",
        "member": None,
    },
    "space-grotesk-latin-ext": {
        "url": "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPb94C_k3HqUtEw.woff2",
        "sha256": "054c266fbb441ee059365dba0885d206f67ca05b375de869b88e02ebfccc9b9d",
        "member": None,
    },
    "jetbrains-mono-latin": {
        "url": "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD7OwGtT0rU.woff2",
        "sha256": "1e06740a02a443fb7f3eeda8fcaa685a0f6c620e3f01e6666e847295469ce3ad",
        "member": None,
    },
    "jetbrains-mono-latin-ext": {
        "url": "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD1OwGtT0rU3BE.woff2",
        "sha256": "7db7affbce1fdee69c1ffc2641bbca289b049867f524c9d861fe35ab6670bf29",
        "member": None,
    },
    "league-gothic": {
        "url": "https://github.com/theleagueof/league-gothic/releases/download/1.601/LeagueGothic-1.601.zip",
        "sha256": "bcb78e7edcba6fbfe56c855737ddf82c40f57f093ef3b7890667e25c69ac3a08",
        "member": "LeagueGothic-1.601/static/WOFF2/LeagueGothic-Condensed.woff2",
    },
}

# Codepoints each family's served Google subsets render today (unicode-range AND cmap),
# as inclusive hex ranges. Generated from the baseline build's served files.
SERVED_COVERAGE = {
    "Inter": "0000,0020-007E,00A0-00AC,00AE-0148,014A-01C3,01C5-0254,0256-027B,027E-0284,0286-0290,0292-02A4,02A6-02CC,02CE-02D7,02DA,02DC-0301,0303-0304,0308-0309,0323,0374-0376,037A-037F,0384-038A,038C,038E-03A1,03A3-03D7,03DC-03DD,03F0-03F6,03F9-03FA,03FC-0479,0480-049D,04A0-04FF,052F,1D00,1D0D,1D1B,1D43,1D47-1D49,1D4D,1D4F-1D50,1D52,1D56-1D58,1D5B,1D62-1D65,1D9C,1DA0,1DBB,1DBF,1E00-1E9B,1E9D-1F15,1F18-1F1D,1F20-1F45,1F48-1F4D,1F50-1F57,1F59,1F5B,1F5D,1F5F-1F7D,1F80-1FB4,1FB6-1FC4,1FC6-1FD3,1FD6-1FDB,1FDD-1FEF,1FF2-1FF4,1FF6-1FFE,2002,2009,200B,2013-2014,2018-201A,201C-201E,2020,2022,2026,2032-2033,2039-203A,2044,20A0-20AF,20B1-20B5,20B8-20BA,20BC-20BF,2113,2116,2122,2191,2193,2212,2C7C,2C7F,2DFF,A69F,A7FF,FEFF",
    "Space Grotesk": "000D,0020-007E,00A0-0180,018F,0192,01A0-01A1,01AF-01B0,01C4-01DC,01E6-01E7,01EA-01EB,01FA-021B,022A-022D,0230-0233,0237,0243,0251,0259,02B9-02BC,02BE-02BF,02C6-02CC,02DA,02DC-02DD,0300-0301,0303-0304,0308-0309,0323,1E08-1E09,1E0C-1E0F,1E14-1E17,1E1C-1E1D,1E20-1E21,1E24-1E25,1E2A-1E2B,1E2E-1E2F,1E36-1E3B,1E42-1E49,1E4C-1E53,1E5A-1E69,1E6C-1E6F,1E78-1E7B,1E80-1E85,1E8E-1E8F,1E92-1E93,1E97,1E9E,1EA0-1EF9,2009,200B,2013-2014,2018-201A,201C-201E,2020,2022,2026,2032-2033,2039-203A,2044,20A1,20A3-20A4,20A6-20A7,20A9,20AB-20AD,20B1-20B2,20B5,20B9-20BA,20BC-20BD,20BF,2113,2122,2191,2193,2212,2215",
    "JetBrains Mono": "000D,0020-007E,00A0-0131,0134-017F,018F,0192,01A0-01A1,01AF-01B0,01CD-01CE,01E6-01E7,01EA-01EB,01F4-01F5,01FC-01FF,0218-021B,0232-0233,0237,0259,02B9-02BA,02BC,02C6-02C7,02C9,02DA,02DC-02DD,02F3,02F7,0300-0301,0303-0304,0308-0309,0323,0374-0375,037E,0384-038A,038C,038E-03A1,03A3-03CF,03D7,0401-040C,040E-044F,0451-045C,045E-045F,0490-0491,04AE-04AF,04E8-04E9,1E80-1E85,1E9E,1EA0-1EF9,2013-2014,2018-201A,201C-201E,2020,2022,2026,2032-2033,2039-203A,2044,20AB-20AC,20AE,20BD,20BF,2113,2116,2122,2191,2193,2212,2215,FEFF",
    "League Gothic Condensed": "000D,0020-007E,0093-0094,00A0-00A3,00A5,00A8-00A9,00AE-00AF,00B4,00B7-00B8,00BF-00D6,00D8-00F6,00F8-0161,0164-017F,021A-021B,02C6-02C7,02D8-02DD,2013-2014,2018-201A,201C-201F,2022,2026,2030,20AC,2122,2212,FB01-FB02"
}

# The served "latin" face per family (ASCII, Latin-1, Latin punctuation, a few Latin
# Extended-A). Browsers shape a run within one face only, so ASCII and Latin-1 must share
# a file or the served face's 1,200 ASCII x Latin-1 kerning pairs stop applying. This face
# is therefore the core; everything else in the keep set goes to ext.
LATIN_FACE_COVERAGE = {
    "Inter": "0000,0020-007E,00A0-00AC,00AE-00FF,0131,0152-0153,02BB-02BC,02C6,02DA,02DC,0304,0308,2002,2009,200B,2013-2014,2018-201A,201C-201E,2022,2026,2032-2033,2039-203A,2044,20AC,2122,2191,2193,2212,FEFF",
    "Space Grotesk": "000D,0020-007E,00A0-00FF,0131,0152-0153,02BB-02BC,02C6,02DA,02DC,0304,0308,2009,200B,2013-2014,2018-201A,201C-201E,2022,2026,2032-2033,2039-203A,2044,20AC,2122,2191,2193,2212,2215",
    "JetBrains Mono": "000D,0020-007E,00A0-00FF,0131,0152-0153,02BC,02C6,02DA,02DC,0304,0308,2013-2014,2018-201A,201C-201E,2022,2026,2032-2033,2039-203A,2044,20AC,2122,2191,2193,2212,2215,FEFF",
}
ASCII = set(range(0x20, 0x7F))
LATIN_1 = set(range(0xA0, 0x100))
LATIN_EXT_A = set(range(0x100, 0x180))
COMBINING = set(range(0x300, 0x370))

# Metrics the served files carry; restored after subsetting.
SERVED_METRICS = {
    "inter": {
        "hhea": {"ascent": 1984, "descent": -494, "lineGap": 0},
        "OS/2": {"sTypoAscender": 1984, "sTypoDescender": -494, "sTypoLineGap": 0,
                 "usWinAscent": 2269, "usWinDescent": 660, "xAvgCharWidth": 1250},
    },
    "space-grotesk": {
        "hhea": {"ascent": 984, "descent": -292, "lineGap": 0},
        "OS/2": {"sTypoAscender": 984, "sTypoDescender": -292, "sTypoLineGap": 0,
                 "usWinAscent": 1150, "usWinDescent": 292},
    },
    "jetbrains-mono": {
        "hhea": {"ascent": 1020, "descent": -300, "lineGap": 0},
        "OS/2": {"sTypoAscender": 1020, "sTypoDescender": -300, "sTypoLineGap": 0,
                 "usWinAscent": 1020, "usWinDescent": 300},
    },
    "league-gothic": {},
}
SERVED_GASP = {65535: 15}  # served Inter / Space Grotesk / JetBrains Mono

# Characters that are in the served coverage and the keep set but missing from the
# pinned source file. The JetBrains Mono source is a Google subset requested with a
# Latin/punctuation/arrow text list; Google splits a Greek request into its own file,
# so U+03BB is not in it. The crawl finds U+03BB only in Inter text, never in
# JetBrains Mono, so today's pages render the same. Anything else missing fails the run.
SOURCE_EXCLUSIONS = {"jetbrains-mono": {0x03BB}}


@dataclass
class Family:
    slug: str
    css_family: str
    fallback_family: str | None   # the generated fallback face name, kept as today
    css_var: str | None           # CSS custom property the site already uses
    weight_desc: str              # @font-face font-weight, equal to the limited axis range
    axis_limits: dict             # instancer limits; {} for static fonts
    formats: tuple = ("woff2",)
    rfn_rename: dict | None = None  # nameID -> new name, for reserved-font-name fonts
    fallback_css: str | None = None  # copied byte-for-byte from the baseline build
    split: bool = True            # False: one file (served as one face, kerning must stay whole)


# Weight ranges actually in use (crawl plus class scan). Narrowing the axis rescales the
# gvar deltas and moves glyph outlines by up to ~1 font unit at non-400 weights, so this
# is opt-in (--limit-weights). Saves ~6 KB per Inter file, less for the others.
LIMITED_WEIGHTS = {
    "inter": ((400, 800), "400 800"),
    "space-grotesk": ((400, 700), "400 700"),
    "jetbrains-mono": ((400, 700), "400 700"),
}

FAMILIES = [
    Family(
        "inter", "Inter", "Inter Fallback", "--font-inter", "100 900",
        {},
        fallback_css="@font-face{font-family:Inter Fallback;src:local(Arial);ascent-override:90.44%;descent-override:22.52%;line-gap-override:0.0%;size-adjust:107.12%}",
    ),
    Family(
        "space-grotesk", "Space Grotesk", "Space Grotesk Fallback", "--font-space-grotesk", "300 700",
        {},
        fallback_css="@font-face{font-family:Space Grotesk Fallback;src:local(Arial);ascent-override:89.71%;descent-override:26.62%;line-gap-override:0.0%;size-adjust:109.69%}",
    ),
    Family(
        "jetbrains-mono", "JetBrains Mono", "JetBrains Mono Fallback", "--font-jetbrains-mono", "100 800",
        {},
        fallback_css="@font-face{font-family:JetBrains Mono Fallback;src:local(Arial);ascent-override:75.79%;descent-override:22.29%;line-gap-override:0.0%;size-adjust:134.59%}",
    ),
    Family(
        "league-gothic", "League Gothic Condensed", None, None, "900", {},
        formats=("woff2", "woff"), split=False,
        # OFL reserves the name "League Gothic" (copyright nameID 0 says so). The
        # copyright notice (nameID 0) and license (13, 14) stay as they are.
        rfn_rename={1: "Wraps Gothic Condensed", 3: "WrapsGothicCondensed-Regular;subset",
                    4: "Wraps Gothic Condensed Regular", 6: "WrapsGothicCondensed-Regular",
                    16: "Wraps Gothic Condensed", 17: "Regular"},
    ),
]


# unicode-range of the served latin-ext face (its ranges from the baseline CSS).
# Families whose core and ext come from two different served Google subsets (latin and
# latin-ext), so each file keeps that subset's own GSUB/GPOS.

# unicode-range of each served face, verbatim from the baseline build's CSS. Chrome routes a
# character by range: a face whose range covers U+0149 gets it even though the face has no
# glyph, and the fallback then comes from the system. Narrowing the range to the cmap changed
# that fallback (Liberation Sans became Liberation Serif), so the served ranges are kept.
SERVED_RANGES = {
    "inter-cyrillic-ext": "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
    "inter-cyrillic": "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
    "inter-greek-ext": "U+1F00-1FFF",
    "inter-greek": "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF",
    "inter-vietnamese": "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
    "space-grotesk-vietnamese": "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
    "jetbrains-mono-cyrillic-ext": "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
    "jetbrains-mono-cyrillic": "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
    "jetbrains-mono-greek": "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF",
    "jetbrains-mono-vietnamese": "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
    "inter-latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    "inter-latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF",
    "inter-greek": "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF",
    "space-grotesk-latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    "space-grotesk-latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF",
    "jetbrains-mono-latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    "jetbrains-mono-latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF",
}

# unicode-range of the served Inter greek face (from the baseline CSS).


# Every face each family's served CSS listed, in the baseline's CSS order (a face listed
# earlier wins a shared range). "core" is the one face we build (the served latin subset);
# the rest ship as served. Chrome's fallback depends on the whole set, not just the faces
# a page needs.
FACE_ORDER = {
    "inter": [("cyrillic-ext", "inter-cyrillic-ext"), ("cyrillic", "inter-cyrillic"),
              ("greek-ext", "inter-greek-ext"), ("greek", "inter-greek"),
              ("vietnamese", "inter-vietnamese"), ("ext", "inter-latin-ext"), ("core", "inter-latin")],
    "space-grotesk": [("vietnamese", "space-grotesk-vietnamese"), ("ext", "space-grotesk-latin-ext"),
                      ("core", "space-grotesk-latin")],
    "jetbrains-mono": [("cyrillic-ext", "jetbrains-mono-cyrillic-ext"), ("cyrillic", "jetbrains-mono-cyrillic"),
                       ("greek", "jetbrains-mono-greek"), ("vietnamese", "jetbrains-mono-vietnamese"),
                       ("ext", "jetbrains-mono-latin-ext"), ("core", "jetbrains-mono-latin")],
    "league-gothic": [("all", "league-gothic")],
}


def source_key(fam: "Family", part: str) -> str:
    return dict(FACE_ORDER[fam.slug])[part]


def fetch(spec: dict, cache: Path) -> bytes:
    cache.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(spec["url"].encode()).hexdigest()[:16]
    path = cache / f"{key}.bin"
    if not path.exists():
        print(f"  downloading {spec['url'][:90]}")
        req = urllib.request.Request(spec["url"], headers={"User-Agent": "wraps-subset-fonts/1"})
        with urllib.request.urlopen(req, timeout=300) as response:
            path.write_bytes(response.read())
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != spec["sha256"]:
        path.unlink()
        sys.exit(f"sha256 mismatch for {spec['url']}\n  want {spec['sha256']}\n  got  {digest}")
    if spec["member"]:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            return archive.read(spec["member"])
    return data


def parse_ranges(text: str) -> set[int]:
    out: set[int] = set()
    for part in text.split(","):
        lo, _, hi = part.strip().replace("U+", "").partition("-")
        out |= set(range(int(lo, 16), int(hi or lo, 16) + 1))
    return out


def ranges_of(cps) -> list[tuple[int, int]]:
    cps = sorted(cps)
    if not cps:
        return []
    out = []
    start = prev = cps[0]
    for c in cps[1:]:
        if c == prev + 1:
            prev = c
            continue
        out.append((start, prev))
        start = prev = c
    out.append((start, prev))
    return out


def unicode_range(cps) -> str:
    return ", ".join(f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in ranges_of(cps))


# Non-ASCII characters observed in the rendered DOM of every sitemap page (headless
# Chromium, 1280 and 390 wide, text after text-transform). Source scanning cannot see
# characters produced at runtime, such as the minus sign in the SES calculator.
RENDERED_NON_ASCII = "\u00a7\u00a9\u00b7\u00c0\u00d7\u00e0\u03bb\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac\u2190\u2191\u2192\u2193\u2212\u2248\u2260\u2264\u2265\u2318\u2500\u2502\u250c\u2510\u2514\u251c\u2534\u258b\u25bc\u25d0\u2699\u26a0\u2713\u2714\u2716\ufe0f\ud83c\udf10\ud83d\udcca\ud83d\udce5\ud83d\udce7\ud83d\udcec\ud83d\udda5\ud83d\uddc4\ud83d\ude8c"


def scan_source_chars() -> set[int]:
    exts = {".ts", ".tsx", ".css", ".md", ".mdx", ".json", ".js", ".mjs", ".cjs", ".txt"}
    found: set[int] = {ord(ch) for ch in RENDERED_NON_ASCII}
    for path in SRC_DIR.rglob("*"):
        if path.is_file() and path.suffix in exts:
            text = path.read_text(encoding="utf-8", errors="ignore")
            found |= {ord(ch) for ch in text if ord(ch) > 0x7E}
    return found


def instance(fam: Family, data: bytes) -> TTFont:
    font = TTFont(io.BytesIO(data), recalcTimestamp=False)
    if fam.axis_limits:
        # optimize=False: keep the exact gvar deltas. The default IUP optimizer
        # rounds deltas by up to ~1 unit, which shows up at every weight but 400.
        font = instancer.instantiateVariableFont(font, fam.axis_limits, optimize=False)
        # Round-trip through bytes: subsetting a freshly instanced font can fail
        # on gvar keys (KeyError on glyph names) without it.
        buf = io.BytesIO()
        font.save(buf)
        font = TTFont(io.BytesIO(buf.getvalue()), recalcTimestamp=False)
    return font


def build(fam: Family, data: bytes, keep: set[int]) -> TTFont:
    font = instance(fam, data)
    opts = subset.Options()
    # All features are kept. FreeType's autohinter (light and normal hinting, which Chrome
    # uses on Linux) reads GSUB, so pruning features changes rasterization even though
    # outlines and advances are untouched. Measured: pruning dnom/frac/numr/pnum changed
    # 2 of 20 FreeType renders of Inter.
    opts.layout_features = ["*"]
    opts.layout_scripts = ["*"]
    # Copyright, family/style names, license text (13, 14), and the League Gothic
    # rename targets (16, 17). English only.
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
    opts.name_languages = [0x0409]
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.recalc_timestamp = False
    # The served subsets carry no hinting tables (gasp only). Upstream Space Grotesk
    # ships a prep program; keep the output the same as what is served.
    opts.drop_tables += ["DSIG", "fpgm", "prep", "cvt ", "hdmx", "LTSH", "VDMX"]
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=sorted(keep))
    subsetter.subset(font)

    for table, values in SERVED_METRICS[fam.slug].items():
        for key, value in values.items():
            setattr(font[table], key, value)
    if fam.slug != "league-gothic":
        gasp = newTable("gasp")
        gasp.version = 1
        gasp.gaspRange = dict(SERVED_GASP)
        font["gasp"] = gasp
    if fam.rfn_rename:
        for record in font["name"].names:
            if record.nameID in fam.rfn_rename:
                record.string = fam.rfn_rename[record.nameID]
    return font


def encode(font: TTFont, flavor: str) -> bytes:
    # Keep head.modified from the source so reruns produce identical bytes.
    font.recalcTimestamp = False
    font.flavor = flavor
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--cache-dir", default=os.path.join(
        os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")), "wraps-website-fonts"))
    parser.add_argument("--limit-weights", action="store_true",
                        help="narrow wght to the weights in use (saves bytes; moves outlines by up to ~1 unit)")
    args = parser.parse_args()
    cache = Path(args.cache_dir)
    if args.limit_weights:
        for fam in FAMILIES:
            if fam.slug in LIMITED_WEIGHTS:
                limits, desc = LIMITED_WEIGHTS[fam.slug]
                fam.axis_limits = dict(fam.axis_limits, wght=limits)
                fam.weight_desc = desc

    used = scan_source_chars()
    print(f"non-ASCII characters found in src/: {len(used)}")

    files: dict[str, bytes] = {}
    rows = []
    face_css = []
    preloads = []

    for fam in FAMILIES:
        print(f"== {fam.css_family}")
        cover = parse_ranges(SERVED_COVERAGE[fam.css_family])
        excluded = SOURCE_EXCLUSIONS.get(fam.slug, set())
        # Combining marks the served faces cover: their lookups (ccmp, mark, mkmk) only
        # survive subsetting if the marks themselves are kept.
        keep = (ASCII | LATIN_1 | LATIN_EXT_A | COMBINING | used) & cover
        have: set[int] = set()
        for key in {key for _, key in FACE_ORDER[fam.slug]}:
            have |= set(instance(fam, fetch(SOURCES[key], cache)).getBestCmap())
        absent = keep - have
        if absent - excluded:
            sys.exit(f"{fam.css_family}: source font lacks {sorted(hex(c) for c in absent - excluded)}")
        if absent:
            print(f"  NOTE: {fam.css_family} source lacks {sorted(hex(c) for c in absent)}; left to fallback (see SOURCE_EXCLUSIONS)")
        keep -= absent
        if fam.split:
            # core: the whole served latin face, so nothing that renders from it today changes.
            core = parse_ranges(LATIN_FACE_COVERAGE[fam.css_family]) & cover & have
            ext = keep - core
        else:
            core, ext = keep, set()

        not_kept = sorted(hex(c) for c in used if c in cover and c not in keep and c not in excluded)
        if not_kept:
            sys.exit(f"{fam.css_family}: used characters in served coverage but not kept: {not_kept}")

        part_css: dict[str, str] = {}
        for part, key in FACE_ORDER[fam.slug]:
            source = fetch(SOURCES[key], cache)
            if part in ("core", "all"):
                cps = core if part == "core" else keep
                font = build(fam, source, cps)
                absent_part = cps - set(instance(fam, source).getBestCmap())
                if absent_part:
                    sys.exit(f"{fam.slug}-{part}: source lacks {sorted(hex(c) for c in absent_part)}")
                got = set(font.getBestCmap())
                if got != cps:
                    sys.exit(f"{fam.slug}-{part}: cmap {len(got)} != keep {len(cps)}")
                encoded = None
            else:
                # Served face, shipped as served: its bytes and its served range.
                cps = set(TTFont(io.BytesIO(source)).getBestCmap()) & parse_ranges(SERVED_RANGES[key])
                encoded = {"woff2": source}
            srcs = []
            for flavor in fam.formats:
                data = encoded[flavor] if encoded else encode(font, flavor)
                digest = hashlib.sha256(data).hexdigest()[:8]
                name = f"{fam.slug}-{part}.{digest}.{'woff2' if flavor == 'woff2' else 'woff'}"
                files[name] = data
                srcs.append(f'url("/fonts/subset/{name}") format("{flavor}")')
                rows.append((name, len(data), len(cps), fam))
                if flavor == "woff2" and part == "core" and fam.split:
                    preloads.append(f"/fonts/subset/{name}")
            ur = SERVED_RANGES.get(key) or unicode_range(cps)
            part_css[part] = (
                f'@font-face{{font-family:"{fam.css_family}";font-style:normal;'
                f'font-weight:{fam.weight_desc};font-display:swap;src:{",".join(srcs)};'
                f'unicode-range:{ur}}}'
            )
        for part, _ in FACE_ORDER[fam.slug]:
            face_css.append(part_css[part])
        if fam.fallback_css:
            face_css.append(fam.fallback_css)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.woff*"):
        old.unlink()
    for name, data in files.items():
        (OUT_DIR / name).write_bytes(data)

    variables = [f'{fam.css_var}:"{fam.css_family}","{fam.fallback_family}"' for fam in FAMILIES if fam.css_var]
    CSS_OUT.write_text(
        "/* Generated by apps/website/scripts/subset-fonts.py. Do not hand-edit. */\n"
        + "\n".join(face_css) + "\n"
        + ":root{" + ";".join(variables) + "}\n",
        encoding="utf-8",
    )
    TS_OUT.write_text(
        "// Generated by apps/website/scripts/subset-fonts.py. Do not hand-edit.\n"
        "export const FONT_PRELOADS = [\n"
        + "".join(f'  "{href}",\n' for href in preloads)
        + "] as const;\n",
        encoding="utf-8",
    )

    print("\nfile                                           bytes  codepoints  axes")
    total = 0
    for name, size, n, fam in rows:
        total += size
        axes = fam.axis_limits or "-"
        print(f"  {name:44s} {size:6d}  {n:10d}  {axes}")
    print(f"  total {total} bytes")
    print(f"wrote {CSS_OUT} and {TS_OUT}")


if __name__ == "__main__":
    main()
