# Fetch openly licensed photos of everyday things from Wikimedia Commons for the "everyday" classes.
#   python fetch_everyday.py <datadir> [per_class]
# Writes <datadir>/<class id>/manifest.json (same shape as fetch_inat.py) and the jpg files.
# Only CC0, public domain, CC BY and CC BY-SA files are kept. One file per author per query.
import json, os, re, sys, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__))
from everyday_spec import rows
data = sys.argv[1]; PER = int(sys.argv[2]) if len(sys.argv) > 2 else 70
UA = {"User-Agent": "YehsaCameraBuild/1.0 (https://github.com/dana6969/Yehsa; reference photos for an offline ID model)"}
API = "https://commons.wikimedia.org/w/api.php"
OK = re.compile(r"^(CC0|CC BY( |-)|CC BY-SA|Public domain|PD)", re.I)
BAD = re.compile(r"(NC|ND|fair use|GFDL only)", re.I)

def api(params):
    q = urllib.parse.urlencode(dict(params, format="json"))
    for k in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(API + "?" + q, headers=UA), timeout=40))
        except Exception:
            time.sleep(2 + 3 * k)
    return {}

def search(query, want):
    out, off = [], 0
    while len(out) < want and off < 150:
        r = api(dict(action="query", generator="search", gsrsearch=f"{query} filetype:bitmap", gsrnamespace=6, gsrlimit=50, gsroffset=off,
                     prop="imageinfo", iiprop="url|mime|size|extmetadata", iiurlwidth=448))
        pages = (r.get("query") or {}).get("pages") or {}
        if not pages: break
        for p in sorted(pages.values(), key=lambda p: p.get("index", 0)):
            ii = (p.get("imageinfo") or [{}])[0]
            if ii.get("mime") != "image/jpeg" or min(ii.get("width", 0), ii.get("height", 0)) < 300: continue
            md = ii.get("extmetadata") or {}
            lic = (md.get("LicenseShortName") or {}).get("value", "")
            if not OK.match(lic) or BAD.search(lic): continue
            author = re.sub(r"<[^>]+>", "", (md.get("Artist") or {}).get("value", "unknown"))[:80]
            out.append(dict(photo=p["pageid"], obs=p["title"], user=author, license=lic, url=ii.get("thumburl") or ii["url"]))
        off += 50
        if "continue" not in r: break
        time.sleep(0.3)
    return out

def download(url, path):
    for k in range(4):
        try:
            b = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
            if len(b) < 3000: return False
            open(path, "wb").write(b); return True
        except Exception:
            time.sleep(2 + 3 * k)
    return False

seen_global = set()
for row in rows():
    odir = os.path.join(data, row["id"]); os.makedirs(odir, exist_ok=True)
    per_q = max(8, PER // len(row["queries"]) + 4)
    cand = []
    for q in row["queries"]:
        got = [c for c in search(q, per_q * 3) if c["photo"] not in seen_global]
        users = {}
        k = 0
        for c in got:
            if users.get(c["user"], 0) >= 2: continue
            users[c["user"]] = users.get(c["user"], 0) + 1
            cand.append(c); seen_global.add(c["photo"]); k += 1
            if k >= per_q: break
    cand = cand[: PER + 10]
    def job(c):
        fn = f"{c['photo']}.jpg"
        if download(c["url"], os.path.join(odir, fn)): c["file"] = fn; return c
    with ThreadPoolExecutor(4) as ex: items = [c for c in ex.map(job, cand) if c]
    json.dump({"id": row["id"], "items": items}, open(os.path.join(odir, "manifest.json"), "w"))
    print(row["id"], len(items), flush=True)
