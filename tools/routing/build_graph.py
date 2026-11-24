#!/usr/bin/env python3
"""Build Yehsa's compact offline road graph (.yrg) and place index (.ypl) for one region.

Input: an OpenStreetMap extract (.osm.pbf), pre-filtered by build_all.sh with osmium tags-filter.
Output (little-endian binary, read by symbolic/routing/graph_format.js):
  <id>.yrg  road graph: intersections as nodes, road pieces between them as edges, with
            Douglas-Peucker simplified shape points, class, one-way flags and street names.
  <id>.ypl  place index: tab-separated text lines  name \t kind \t lat \t lon \t near
Data: (c) OpenStreetMap contributors, ODbL 1.0. No parcels, no owner names, no addresses.
"""
import argparse, math, struct, sys
from collections import defaultdict
import osmium

# class code -> (OSM highway values)
CLASSES = [
    ("motorway", "motorway_link"), ("trunk", "trunk_link"), ("primary", "primary_link"),
    ("secondary", "secondary_link"), ("tertiary", "tertiary_link"), ("unclassified",),
    ("residential", "living_street"), ("service",), ("track",), ("path", "bridleway", "footway"),
]
CLASS_OF = {v: i for i, vals in enumerate(CLASSES) for v in vals}
LINK = {"motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
SERVICE_KEEP = {None, "alley"}  # skip driveways and parking aisles
NO_ACCESS = {"no", "private"}
F_ONEWAY_FWD, F_ONEWAY_REV, F_LINK, F_ROUNDABOUT, F_NO_CAR, F_NO_FOOT = 1, 2, 4, 8, 16, 32
CELL = 0.02  # degrees per grid cell for snapping

def hav(a, b):
    la1, lo1 = math.radians(a[0]), math.radians(a[1])
    la2, lo2 = math.radians(b[0]), math.radians(b[1])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371008.8 * math.asin(min(1.0, math.sqrt(h)))

def simplify(pts, tol_m):
    if len(pts) <= 2:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    lat0 = math.radians(pts[0][0])
    kx = 111320 * math.cos(lat0)
    ky = 110540
    xy = [(p[1] * kx, p[0] * ky) for p in pts]
    stack = [(0, len(pts) - 1)]
    while stack:
        s, e = stack.pop()
        ax, ay = xy[s]; bx, by = xy[e]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1, -1
        for i in range(s + 1, e):
            px, py = xy[i]
            if L == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > best:
                best, bi = d, i
        if best > tol_m:
            keep[bi] = True
            stack.append((s, bi)); stack.append((bi, e))
    return [p for p, k in zip(pts, keep) if k]

class Roads(osmium.SimpleHandler):
    def __init__(self, walk_paths):
        super().__init__()
        self.ways = []  # (cls, flags, name, [(id, lat, lon)])
        self.use = defaultdict(int)
        self.walk_paths = walk_paths
    def way(self, w):
        hw = w.tags.get("highway")
        cls = CLASS_OF.get(hw)
        if cls is None:
            return
        if hw == "footway" and not w.tags.get("name"):
            return  # unnamed sidewalks and crossings: too many, little use off-grid
        if hw == "footway" or hw == "path" or hw == "bridleway":
            if not self.walk_paths:
                return
        if hw == "service" and (w.tags.get("service") not in SERVICE_KEEP or not w.tags.get("name")):
            return  # only named service roads (camp roads, lanes); driveways and lots are skipped
        if w.tags.get("area") == "yes":
            return
        access = w.tags.get("access")
        flags = 0
        car = w.tags.get("motor_vehicle") or w.tags.get("motorcar") or w.tags.get("vehicle") or access
        foot = w.tags.get("foot") or access
        if car in NO_ACCESS or cls == 9:
            flags |= F_NO_CAR
        if foot in NO_ACCESS or hw in ("motorway", "motorway_link") or w.tags.get("foot") == "no":
            flags |= F_NO_FOOT
        if (flags & F_NO_CAR) and (flags & F_NO_FOOT):
            return
        ow = w.tags.get("oneway")
        junction = w.tags.get("junction")
        if ow in ("yes", "1", "true") or (ow is None and (junction in ("roundabout", "circular") or hw in ("motorway",))):
            flags |= F_ONEWAY_FWD
        elif ow == "-1":
            flags |= F_ONEWAY_REV
        if hw in LINK:
            flags |= F_LINK
        if junction in ("roundabout", "circular"):
            flags |= F_ROUNDABOUT
        name = w.tags.get("name") or ""
        ref = w.tags.get("ref") or ""
        label = name if name else ref
        if name and ref and cls <= 3:
            label = f"{name} ({ref})"
        try:
            nodes = [(n.ref, n.location.lat, n.location.lon) for n in w.nodes if n.location.valid()]
        except osmium.InvalidLocationError:
            return
        if len(nodes) < 2:
            return
        for i, n in enumerate(nodes):
            self.use[n[0]] += 2 if i in (0, len(nodes) - 1) else 1
        self.ways.append((cls, flags, label, nodes))

KIND = [
    ("place", ("city", "town", "village", "hamlet", "suburb", "neighbourhood", "locality")),
]

class Places(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.rows = []
    def add(self, tags, lat, lon):
        name = tags.get("name")
        if not name:
            return
        kind = None
        for key in ("place", "amenity", "shop", "tourism", "natural", "leisure", "highway", "boundary"):
            v = tags.get(key)
            if v:
                kind = v if key != "boundary" else "protected_area"
                break
        if not kind or kind in ("parking", "information"):
            return
        near = tags.get("addr:city") or tags.get("is_in:town") or ""
        self.rows.append((name.replace("\t", " ").replace("\n", " "), kind, lat, lon, near))
    def node(self, n):
        if n.tags:
            self.add(n.tags, n.location.lat, n.location.lon)
    def way(self, w):
        if not w.tags or "highway" in w.tags and w.tags.get("highway") != "trailhead":
            return
        try:
            pts = [(n.location.lat, n.location.lon) for n in w.nodes if n.location.valid()]
        except osmium.InvalidLocationError:
            return
        if not pts:
            return
        lat = sum(p[0] for p in pts) / len(pts)
        lon = sum(p[1] for p in pts) / len(pts)
        self.add(w.tags, lat, lon)

def build(roads_pbf, places_pbf, out_prefix, tol, min_comp, walk_paths):
    h = Roads(walk_paths)
    h.apply_file(roads_pbf, locations=True, idx="flex_mem")
    print(f"ways {len(h.ways)}", file=sys.stderr)
    node_id = {}
    nlat, nlon = [], []
    def nid(n):
        k = n[0]
        i = node_id.get(k)
        if i is None:
            i = len(nlat); node_id[k] = i; nlat.append(n[1]); nlon.append(n[2])
        return i
    edges = []  # from, to, len_dm, cls, flags, name, geom(list of (lat,lon))
    names = {"": 0}
    for cls, flags, label, nodes in h.ways:
        ni = names.setdefault(label, len(names))
        start = 0
        for i in range(1, len(nodes)):
            if i == len(nodes) - 1 or h.use[nodes[i][0]] > 1:
                seg = nodes[start:i + 1]
                pts = [(p[1], p[2]) for p in seg]
                length = sum(hav(pts[j], pts[j + 1]) for j in range(len(pts) - 1))
                a, b = nid(seg[0]), nid(seg[-1])
                if a != b or length > 1:
                    shape = simplify(pts, tol)[1:-1]
                    edges.append([a, b, max(1, round(length * 10)), cls, flags, ni, shape])
                start = i
    N = len(nlat)
    # drop small islands (connected components smaller than min_comp nodes)
    parent = list(range(N))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for e in edges:
        ra, rb = find(e[0]), find(e[1])
        if ra != rb:
            parent[ra] = rb
    size = defaultdict(int)
    for i in range(N):
        size[find(i)] += 1
    keepn = [size[find(i)] >= min_comp for i in range(N)]
    edges = [e for e in edges if keepn[e[0]]]
    # reorder nodes by grid cell
    used = sorted({e[0] for e in edges} | {e[1] for e in edges})
    south = min(nlat[i] for i in used); north = max(nlat[i] for i in used)
    west = min(nlon[i] for i in used); east = max(nlon[i] for i in used)
    cw = int((east - west) / CELL) + 1; ch = int((north - south) / CELL) + 1
    def cell(i):
        return min(ch - 1, int((nlat[i] - south) / CELL)) * cw + min(cw - 1, int((nlon[i] - west) / CELL))
    used.sort(key=lambda i: (cell(i), nlat[i], nlon[i]))
    remap = {old: new for new, old in enumerate(used)}
    N = len(used)
    cellStart = [0] * (cw * ch + 1)
    for i in used:
        cellStart[cell(i) + 1] += 1
    for c in range(cw * ch):
        cellStart[c + 1] += cellStart[c]
    for e in edges:
        e[0] = remap[e[0]]; e[1] = remap[e[1]]
    E = len(edges)
    adj = [[] for _ in range(N)]
    for k, e in enumerate(edges):
        adj[e[0]].append(k)
        if e[1] != e[0]:
            adj[e[1]].append(k)
    # names actually used
    name_list = [""] * len(names)
    for k, v in names.items():
        name_list[v] = k
    used_names = sorted({e[5] for e in edges})
    nremap = {0: 0}
    out_names = [""]
    for v in used_names:
        if v == 0:
            continue
        nremap[v] = len(out_names); out_names.append(name_list[v])
    name_bytes = [s.encode("utf-8") for s in out_names]
    G = sum(len(e[6]) for e in edges)
    # Names sorted by use so common names get small varint indexes.
    count = defaultdict(int)
    for e in edges:
        count[e[5]] += 1
    order = [0] + sorted((v for v in count if v != 0), key=lambda v: -count[v])
    nremap = {v: i for i, v in enumerate(order)}
    name_list = [""] * len(names)
    for k, v in names.items():
        name_list[v] = k
    out_names = [name_list[v] for v in order]
    # Edges sorted by their from node; each is stored once and read both ways unless one-way.
    edges.sort(key=lambda e: (e[0], e[1]))

    def uv(out, x):
        while x >= 0x80:
            out.append((x & 0x7F) | 0x80); x >>= 7
        out.append(x)
    def zz(x):
        return (x << 1) if x >= 0 else ((-x << 1) - 1)

    sec_nodes = bytearray()
    pl = po = 0
    for i in used:
        la, lo = round(nlat[i] * 1e6), round(nlon[i] * 1e6)
        uv(sec_nodes, zz(la - pl)); uv(sec_nodes, zz(lo - po)); pl, po = la, lo
    sec_cells = bytearray()
    for c in range(cw * ch):
        uv(sec_cells, cellStart[c + 1] - cellStart[c])
    sec_edges = bytearray()
    pf = 0
    stats = defaultdict(lambda: [0, 0])
    for e in edges:
        a, b = e[0], e[1]
        uv(sec_edges, a - pf); pf = a
        uv(sec_edges, zz(b - a))
        uv(sec_edges, max(1, round(e[2] / 10)))  # metres
        uv(sec_edges, nremap[e[5]])
        uv(sec_edges, e[3] | (e[4] << 4))
        uv(sec_edges, len(e[6]))
        start_len = len(sec_edges)
        pla, plo = round(nlat[used[a]] * 1e5), round(nlon[used[a]] * 1e5)
        for p in e[6]:
            la, lo = round(p[0] * 1e5), round(p[1] * 1e5)
            uv(sec_edges, zz(la - pla)); uv(sec_edges, zz(lo - plo)); pla, plo = la, lo
        stats[e[3]][0] += 1
        stats[e[3]][1] += e[2] / 10000
    sec_names = bytearray()
    for s in out_names:
        b = s.encode("utf-8"); uv(sec_names, len(b)); sec_names.extend(b)
    head = struct.pack("<4sHHIIIIiiiiIIIIIII", b"YRG2", 2, 0, N, E, G, len(out_names),
                       round(south * 1e6), round(west * 1e6), round(north * 1e6), round(east * 1e6),
                       round(CELL * 1e6), cw, ch, len(sec_nodes), len(sec_cells), len(sec_edges), len(sec_names))
    buf = head + bytes(sec_nodes) + bytes(sec_cells) + bytes(sec_edges) + bytes(sec_names)
    with open(out_prefix + ".yrg", "wb") as f:
        f.write(buf)
    print(f"graph nodes {N} edges {E} shape {G} names {len(out_names)} bytes {len(buf)} "
          f"(nodes {len(sec_nodes)} cells {len(sec_cells)} edges {len(sec_edges)} names {len(sec_names)})", file=sys.stderr)
    print("by class (edges, km): " + ", ".join(f"{CLASSES[k][0]} {v[0]}/{v[1]:.0f}" for k, v in sorted(stats.items())), file=sys.stderr)
    nremap_final = nremap

    # place index: named places + one point per street name per ~5 km cell
    p = Places()
    p.apply_file(places_pbf, locations=True, idx="flex_mem")
    towns = [r for r in p.rows if r[1] in ("city", "town", "village", "hamlet")]
    tgrid = defaultdict(list)
    for t in towns:
        tgrid[(int(t[2] / 0.25), int(t[3] / 0.25))].append(t)
    def nearest_town(lat, lon):
        best, bd = "", 1e18
        ci, cj = int(lat / 0.25), int(lon / 0.25)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for t in tgrid.get((ci + di, cj + dj), ()):
                    d = (t[2] - lat) ** 2 + ((t[3] - lon) * math.cos(math.radians(lat))) ** 2
                    if d < bd:
                        bd, best = d, t[0]
        return best
    rows = []
    seen = set()
    for r in p.rows:
        key = (r[0].lower(), r[1], round(r[2], 2), round(r[3], 2))
        if key in seen:
            continue
        seen.add(key)
        near = r[4] or (nearest_town(r[2], r[3]) if r[1] not in ("city", "town") else "")
        rows.append((r[0], r[1], r[2], r[3], near if near != r[0] else ""))
    street_seen = set()
    for e in edges:
        if not e[5] or e[3] > 8:
            continue
        nm = out_names[nremap_final[e[5]]]
        a = e[0]
        lat = nlat[used[a]]; lon = nlon[used[a]]
        town = nearest_town(lat, lon)
        # One entry per street name per nearest town (the router snaps to the street from there).
        key = (nm.lower(), town)
        if key in street_seen:
            continue
        street_seen.add(key)
        rows.append((nm, "street", lat, lon, town))
    rows.sort(key=lambda r: r[0].lower())
    with open(out_prefix + ".ypl", "w", encoding="utf-8") as f:
        for r in rows:
            f.write(f"{r[0]}\t{r[1]}\t{r[2]:.5f}\t{r[3]:.5f}\t{r[4]}\n")
    print(f"places {len(rows)}", file=sys.stderr)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("roads"); ap.add_argument("places"); ap.add_argument("out")
    ap.add_argument("--tol", type=float, default=10.0)
    ap.add_argument("--min-comp", type=int, default=30)
    ap.add_argument("--no-paths", action="store_true")
    a = ap.parse_args()
    build(a.roads, a.places, a.out, a.tol, a.min_comp, not a.no_paths)
