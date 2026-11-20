#!/usr/bin/env python3
"""Audit the social and canonical metadata of every prerendered page.

Usage:
  python3 scripts/audit-metadata.py <.next/server/app> [dump.json]
  python3 scripts/audit-metadata.py <.next/server/app> [dump.json] --compare before.json

Reads the built HTML, so it checks what crawlers see, not what the source says.
Exits 1 when any hard check fails (the Done-when list of plan 066); title and
description lengths are warnings only.

--compare diffs the dump of this build against an earlier dump and lists every
page whose title, description, canonical, og:title, og:description, twitter:title,
twitter:description, robots, keywords, article:* tags, JSON-LD (types and a digest
of the content), og:type (when it had one) or bespoke (non-default) og:image or
twitter:image changed, plus pages added or removed. It is informational
and does not change the exit code.
"""
import collections
import hashlib
import html
import json
import os
import re
import sys

SITE = "https://wraps.dev"
DEFAULT_OG_IMAGE = SITE + "/og-image.png"


def parse_page(root, dirpath, filename):
    path = os.path.join(dirpath, filename)
    route = "/" + os.path.relpath(path, root)[: -len(".html")]
    if route == "/index":
        route = "/"
    with open(path, encoding="utf-8") as fh:
        source = fh.read()
    head = source.split("</head>")[0]

    def meta(attr, name):
        pattern = r'<meta %s="%s" content="([^"]*)"' % (attr, re.escape(name))
        return [html.unescape(x) for x in re.findall(pattern, head)]

    title = re.search(r"<title>(.*?)</title>", head)
    canonical = re.findall(r'<link rel="canonical" href="([^"]*)"', head)
    ld_blocks = re.findall(
        r'<script type="application/ld\+json"[^>]*>(.*?)</script>', source, re.S
    )
    ld_types = []
    for block in ld_blocks:
        try:
            data = json.loads(block)
            items = data.get("@graph", [data]) if isinstance(data, dict) else data
            ld_types += [str(i.get("@type")) for i in items if isinstance(i, dict)]
        except Exception:
            ld_types.append("PARSE_ERR")
    article = {}
    for found in re.finditer(r'<meta property="(article:[^"]*)" content="([^"]*)"', head):
        article.setdefault(found.group(1), []).append(html.unescape(found.group(2)))
    return dict(
        route=route,
        title=html.unescape(title.group(1)) if title else None,
        desc=(meta("name", "description") or [None])[0],
        canon=canonical,
        ogt=meta("property", "og:title"),
        ogd=meta("property", "og:description"),
        ogu=meta("property", "og:url"),
        ogi=meta("property", "og:image"),
        ogia=meta("property", "og:image:alt"),
        ogtype=meta("property", "og:type"),
        ogsite=meta("property", "og:site_name"),
        oglocale=meta("property", "og:locale"),
        tw=meta("name", "twitter:card"),
        twi=meta("name", "twitter:image"),
        twt=meta("name", "twitter:title"),
        twd=meta("name", "twitter:description"),
        twsite=meta("name", "twitter:site"),
        robots=meta("name", "robots"),
        keywords=meta("name", "keywords"),
        article=article,
        ld=ld_types,
        ld_digest=hashlib.sha256("".join(ld_blocks).encode("utf-8")).hexdigest()[:16],
    )


def collect(root):
    rows = []
    for dirpath, _, files in os.walk(root):
        for filename in files:
            if not filename.endswith(".html"):
                continue
            row = parse_page(root, dirpath, filename)
            if row["route"].startswith("/_"):
                continue
            rows.append(row)
    rows.sort(key=lambda r: r["route"])
    return rows


def expected_url(route):
    return SITE if route == "/" else SITE + route


def same_url(a, b):
    return a.rstrip("/") == b.rstrip("/")


def bespoke_images(row):
    return [i for i in row["ogi"] if i != DEFAULT_OG_IMAGE]


def audit(rows):
    failures = collections.defaultdict(list)
    warnings = collections.defaultdict(list)
    titles = collections.Counter(r["title"] for r in rows)
    descs = collections.Counter(r["desc"] for r in rows)
    for r in rows:
        route = r["route"]

        def fail(key):
            failures[key].append(route)

        def warn(key):
            warnings[key].append(route)

        for key, label in (
            ("ogi", "no og:image"),
            ("twi", "no twitter:image"),
            ("twsite", "no twitter:site"),
            ("ogsite", "no og:site_name"),
            ("oglocale", "no og:locale"),
            ("ogu", "no og:url"),
            ("ogtype", "no og:type"),
            ("ogia", "no og:image:alt"),
        ):
            if not r[key]:
                fail(label)
        if r["tw"] and r["tw"][0] != "summary_large_image":
            fail("twitter:card is not summary_large_image")
        elif not r["tw"]:
            fail("no twitter:card")
        if not r["canon"]:
            fail("no canonical")
        elif not same_url(r["canon"][0], expected_url(route)):
            fail("canonical != route")
        if r["ogu"] and r["canon"] and r["ogu"][0] != r["canon"][0]:
            fail("og:url != canonical")
        if not r["desc"]:
            fail("no description")
        if r["title"] and "| Wraps | Wraps" in r["title"]:
            fail("double Wraps suffix in <title>")
        if r["ogt"] and r["title"] and r["ogt"][0] != r["title"] and route != "/":
            warn("og:title != <title>")
        if r["twt"] and r["ogt"] and r["twt"][0] != r["ogt"][0]:
            warn("twitter:title != og:title")
        if r["desc"] and not (70 <= len(r["desc"]) <= 160):
            warn("description length outside 70-160")
        if r["title"] and len(r["title"]) > 60:
            warn("title > 60 chars")
        if titles[r["title"]] > 1:
            warn("duplicate title")
        if descs[r["desc"]] > 1:
            warn("duplicate description")
        if not r["ld"]:
            warn("no JSON-LD")
        if "PARSE_ERR" in r["ld"]:
            fail("JSON-LD parse error")
        if r["robots"] and "noindex" in r["robots"][0]:
            warn("noindex")
    return failures, warnings


def report(label, found):
    pages = {route for routes in found.values() for route in routes}
    print("%s: %d pages, %d checks" % (label, len(pages), len(found)))
    for key, routes in sorted(found.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        print("  %4d  %s   e.g. %s" % (len(routes), key, routes[:4]))


def compare(rows, before_path):
    with open(before_path, encoding="utf-8") as fh:
        before = {r["route"]: r for r in json.load(fh)}
    after = {r["route"]: r for r in rows}
    fields = (
        ("title", "<title>"),
        ("desc", "meta description"),
        ("canon", "canonical"),
        ("ogt", "og:title"),
        ("ogd", "og:description"),
        ("twt", "twitter:title"),
        ("twd", "twitter:description"),
        ("robots", "robots"),
        ("keywords", "keywords"),
        ("article", "article:* (published, modified, author)"),
        ("ld", "JSON-LD types"),
        ("ld_digest", "JSON-LD content"),
    )
    changed = collections.defaultdict(list)
    for route in sorted(before.keys() & after.keys()):
        b, a = before[route], after[route]
        for key, label in fields:
            if b.get(key) != a.get(key):
                changed[label].append((route, b.get(key), a.get(key)))
        if b["ogtype"] and b["ogtype"] != a["ogtype"]:
            changed["og:type"].append((route, b["ogtype"], a["ogtype"]))
        if bespoke_images(b) != bespoke_images(a):
            changed["bespoke og:image"].append(
                (route, bespoke_images(b), bespoke_images(a))
            )
        if [i for i in b["twi"] if i != DEFAULT_OG_IMAGE] != [
            i for i in a["twi"] if i != DEFAULT_OG_IMAGE
        ]:
            changed["bespoke twitter:image"].append((route, b["twi"], a["twi"]))
    print("\ncompare against %s" % before_path)
    print("  pages only in before: %s" % sorted(before.keys() - after.keys()))
    print("  pages only in after:  %s" % sorted(after.keys() - before.keys()))
    if not changed:
        print("  no field changed on any page present in both builds")
    for label, items in changed.items():
        print("  %s changed on %d pages" % (label, len(items)))
        for route, b, a in items:
            print("    %s\n      before: %r\n      after:  %r" % (route, b, a))


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    before_path = None
    if "--compare" in argv:
        before_path = argv[argv.index("--compare") + 1]
        args = [a for a in args if a != before_path]
    if not args:
        print(__doc__)
        return 2
    root = args[0]
    rows = collect(root)
    if len(args) > 1:
        with open(args[1], "w", encoding="utf-8") as fh:
            json.dump(rows, fh, indent=1)
    print("pages: %d" % len(rows))
    if not rows:
        print("no prerendered pages under %s: run the build first" % root)
        return 1
    failures, warnings = audit(rows)
    report("FAILURES", failures)
    report("WARNINGS (report-only)", warnings)
    if before_path:
        compare(rows, before_path)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
