#!/usr/bin/env python3
"""Fetch guide pictures from Wikimedia Commons, with license and author recorded.

  commons_images.py pick   targets.json  workdir   find one license-OK candidate per target, save a small preview
  commons_images.py sheet  workdir                  contact sheets of the picks, to look at before accepting
  commons_images.py commit workdir [--drop id,id]   resize to WebP into assets/pictures and write the manifest rows

targets.json: [{"symbol": "cumulonimbus", "domain": "sky", "role": "whole",
                "query": "Cumulonimbus cloud", "file": "optional exact File: title", "warning": ""}]
Only Public domain, CC0 and CC BY files are accepted (round-4 license rule). CC BY-SA, NC, ND, GFDL or unclear is skipped.
"""
import hashlib, html, io, json, os, re, sys, time
import requests
from PIL import Image

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "YehsaFieldGuideBot/1.0 (offline survival app picture credits; github.com/dana6969/Yehsa)"}
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OKLIC = re.compile(r"^(public domain|cc0|cc zero|cc by( [0-9.]+)?( [a-z]{2})?)$", re.I)
BAD_TITLE = re.compile(r"\b(logo|icon|flag|coat of arms|stamp|poster|cartoon|map of|locator|screenshot|\.svg|\.gif|\.pdf|\.ogg|\.webm|\.tif)\b|\.(svg|gif|pdf|ogg|webm|tif|tiff|djvu|ogv|stl)$", re.I)


def norm_license(short, usage_terms=""):
    s = html.unescape(re.sub(r"<[^>]+>", "", short or "")).strip()
    low = s.lower()
    if low.startswith("pd") or "public domain" in low or low in ("no known copyright restrictions", "cc-pd-mark", "pd"):
        if "no known" in low:
            return None
        return "Public domain"
    if low.startswith("cc0") or "cc zero" in low:
        return "CC0"
    m = re.match(r"^cc[- ]by[- ]sa[- ]([0-9.]+)", low)
    if m:
        return "CC BY-SA " + m.group(1)
    m = re.match(r"^cc[- ]by[- ]([0-9.]+)", low)
    if m:
        return "CC BY " + m.group(1)
    return None


def clean(text):
    t = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    return re.sub(r"\s+", " ", t).strip()


def api(params, retries=4):
    for i in range(retries):
        r = requests.get(API, params={**params, "format": "json"}, headers=UA, timeout=30)
        if r.status_code == 429:
            time.sleep(3 + 3 * i)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError("rate limited")


def info_for(titles, width=900):
    out = {}
    for i in range(0, len(titles), 20):
        chunk = titles[i:i + 20]
        data = api({"action": "query", "titles": "|".join(chunk), "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime",
                    "iiurlwidth": width, "iiextmetadatafilter": "LicenseShortName|Artist|Credit|ImageDescription|UsageTerms|License"})
        for page in data.get("query", {}).get("pages", {}).values():
            ii = (page.get("imageinfo") or [None])[0]
            if ii:
                out[page["title"]] = ii
    return out


def candidates(query, limit=14):
    titles = []
    for q in (query + ' incategory:"Quality images"', query + " filetype:bitmap", query):
        data = api({"action": "query", "list": "search", "srsearch": q, "srnamespace": 6, "srlimit": limit})
        for hit in data.get("query", {}).get("search", []):
            if hit["title"] not in titles and not BAD_TITLE.search(hit["title"]):
                titles.append(hit["title"])
        if len(titles) >= 8:
            break
        time.sleep(0.2)
    return titles


def judge(title, ii):
    if not ii or ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
        return None
    if ii.get("width", 0) < 480 or ii.get("height", 0) < 360:
        return None
    meta = ii.get("extmetadata", {})
    lic = norm_license(meta.get("LicenseShortName", {}).get("value", ""))
    if not lic or not OKLIC.match(lic):
        return None
    author = clean(meta.get("Artist", {}).get("value", "")) or clean(meta.get("Credit", {}).get("value", ""))
    if not author or len(author) > 160:
        author = (author[:157] + "...") if author else ""
    if not author:
        return None
    return {"title": title, "license": lic, "author": author, "thumb": ii.get("thumburl") or ii["url"], "orig": ii["url"],
            "page": ii.get("descriptionurl") or ("https://commons.wikimedia.org/wiki/" + title.replace(" ", "_")),
            "w": ii.get("width"), "h": ii.get("height")}


def get_bytes(url):
    for i in range(5):
        r = requests.get(url, headers=UA, timeout=60)
        if r.status_code == 429:
            time.sleep(4 + 4 * i)
            continue
        r.raise_for_status()
        return r.content
    raise RuntimeError("rate limited " + url)


def pick(targets_path, work):
    os.makedirs(os.path.join(work, "prev"), exist_ok=True)
    chosen_path = os.path.join(work, "chosen.json")
    chosen = json.load(open(chosen_path)) if os.path.exists(chosen_path) else {}
    targets = json.load(open(targets_path))
    for t in targets:
        key = t.get("key") or f"{t['symbol']}__{t.get('role','whole')}__{hashlib.md5((t.get('file') or t['query']).encode()).hexdigest()[:4]}"
        t["key"] = key
        if key in chosen:
            continue
        try:
            titles = [t["file"]] if t.get("file") else candidates(t["query"])
            infos = info_for(titles)
            best = None
            used = {c["title"] for c in chosen.values() if c["symbol"] == t["symbol"]}
            for title in titles:
                if title in used:
                    continue
                j = judge(title, infos.get(title))
                if j:
                    best = j
                    break
            if not best:
                print("NONE", key, t.get("query") or t.get("file"))
                continue
            raw = get_bytes(best["thumb"])
            Image.open(io.BytesIO(raw)).convert("RGB").save(os.path.join(work, "prev", key + ".jpg"), quality=85)
            chosen[key] = {**best, **{k: t.get(k, "") for k in ("symbol", "domain", "role", "warning")}, "key": key}
            print("OK  ", key, "|", best["title"], "|", best["license"])
        except Exception as e:  # keep going
            print("ERR ", key, e)
        json.dump(chosen, open(chosen_path, "w"), indent=1)
        time.sleep(0.35)
    json.dump(chosen, open(chosen_path, "w"), indent=1)


def sheet(work, per=20, cols=5, size=300):
    from PIL import ImageDraw
    chosen = json.load(open(os.path.join(work, "chosen.json")))
    keys = sorted(chosen)
    os.makedirs(os.path.join(work, "sheets"), exist_ok=True)
    for n in range(0, len(keys), per):
        group = keys[n:n + per]
        rows = (len(group) + cols - 1) // cols
        im = Image.new("RGB", (cols * size, rows * (size + 28)), "white")
        d = ImageDraw.Draw(im)
        for i, k in enumerate(group):
            p = os.path.join(work, "prev", k + ".jpg")
            if not os.path.exists(p):
                continue
            t = Image.open(p)
            t.thumbnail((size - 6, size - 6))
            x, y = (i % cols) * size, (i // cols) * (size + 28)
            im.paste(t, (x + 3, y + 3))
            d.text((x + 3, y + size - 1), k[:48], fill="black")
        im.save(os.path.join(work, "sheets", f"sheet_{n // per:02d}.jpg"), quality=80)
    print("sheets", (len(keys) + per - 1) // per)


def commit(work, drop=()):
    chosen = json.load(open(os.path.join(work, "chosen.json")))
    man_path = os.path.join(ROOT, "assets/pictures/manifest.json")
    manifest = json.load(open(man_path))
    have = {i["id"] for i in manifest["images"]}
    added, total = 0, 0
    for key, c in sorted(chosen.items()):
        if key in drop or c["symbol"] in drop:
            continue
        iid = f"{c['symbol'].replace('_','-')}-{key.split('__')[-1]}-r4"
        if iid in have:
            continue
        data = get_bytes(c["thumb"])
        im = Image.open(io.BytesIO(data)).convert("RGB")
        im.thumbnail((720, 720))
        fname = iid + ".webp"
        out = os.path.join(ROOT, "assets/pictures", fname)
        im.save(out, "WEBP", quality=68, method=6)
        size = os.path.getsize(out)
        title = c["title"]
        attribution = f"{c['author']}. {c['license']}. {title}."
        lic_url = ""
        m = re.match(r"CC BY(-SA)? ([0-9.]+)", c["license"])
        if m:
            lic_url = f"https://creativecommons.org/licenses/by{'-sa' if m.group(1) else ''}/{m.group(2)}"
        manifest["images"].append({"id": iid, "file": fname, "symbol": c["symbol"], "domain": c.get("domain", ""), "role": c.get("role", "whole"),
            "warning": c.get("warning", ""), "sourceUrl": c["page"], "fileUrl": c["orig"], "author": c["author"], "license": c["license"],
            "licenseUrl": lic_url, "attribution": attribution, "bytes": size})
        added += 1
        total += size
        time.sleep(0.25)
    json.dump(manifest, open(man_path, "w"), indent=1, ensure_ascii=False)
    print("added", added, "images,", round(total / 1e6, 2), "MB")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "pick":
        pick(sys.argv[2], sys.argv[3])
    elif cmd == "sheet":
        sheet(sys.argv[2])
    elif cmd == "commit":
        drop = ()
        if "--drop" in sys.argv:
            drop = tuple(sys.argv[sys.argv.index("--drop") + 1].split(","))
        commit(sys.argv[2], drop)
