# Fetch openly licensed iNaturalist research-grade photos for camera-ID references.
#   python tools/camera_id/fetch_inat.py <outdir> [--per-class 44] [--only id,id] [--others 1200]
# Photos stay in <outdir> (never committed). A manifest keeps observation URL, observer and
# license for each photo so credits ship with the index. Only CC0, CC BY and CC BY-SA photos.
import json, os, sys, time, random, hashlib, urllib.parse, urllib.request, threading
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__))
from classes_spec import rows

UA = {"User-Agent": "YehsaCameraID/1.0 (https://github.com/dana6969/Yehsa; offline reference set build)"}
API = "https://api.inaturalist.org/v1"
LICENSES = "cc0,cc-by,cc-by-sa"
NA = 97394  # North America
_lock = threading.Lock()
_last = [0.0]

def get_json(path, params):
    url = API + path + "?" + urllib.parse.urlencode(params)
    for k in range(6):
        with _lock:
            wait = 1.1 - (time.time() - _last[0])
            if wait > 0: time.sleep(wait)
            _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(3 + 5 * k)
    raise RuntimeError(url)

def taxon_id(name):
    d = get_json("/taxa", {"q": name, "is_active": "true", "per_page": 10})
    for t in d["results"]:
        if t["name"].lower() == name.lower():
            return t["id"]
    for t in d["results"]:
        if name.lower() in [n.lower() for n in [t.get("matched_term") or ""]]:
            return t["id"]
    return None

def download(url, path):
    for k in range(4):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
            if len(data) < 3000: return False
            open(path, "wb").write(data); return True
        except Exception:
            time.sleep(2 + 3 * k)
    return False

def candidates(params, want):
    """distinct observers, first photo only, allowed licenses, up to `want` items."""
    out, users, page = [], {}, 1
    while len(out) < want and page <= 3:
        d = get_json("/observations", dict(params, quality_grade="research", photo_license=LICENSES, photos="true", per_page=200, page=page, order_by="random", order="desc", locale="en", **{"license": LICENSES}) if False else dict(params, quality_grade="research", photo_license=LICENSES, photos="true", per_page=200, page=page, order_by="random"))
        if not d["results"]: break
        for o in d["results"]:
            if not o.get("photos") or not o.get("user"): continue
            p = o["photos"][0]
            if (p.get("license_code") or "").lower() not in ("cc0", "cc-by", "cc-by-sa"): continue
            u = o["user"]["id"]
            if users.get(u, 0) >= 1: continue
            users[u] = users.get(u, 0) + 1
            url = p["url"].replace("square", "medium")
            out.append(dict(obs=o["id"], photo=p["id"], url=url, user=o["user"].get("login", ""), license=p["license_code"], taxon=(o.get("taxon") or {}).get("name", ""), ancestors=(o.get("taxon") or {}).get("ancestor_ids", [])))
            if len(out) >= want: break
        page += 1
    return out

def fetch_class(r, outdir, per):
    cdir = os.path.join(outdir, r["id"]); os.makedirs(cdir, exist_ok=True)
    mf = os.path.join(cdir, "manifest.json")
    if os.path.exists(mf): return json.load(open(mf))
    ids = [taxon_id(n) for n in r["taxa"]]
    ids = [i for i in ids if i]
    if not ids: return {"id": r["id"], "error": "no taxon", "items": []}
    params = {"taxon_id": ",".join(map(str, ids)), "place_id": NA}
    if r["group"] == "track": params["term_id"], params["term_value_id"] = 22, 26
    if r["group"] == "scat": params["term_id"], params["term_value_id"] = 22, 25
    items = candidates(params, per)
    if len(items) < per // 2 and r["group"] not in ("track", "scat"):
        items = candidates({"taxon_id": params["taxon_id"]}, per)  # worldwide fallback
    done = []
    for it in items:
        fn = f"{it['photo']}.jpg"
        if download(it["url"], os.path.join(cdir, fn)):
            it["file"] = fn; it["taxon_ids"] = ids; done.append(it)
    res = {"id": r["id"], "taxon_ids": ids, "items": done}
    json.dump(res, open(mf, "w"))
    return res

def fetch_others(outdir, n, exclude_ids):
    """Random photos of things not in the class list: the 'not in my set' pool."""
    odir = os.path.join(outdir, "_other"); os.makedirs(odir, exist_ok=True)
    mf = os.path.join(odir, "manifest.json")
    if os.path.exists(mf): return
    groups = [("Plantae", 47126, 0.45), ("Fungi", 47170, 0.10), ("Animalia", 1, 0.25), ("Aves", 3, 0.10), ("Insecta", 47158, 0.10)]
    items = []
    for name, tid, frac in groups:
        want = int(n * frac)
        got = candidates({"taxon_id": tid, "place_id": NA}, int(want * 1.4)) if want else []
        got = [g for g in got if not (set(g["ancestors"]) | {0}) & exclude_ids and g["taxon"] not in ()]
        for g in got[:want]:
            g["group"] = name; items.append(g)
    done = []
    for it in items:
        fn = f"{it['photo']}.jpg"
        if download(it["url"], os.path.join(odir, fn)):
            it["file"] = fn; done.append(it)
    json.dump({"id": "_other", "items": done}, open(mf, "w"))

if __name__ == "__main__":
    outdir = sys.argv[1]; per = 44; only = None; others = 1200
    a = sys.argv[2:]
    for i, x in enumerate(a):
        if x == "--per-class": per = int(a[i + 1])
        if x == "--only": only = set(a[i + 1].split(","))
        if x == "--others": others = int(a[i + 1])
    allr = rows()
    todo = [r for r in allr if not only or r["id"] in only]
    all_ids = set()
    for r in allr:
        pass
    def work(r):
        try:
            res = fetch_class(r, outdir, per)
            print(r["id"], len(res["items"]), res.get("error", ""), flush=True)
            return res
        except Exception as e:
            print("FAIL", r["id"], e, flush=True)
    # sequential API calls are rate-limited globally, downloads are light; use a few workers
    with ThreadPoolExecutor(4) as ex:
        results = list(ex.map(work, todo))
    for res in results:
        if res:
            for i in res.get("taxon_ids", []): all_ids.add(i)
    if others and not only:
        fetch_others(outdir, others, all_ids)
        print("others done", flush=True)
