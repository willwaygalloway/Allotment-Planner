#!/usr/bin/env python3
"""Refresh data/realseeds.js from the Real Seeds online catalogue.

The planner is a static site, and a browser can't read realseeds.co.uk directly from
another website, so this script runs on GitHub (see .github/workflows/update-realseeds.yml)
once a week, reads the catalogue pages listed in catalogue_rules.json and saves the
variety names, packet sizes and organic flags for the planner to show. It stores no
descriptions or photos: each variety links back to its page on realseeds.co.uk.

  python scripts/update_realseeds.py                  # read the live site
  python scripts/update_realseeds.py --from-snapshot  # rebuild from scripts/snapshot_*.txt

If a page can't be read, or looks very different from last time, the varieties from the
previous run are kept for that page, so a site change never empties the planner's list.
"""
import datetime, glob, json, os, re, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RULES = json.load(open(os.path.join(HERE, "catalogue_rules.json"), encoding="utf-8"))
OUT_JS = os.path.join(ROOT, "data", "realseeds.js")
OUT_JSON = os.path.join(ROOT, "data", "realseeds.json")
UA = "Mozilla/5.0 (compatible; allotment-planner catalogue reader; weekly; +https://github.com/)"

SEED_RE = re.compile(r"(\b\d[\d,.]*\s*(?:-|–|to)?\s*\d*\s*(?:g\s*)?(?:seeds?|tubers?)\b|\blots of seeds?\b|\bhundreds (?:of )?seeds?\b|\bseveral hundred seeds?\b)", re.I)
TILDE_RE = re.compile(r"^~+\s*(.+?)\s*~+$")


def clean(s):
    return re.sub(r"\s+", " ", s or "").strip(" -–:")


def is_tag(s):
    letters = [c for c in s if c.isalpha()]
    return len(letters) >= 3 and sum(c.isupper() for c in letters) / len(letters) > 0.8 and len(s) < 45


def parse_page(html):
    """Return [(section, name, seeds, organic, tag)] from one catalogue page."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "nav", "header", "footer"]):
        t.decompose()
    # walk the page in order, noting headings, bold runs and plain text
    events = []
    for el in soup.find_all(string=True):
        txt = clean(el)
        if not txt:
            continue
        parent = el.parent
        names = {p.name for p in [parent] + list(parent.parents)[:3] if p is not None}
        if names & {"h1", "h2", "h3", "h4"} or TILDE_RE.match(txt):
            events.append(("head", TILDE_RE.sub(r"\1", txt)))
        elif names & {"b", "strong"}:
            events.append(("bold", txt))
        else:
            events.append(("text", txt))
    out, section, name, tag, body = [], "", None, "", []

    def flush():
        if not name:
            return
        chunk = " ".join(body)
        m = SEED_RE.search(chunk)
        if m:
            out.append((section, name, clean(m.group(1)), "organic" in chunk.lower(), tag))

    for kind, txt in events:
        if kind == "head":
            flush(); name, tag, body = None, "", []
            section = txt
        elif kind == "bold":
            if is_tag(txt) and name and not body:
                tag = txt  # a label printed next to the name
            elif len(txt) <= 90 and not SEED_RE.search(txt):
                flush(); name, tag, body = txt, "", []
            else:
                body.append(txt)
        else:
            body.append(txt)
    flush()
    seen, uniq = set(), []
    for row in out:
        if (row[0], row[1]) not in seen:
            seen.add((row[0], row[1])); uniq.append(row)
    return uniq


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")


def assign(page, rows):
    found = []
    for rule in RULES["rules"]:
        if rule["page"] != page:
            continue
        for section, name, seeds, organic, tag in rows:
            if "section" in rule and not re.search(rule["section"], section, re.I):
                continue
            if "name" in rule and not re.search(rule["name"], name, re.I):
                continue
            found.append({"crop": rule["crop"], "page": page, "section": section, "name": name, "seeds": seeds, "organic": bool(organic), "tag": tag})
    return found


def load_previous():
    try:
        return json.load(open(OUT_JSON, encoding="utf-8"))
    except Exception:
        return {"varieties": []}


def save(data):
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    txt = json.dumps(data, ensure_ascii=False, indent=1)
    open(OUT_JSON, "w", encoding="utf-8").write(txt + "\n")
    open(OUT_JS, "w", encoding="utf-8").write("/* Made by scripts/update_realseeds.py: do not edit by hand. */\nwindow.REALSEEDS = " + txt + ";\n")


def main():
    prev = load_previous()
    pages = sorted({r["page"] for r in RULES["rules"]})
    rows_by_page, notes = {}, []
    if "--from-snapshot" in sys.argv:
        snap = sorted(glob.glob(os.path.join(HERE, "snapshot_*.txt")))[-1]
        for line in open(snap, encoding="utf-8"):
            if line.startswith("#") or not line.strip():
                continue
            page, section, name, seeds, organic, tag = (line.rstrip("\n").split("|") + [""] * 6)[:6]
            rows_by_page.setdefault(page, []).append((section, name, seeds, organic == "yes", tag))
        source = "snapshot " + os.path.basename(snap)
    else:
        for page in pages:
            try:
                rows_by_page[page] = parse_page(fetch(RULES["base"] + page))
            except Exception as e:
                notes.append(page + ": couldn't read (" + str(e)[:80] + ")")
            time.sleep(1.5)
        source = "live site"
    varieties = []
    for page in pages:
        new = assign(page, rows_by_page.get(page, []))
        old = [v for v in prev.get("varieties", []) if v["page"] == page]
        if old and len(new) < max(1, len(old) // 2):
            notes.append(page + ": found %d varieties (was %d), kept the old list" % (len(new), len(old)))
            new = old
        varieties += new
    if prev.get("varieties") and len(varieties) < len(prev["varieties"]) * 0.6:
        print("Only %d varieties found (was %d): not saving." % (len(varieties), len(prev["varieties"])))
        sys.exit(1)
    data = {"updated": datetime.date.today().isoformat(), "source": source, "base": RULES["base"], "count": len(varieties), "notes": notes, "varieties": varieties}
    old_core = json.dumps(prev.get("varieties"), sort_keys=True)
    if json.dumps(varieties, sort_keys=True) == old_core and "--force" not in sys.argv:
        print("No changes to the catalogue.")
        return
    save(data)
    print("Saved %d varieties from %s." % (len(varieties), source))
    for n in notes:
        print("  note:", n)


if __name__ == "__main__":
    main()
