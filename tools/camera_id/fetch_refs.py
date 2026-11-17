# Fetch permissively licensed Commons photos for camera-ID references. See README.md.
import json, re, sys, time, urllib.parse, urllib.request, os, hashlib
UA = {"User-Agent": "YehsaCameraID/0.1 (https://github.com/dana6969/Yehsa; offline reference set build)"}
API = "https://commons.wikimedia.org/w/api.php"
ALLOWED = re.compile(r"^(public domain|pd.*|cc0|cc zero|cc by( [0-9.]+)?( [a-z]{2,})?|cc by-sa( [0-9.]+)?( [a-z]{2,})?)$", re.I)
FORBID = re.compile(r"\b(nc|nd|gfdl|all rights|fair use)\b", re.I)
SKIP = re.compile(r"(illustrat|drawing|plate|herbar|map|distribution|\.svg|\.tif|\.gif|diagram|botanisch|koehler|thom[eé]|flora_|seeds?_|stamp|sketch|painting|_dried|scan|micro)", re.I)
def get(params):
    params = dict(params, format="json", formatversion=2)
    url = API + "?" + urllib.parse.urlencode(params)
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(2 + 3 * k)
    raise RuntimeError(url)
def strip(html):
    return re.sub(r"<[^>]+>", "", html or "").strip()
def files_in(cat, limit=200):
    out=[]; cont={}
    while True:
        d = get(dict(action="query", generator="categorymembers", gcmtitle="Category:"+cat, gcmtype="file", gcmlimit=50,
                     prop="imageinfo", iiprop="url|extmetadata|mime|size", iiurlwidth=360, **cont))
        out += d.get("query",{}).get("pages",[])
        if "continue" in d and len(out) < limit: cont = {"gcmcontinue": d["continue"]["gcmcontinue"]}
        else: break
    return out
def pick(cls, cats, n, outdir):
    os.makedirs(outdir, exist_ok=True)
    chosen=[]; seen=set()
    for cat in cats:
        pages = files_in(cat)
        pages.sort(key=lambda p: hashlib.md5(p["title"].encode()).hexdigest())  # deterministic, not cherry-picked
        for p in pages:
            if len(chosen) >= n: break
            ii = (p.get("imageinfo") or [None])[0]
            if not ii or ii.get("mime") != "image/jpeg": continue
            if SKIP.search(p["title"]): continue
            if ii.get("width",0) < 600: continue
            md = ii.get("extmetadata", {})
            lic = strip(md.get("LicenseShortName",{}).get("value",""))
            if not lic or FORBID.search(lic) or not ALLOWED.match(lic): continue
            if p["title"] in seen: continue
            seen.add(p["title"])
            fname = f"{cls}-{len(chosen):02d}.jpg"
            req = urllib.request.Request(ii["thumburl"], headers=UA)
            for k in range(4):
                try:
                    data = urllib.request.urlopen(req, timeout=60).read(); break
                except Exception: time.sleep(3+3*k)
            else: continue
            open(os.path.join(outdir, fname), "wb").write(data)
            author = strip(md.get("Artist",{}).get("value","")) or "Unknown"
            chosen.append(dict(file=fname, cls=cls, title=p["title"], sourceUrl=ii["descriptionurl"], author=author[:160], license=lic,
                               licenseUrl=strip(md.get("LicenseUrl",{}).get("value",""))))
            time.sleep(0.3)
    return chosen
if __name__ == "__main__":
    spec = json.load(open(sys.argv[1])); outdir = sys.argv[2]; n = int(sys.argv[3])
    allc=[]
    for cls, cats in spec.items():
        c = pick(cls, cats, n, outdir); print(cls, len(c), flush=True); allc += c
    json.dump(allc, open(os.path.join(outdir, "sources.json"), "w"), indent=1)
