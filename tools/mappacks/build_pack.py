#!/usr/bin/env python3
"""Build one Yehsa offline map pack (raster MBTiles) from open data.

Reproducible: same region id + same source dates gives the same layers.
Layers drawn into every tile (no road or street layer, no parcel or owner layer):
  - terrain: hillshade and contour lines from AWS Terrain Tiles (Terrarium, public domain
    inputs: USGS 3DEP, SRTM, GMTED, ETOPO1)
  - land cover colors: NLCD 2021 Land Cover (USGS / MRLC, public domain). Thin developed
    pixels that trace roads are filtered out so no road network shows.
  - water: NLCD open water, ocean from negative elevation, rivers/streams/canals from OSM
  - trails: OSM highway=path, bridleway, footway (not sidewalks or crossings), nothing else
  - protected areas: OSM boundary=protected_area, national_park, leisure=nature_reserve,
    outline only, no names or owners

Output: <out>/<id>.mbtiles (WebP tiles, 512 px, XYZ numbering stored as TMS rows per spec)
        <out>/<id>.json (metadata used by the pack manifest)

Usage: build_pack.py --region ri --data /workspace/yehsa-r3-data --out /workspace/yehsa-r3-packs
Requires: pip install -r requirements.txt   (numpy Pillow scipy shapely osmium requests)
"""
import argparse
import concurrent.futures as cf
import datetime
import hashlib
import io
import json
import math
import multiprocessing as mp
import os
import pickle
import sqlite3
import sys
import time

import numpy as np
import requests
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
TILE = 512
TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
NLCD_WMS = ("https://www.mrlc.gov/geoserver/mrlc_display/NLCD_2021_Land_Cover_L48/wms?service=WMS&version=1.1.1"
            "&request=GetMap&layers=NLCD_2021_Land_Cover_L48&styles=&format=image/png&transparent=false"
            "&srs=EPSG:3857&width={w}&height={w}&bbox={x0},{y0},{x1},{y1}")
NE_ADMIN1 = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"
ORIGIN = 20037508.342789244

# NLCD legend color -> class index
NLCD = {
    (70, 107, 159): "water", (209, 222, 248): "ice",
    (222, 197, 197): "dev_open", (217, 146, 130): "dev_low", (235, 0, 0): "dev_med", (171, 0, 0): "dev_high",
    (179, 172, 159): "barren", (104, 171, 95): "decid", (28, 95, 44): "everg", (181, 197, 143): "mixed",
    (204, 184, 121): "shrub", (223, 223, 194): "grass", (220, 217, 57): "pasture", (171, 108, 40): "crops",
    (184, 217, 235): "wood_wet", (108, 159, 184): "herb_wet",
}
CLASS_COLORS = {
    "water": (146, 186, 220), "ice": (236, 241, 248), "dev": (222, 214, 203), "barren": (214, 205, 184),
    "decid": (152, 186, 128), "everg": (108, 152, 108), "mixed": (132, 170, 120), "shrub": (192, 198, 142),
    "grass": (226, 230, 192), "pasture": (228, 230, 172), "crops": (233, 225, 178),
    "wood_wet": (140, 184, 170), "herb_wet": (168, 204, 196), "other": (228, 226, 204),
}
CLASS_ORDER = list(CLASS_COLORS)
PAL = np.array([k for k in NLCD], dtype=np.int32)
PAL_CLS = [NLCD[tuple(k)] for k in PAL]


def merc_norm(lon, lat):
    lon = np.asarray(lon, dtype=np.float64)
    lat = np.clip(np.asarray(lat, dtype=np.float64), -85.05, 85.05)
    x = (lon + 180.0) / 360.0
    y = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2
    return x, y


def tile_bounds_lonlat(z, x, y):
    n = 2 ** z
    west = x / n * 360 - 180
    east = (x + 1) / n * 360 - 180
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return west, south, east, north


def lonlat_tile(lon, lat, z):
    n = 2 ** z
    x, y = merc_norm(lon, lat)
    return int(min(n - 1, max(0, math.floor(float(x) * n)))), int(min(n - 1, max(0, math.floor(float(y) * n))))


# ---------------------------------------------------------------- inputs

def fetch(url, path, tries=4, **kw):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    last = None
    for i in range(tries):
        try:
            r = requests.get(url, timeout=60, **kw)
            if r.status_code == 200 and r.content:
                tmp = path + ".part"
                with open(tmp, "wb") as f:
                    f.write(r.content)
                os.replace(tmp, path)
                return path
            last = f"HTTP {r.status_code}"
        except Exception as e:  # network hiccup, retry
            last = str(e)
        time.sleep(1 + i * 2)
    raise RuntimeError(f"fetch failed {url}: {last}")


def state_polygon(data, state):
    from shapely.geometry import shape
    from shapely.ops import unary_union
    path = fetch(NE_ADMIN1, os.path.join(data, "ne_admin1.geojson"))
    with open(path) as f:
        gj = json.load(f)
    parts = [shape(ft["geometry"]) for ft in gj["features"]
             if ft["properties"].get("name") == state and ft["properties"].get("iso_a2") == "US"]
    if not parts:
        raise SystemExit(f"state not found in Natural Earth: {state}")
    return unary_union(parts)


def select_tiles(region, poly):
    from shapely.geometry import box
    from shapely.prepared import prep
    w, s, e, n = region["bbox"]
    clip = poly.intersection(box(w, s, e, n)).buffer(0.01)
    pc = prep(clip)
    tiles = []
    for z in range(region["minZoom"], region["maxZoom"] + 1):
        x0, y1 = lonlat_tile(w, s, z)
        x1, y0 = lonlat_tile(e, n, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                tw, ts, te, tn = tile_bounds_lonlat(z, x, y)
                if pc.intersects(box(tw, ts, te, tn)):
                    tiles.append((z, x, y))
    return tiles


def dem_zoom_for(z, region):
    return min(region["maxZoom"] + int(region.get("demExtra", 0)), z + 1)


def needed_dem_tiles(tiles, region):
    need = set()
    for z, x, y in tiles:
        sz = dem_zoom_for(z, region)
        f = 2 ** (sz - z) if sz >= z else 1
        for dx in range(-1, f + 1):
            for dy in range(-1, f + 1):
                need.add((sz, x * f + dx, y * f + dy))
    out = set()
    for sz, x, y in need:
        n = 2 ** sz
        if 0 <= x < n and 0 <= y < n:
            out.add((sz, x, y))
    return sorted(out)


def download_dem(tiles, data, workers=24):
    base = os.path.join(data, "dem")

    def one(t):
        z, x, y = t
        return fetch(TERRARIUM.format(z=z, x=x, y=y), os.path.join(base, str(z), str(x), f"{y}.png"))

    with cf.ThreadPoolExecutor(workers) as ex:
        done = 0
        for _ in ex.map(one, tiles):
            done += 1
            if done % 500 == 0:
                print(f"  dem {done}/{len(tiles)}", flush=True)


def osm_features(pbf_path, cache_path):
    """Waterways, trails, protected-area outlines from a Geofabrik extract. Cached as a pickle."""
    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return pickle.load(f)
    labels = []
    import osmium
    tf = osmium.filter.TagFilter(
        ("waterway", "river"), ("waterway", "stream"), ("waterway", "canal"),
        ("highway", "path"), ("highway", "bridleway"), ("highway", "footway"),
        ("boundary", "protected_area"), ("boundary", "national_park"), ("leisure", "nature_reserve"),
        ("place", "city"), ("place", "town"), ("place", "village"), ("place", "hamlet"), ("natural", "peak"))
    af = osmium.filter.TagFilter(("boundary", "protected_area"), ("boundary", "national_park"), ("leisure", "nature_reserve"))
    fp = osmium.FileProcessor(pbf_path, osmium.osm.WAY | osmium.osm.RELATION | osmium.osm.NODE).with_locations().with_areas(af).with_filter(tf)
    feats = []
    for o in fp:
        tags = o.tags
        try:
            if o.is_way() and not o.is_closed() or (o.is_way() and (tags.get("waterway") or tags.get("highway"))):
                wt = tags.get("waterway")
                hw = tags.get("highway")
                if wt in ("river", "stream", "canal"):
                    cls = "river" if wt in ("river", "canal") else "stream"
                elif hw in ("path", "bridleway", "footway"):
                    if hw == "footway" and tags.get("footway") in ("sidewalk", "crossing", "traffic_island", "link"):
                        continue
                    if tags.get("indoor") or tags.get("tunnel") == "building_passage":
                        continue
                    cls = "trail"
                else:
                    continue
                pts = [(n.lon, n.lat) for n in o.nodes if n.location.valid()]
                if len(pts) >= 2:
                    a = np.array(pts, dtype=np.float64)
                    x, y = merc_norm(a[:, 0], a[:, 1])
                    feats.append((cls, np.stack([x, y], 1).astype(np.float32)))
            elif o.is_node():
                name = tags.get("name")
                if not name or not o.location.valid():
                    continue
                kind = tags.get("place") or ("peak" if tags.get("natural") == "peak" else None)
                if kind not in ("city", "town", "village", "hamlet", "peak"):
                    continue
                ele = None
                try:
                    ele = float(str(tags.get("ele", "")).split()[0].replace(",", "")) if tags.get("ele") else None
                except ValueError:
                    ele = None
                x, y = merc_norm(o.location.lon, o.location.lat)
                labels.append((kind, str(name)[:40], float(x), float(y), ele))
            elif o.is_area():
                if not (tags.get("boundary") in ("protected_area", "national_park") or tags.get("leisure") == "nature_reserve"):
                    continue
                for ring in o.outer_rings():
                    pts = [(n.lon, n.lat) for n in ring if n.location.valid()]
                    if len(pts) >= 4:
                        a = np.array(pts, dtype=np.float64)
                        x, y = merc_norm(a[:, 0], a[:, 1])
                        feats.append(("protected", np.stack([x, y], 1).astype(np.float32)))
        except Exception:
            continue
    result = (feats, labels)
    with open(cache_path, "wb") as f:
        pickle.dump(result, f, protocol=4)
    return result


# ---------------------------------------------------------------- rendering state (shared by forked workers)
G = {}


def terrarium_array(path):
    try:
        im = Image.open(path).convert("RGB")
    except Exception:
        return np.zeros((256, 256), np.float32)
    a = np.asarray(im, dtype=np.float32)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


_dem_cache = {}


def dem_tile(sz, x, y):
    key = (sz, x, y)
    v = _dem_cache.get(key)
    if v is not None:
        return v
    n = 2 ** sz
    if not (0 <= x < n and 0 <= y < n):
        return None
    arr = terrarium_array(os.path.join(G["data"], "dem", str(sz), str(x), f"{y}.png"))
    if len(_dem_cache) > 400:
        _dem_cache.clear()
    _dem_cache[key] = arr
    return arr


def elevation_for_tile(z, x, y, region):
    """514x514 elevation grid (1 px border) in meters for output tile z/x/y."""
    sz = dem_zoom_for(z, region)
    f = 2 ** (sz - z)  # source tiles per output tile side (1 when sz == z... see below)
    if sz >= z:
        ext = 256 * f           # source px across the output tile
        tx0, ty0 = x * f, y * f
        cnt = f
    else:
        raise RuntimeError("source zoom below output zoom")
    pad = 2
    mosaic = np.zeros(((cnt + 2) * 256, (cnt + 2) * 256), np.float32)
    for i in range(-1, cnt + 1):
        for j in range(-1, cnt + 1):
            t = dem_tile(sz, tx0 + i, ty0 + j)
            if t is None:  # off the world edge: repeat nearest edge
                t = dem_tile(sz, min(max(tx0 + i, 0), 2 ** sz - 1), min(max(ty0 + j, 0), 2 ** sz - 1))
            mosaic[(j + 1) * 256:(j + 2) * 256, (i + 1) * 256:(i + 2) * 256] = t
    crop = mosaic[256 - pad:256 + ext + pad, 256 - pad:256 + ext + pad]
    scale = TILE / ext
    if scale != 1:
        up = ndimage.zoom(crop, scale, order=1, mode="nearest", grid_mode=True)
    else:
        up = crop
    off = int(round(pad * scale)) - 1
    return up[off:off + TILE + 2, off:off + TILE + 2]


def majority(cls, size=3):
    """Majority filter so single-pixel speckle does not eat the WebP size or the eye."""
    best = np.zeros(cls.shape, np.float32)
    out = cls.copy()
    for k in np.unique(cls):
        score = ndimage.uniform_filter((cls == k).astype(np.float32), size=size, mode="nearest")
        take = score > best
        out[take] = k
        best = np.where(take, score, best)
    return out


def nlcd_classes(z, x, y):
    n = 2 ** z
    x0 = x / n * 2 * ORIGIN - ORIGIN
    x1 = (x + 1) / n * 2 * ORIGIN - ORIGIN
    y1 = ORIGIN - y / n * 2 * ORIGIN
    y0 = ORIGIN - (y + 1) / n * 2 * ORIGIN
    cache = os.path.join(G["data"], "nlcd", str(z), str(x), f"{y}.png")
    try:
        fetch(NLCD_WMS.format(w=TILE, x0=x0, y0=y0, x1=x1, y1=y1), cache, tries=5)
        im = np.asarray(Image.open(cache).convert("RGB"), dtype=np.int32)
    except Exception:
        return np.full((TILE, TILE), CLASS_ORDER.index("other"), np.uint8)
    # nearest NLCD legend color
    flat = im.reshape(-1, 3)
    d = ((flat[:, None, :] - PAL[None, :, :]) ** 2).sum(2)
    idx = d.argmin(1)
    dist = d[np.arange(len(idx)), idx]
    cls = np.full(len(idx), CLASS_ORDER.index("other"), np.uint8)
    for k, name in enumerate(PAL_CLS):
        key = "dev" if name.startswith("dev_") else name
        cls[(idx == k) & (dist < 1200)] = CLASS_ORDER.index(key)
    return majority(cls.reshape(TILE, TILE))


def contour_interval(z, region):
    scale = float(region.get("contourScale", 1))
    base = {8: 200, 9: 100, 10: 50, 11: 20, 12: 10, 13: 10}.get(z)
    return None if base is None else base * scale


def hillshade(elev, z, lat):
    res = 156543.03392 * math.cos(math.radians(lat)) / (2 ** z) / (TILE / 256)
    zf = 2.2 if z >= 10 else (3.0 if z >= 8 else 4.5)
    dzdy, dzdx = np.gradient(elev, res)
    dzdx *= zf
    dzdy *= zf
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(dzdy, -dzdx)
    az = math.radians(315)
    zen = math.radians(48)
    sh = np.cos(zen) * np.cos(slope) + np.sin(zen) * np.sin(slope) * np.cos(az - aspect)
    sh = np.clip(sh, 0, 1)
    flat = math.cos(zen)
    return np.clip(1 + (sh - flat) * 1.55, 0.42, 1.28)[1:-1, 1:-1]


def draw_lines(img, feats, z, x, y, kind):
    """feats: list of Nx2 float arrays in normalized mercator. Draws onto an RGBA overlay."""
    n = 2.0 ** z
    d = ImageDraw.Draw(img)
    for arr in feats:
        px = (arr[:, 0].astype(np.float64) * n - x) * TILE
        py = (arr[:, 1].astype(np.float64) * n - y) * TILE
        if px.max() < -4 or py.max() < -4 or px.min() > TILE + 4 or py.min() > TILE + 4:
            continue
        pts = list(zip(px.tolist(), py.tolist()))
        if kind == "river":
            d.line(pts, fill=(88, 140, 196, 255), width=3 if z >= 11 else 2, joint="curve")
        elif kind == "stream":
            d.line(pts, fill=(104, 154, 204, 255), width=1 if z < 12 else 2)
        elif kind == "trail":
            d.line(pts, fill=(168, 70, 44, 215), width=2 if z >= 13 else 1)
        elif kind == "protected":
            if len(pts) >= 2:
                d.line(pts, fill=(56, 110, 70, 200), width=2 if z >= 10 else 1)


_font_cache = {}


def font(name, size):
    key = (name, size)
    if key not in _font_cache:
        from PIL import ImageFont
        _font_cache[key] = ImageFont.truetype(G["fonts"][name], size)
    return _font_cache[key]


LABEL_STYLE = {
    # kind: (min zoom, font, size, rank)
    "city": (6, "NotoSans-Bold", 24, 0),
    "town": (9, "NotoSans-Bold", 19, 1),
    "peak": (11, "NotoSans-Italic", 15, 2),
    "village": (11, "NotoSans-Regular", 16, 3),
    "hamlet": (12, "NotoSans-Regular", 14, 4),
}


def draw_labels(img, labels, z, x, y):
    """Place names and peaks baked into the tile. Text only: no roads, no owners."""
    n = 2.0 ** z
    margin = 140
    d = ImageDraw.Draw(img)
    cand = []
    for kind, name, mx, my, ele in labels:
        spec = LABEL_STYLE[kind]
        min_z = spec[0]
        if kind == "peak" and ele and ele > 1000:
            min_z = 10
        if kind == "town" and z < 10 and not name:
            continue
        if z < min_z:
            continue
        px = (mx * n - x) * TILE
        py = (my * n - y) * TILE
        if px < -margin or py < -margin or px > TILE + margin or py > TILE + margin:
            continue
        cand.append((spec[3], -(ele or 0), name, kind, px, py, ele))
    cand.sort()
    taken = []
    for rank, _e, name, kind, px, py, ele in cand:
        spec = LABEL_STYLE[kind]
        text = name
        if kind == "peak" and ele:
            text = f"{name} {int(round(ele * 3.28084)):,} ft"
        f = font(spec[1], spec[2])
        l, t, r, b = d.textbbox((0, 0), text, font=f, stroke_width=2)
        w, h = r - l, b - t
        if kind == "peak":
            box = (px + 8, py - h / 2, px + 8 + w, py + h / 2)
        else:
            box = (px - w / 2, py - h / 2, px + w / 2, py + h / 2)
        pad = 4
        if any(not (box[2] + pad < o[0] or box[0] - pad > o[2] or box[3] + pad < o[1] or box[1] - pad > o[3]) for o in taken):
            continue
        taken.append(box)
        if kind == "peak":
            d.polygon([(px, py - 5), (px - 5, py + 4), (px + 5, py + 4)], fill=(86, 58, 38, 255), outline=(255, 255, 255, 220))
            d.text((box[0] - l, box[1] - t), text, font=f, fill=(78, 56, 40, 255), stroke_width=2, stroke_fill=(255, 255, 255, 215))
        else:
            fill = (30, 30, 34, 255) if kind in ("city", "town") else (52, 52, 56, 255)
            d.text((box[0] - l, box[1] - t), text, font=f, fill=fill, stroke_width=2, stroke_fill=(255, 255, 255, 220))


def render_tile(args):
    z, x, y = args
    region = G["region"]
    feats = G["feats"]
    try:
        elev = elevation_for_tile(z, x, y, region)
        cls = nlcd_classes(z, x, y)
        lat = tile_bounds_lonlat(z, x, y)
        lat = (lat[1] + lat[3]) / 2
        e = elev[1:-1, 1:-1]
        shade = hillshade(elev, z, lat)
        ocean = e < -0.5
        # land cover color
        rgb = np.zeros((TILE, TILE, 3), np.float32)
        # thin developed pixels trace roads, so open them away (keep only blobs)
        dev_idx = CLASS_ORDER.index("dev")
        dev = cls == dev_idx
        if dev.any():
            blob = ndimage.binary_opening(dev, structure=np.ones((7, 7), bool) if z >= 11 else np.ones((5, 5), bool))
            cls = cls.copy()
            cls[dev & ~blob] = CLASS_ORDER.index("grass")
        for k, name in enumerate(CLASS_ORDER):
            m = cls == k
            if m.any():
                rgb[m] = CLASS_COLORS[name]
        water = (cls == CLASS_ORDER.index("water")) | ocean | ((cls == CLASS_ORDER.index("other")) & (e < 3))
        rgb[water] = CLASS_COLORS["water"]
        # slight elevation tint so ridges read lighter and valleys deeper
        t = np.clip((e - 0) / 1400.0, 0, 1)[..., None]
        rgb = rgb * (1 - 0.10 * t) + np.array([236, 228, 206], np.float32) * (0.10 * t)
        rgb = np.where(water[..., None], rgb, rgb * shade[..., None])
        # contours (land only)
        ci = contour_interval(z, region)
        img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
        if ci:
            band = np.floor(e / ci)
            edge = np.zeros(e.shape, bool)
            edge[:, :-1] |= band[:, :-1] != band[:, 1:]
            edge[:-1, :] |= band[:-1, :] != band[1:, :]
            edge &= ~water & (e > 0)
            idx_band = np.floor(e / (ci * 5))
            idx_edge = np.zeros(e.shape, bool)
            idx_edge[:, :-1] |= idx_band[:, :-1] != idx_band[:, 1:]
            idx_edge[:-1, :] |= idx_band[:-1, :] != idx_band[1:, :]
            idx_edge &= ~water & (e > 0)
            idx_edge = ndimage.binary_dilation(idx_edge, structure=np.ones((2, 2), bool)) & ~water
            ov = np.zeros((TILE, TILE, 4), np.uint8)
            ov[edge] = (128, 86, 52, 120)
            ov[idx_edge] = (112, 72, 40, 190)
            img = Image.alpha_composite(img, Image.fromarray(ov, "RGBA"))
        # vector overlays from OSM, culled by zoom
        ov = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
        n = 2.0 ** z
        x0, x1, y0, y1 = x / n, (x + 1) / n, y / n, (y + 1) / n
        pick = {"river": [], "stream": [], "trail": [], "protected": []}
        for cls_name, arr, bb in feats:
            if bb[2] < x0 or bb[0] > x1 or bb[3] < y0 or bb[1] > y1:
                continue
            if cls_name == "stream" and z < 10:
                continue
            if cls_name == "trail" and z < 11:
                continue
            if cls_name == "protected" and z < 8:
                continue
            pick[cls_name].append(arr)
        for kind in ("protected", "stream", "river", "trail"):
            if pick[kind]:
                draw_lines(ov, pick[kind], z, x, y, kind)
        img = Image.alpha_composite(img, ov)
        if G.get("labels"):
            draw_labels(img, G["labels"], z, x, y)
        img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=G["quality"], method=4)
        return z, x, y, buf.getvalue()
    except Exception as ex:
        return z, x, y, f"ERR {type(ex).__name__}: {ex}"


def write_mbtiles(path, results, meta):
    if os.path.exists(path):
        os.remove(path)
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
    db.execute("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
    db.execute("CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)")
    db.executemany("INSERT INTO metadata VALUES (?,?)", [(k, str(v)) for k, v in meta.items()])
    for z, x, y, data in results:
        db.execute("INSERT OR REPLACE INTO tiles VALUES (?,?,?,?)", (z, x, (2 ** z - 1) - y, data))
    db.commit()
    db.execute("VACUUM")
    db.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", required=True)
    ap.add_argument("--data", default=os.environ.get("YEHSA_PACK_DATA", "/workspace/yehsa-r3-data"))
    ap.add_argument("--out", default=os.environ.get("YEHSA_PACK_OUT", "/workspace/yehsa-r3-packs"))
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--quality", type=int, default=68)
    ap.add_argument("--max-tiles", type=int, default=0, help="debug: render only the first N tiles")
    ap.add_argument("--zooms", default="", help="debug: comma list of zooms to render")
    args = ap.parse_args()

    with open(os.path.join(HERE, "regions.json")) as f:
        regions = {r["id"]: r for r in json.load(f)["regions"]}
    region = regions[args.region]
    os.makedirs(args.out, exist_ok=True)
    os.makedirs(args.data, exist_ok=True)

    poly = state_polygon(args.data, region["state"])
    tiles = select_tiles(region, poly)
    if args.zooms:
        keep = {int(v) for v in args.zooms.split(",")}
        tiles = [t for t in tiles if t[0] in keep]
    if args.max_tiles:
        step = max(1, len(tiles) // args.max_tiles)
        tiles = tiles[::step][:args.max_tiles]
    print(f"{region['id']}: {len(tiles)} tiles", flush=True)

    dem_need = needed_dem_tiles(tiles, region)
    print(f"  downloading {len(dem_need)} terrain tiles", flush=True)
    download_dem(dem_need, args.data)

    pbf = os.path.join(args.data, "pbf", f"{region['pbf']}.osm.pbf")
    if not os.path.exists(pbf):
        fetch(f"https://download.geofabrik.de/north-america/us/{region['pbf']}-latest.osm.pbf", pbf)
    print("  reading OSM waterways, trails, protected areas", flush=True)
    cache = os.path.join(args.data, f"osm2-{region['pbf']}.pkl")
    feats, labels = osm_features(pbf, cache)
    w, s, e, n = region["bbox"]
    bx0, by1 = merc_norm(w, s)
    bx1, by0 = merc_norm(e, n)
    sel = []
    for cls_name, arr in feats:
        bb = (float(arr[:, 0].min()), float(arr[:, 1].min()), float(arr[:, 0].max()), float(arr[:, 1].max()))
        if bb[2] < bx0 or bb[0] > bx1 or bb[3] < by0 or bb[1] > by1:
            continue
        sel.append((cls_name, arr, bb))
    print(f"  {len(sel)} vector features in region", flush=True)

    fonts = {}
    for name in ("NotoSans-Regular", "NotoSans-Bold", "NotoSans-Italic"):
        fonts[name] = fetch(f"https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSans/hinted/ttf/{name}.ttf",
                            os.path.join(args.data, "fonts", f"{name}.ttf"))
    sel_labels = [lab for lab in labels if bx0 - 0.01 <= lab[2] <= bx1 + 0.01 and by0 - 0.01 <= lab[3] <= by1 + 0.01]
    print(f"  {len(sel_labels)} place and peak labels", flush=True)
    G.update(data=args.data, region=region, feats=sel, labels=sel_labels, fonts=fonts, quality=args.quality)
    ctx = mp.get_context("fork")
    results = []
    t0 = time.time()
    errors = 0
    with ctx.Pool(args.workers) as pool:
        for i, r in enumerate(pool.imap_unordered(render_tile, tiles, chunksize=4), 1):
            if isinstance(r[3], str):
                errors += 1
                print("  tile error", r, flush=True)
                continue
            results.append(r)
            if i % 100 == 0:
                print(f"  rendered {i}/{len(tiles)} ({time.time() - t0:.0f}s)", flush=True)
    if errors > max(3, len(tiles) // 100):
        raise SystemExit(f"too many tile errors: {errors}")

    built = datetime.date.today().isoformat()
    south, west, north, east = region["bbox"][1], region["bbox"][0], region["bbox"][3], region["bbox"][2]
    attribution = ("Elevation: AWS Terrain Tiles (USGS 3DEP, SRTM, GMTED, ETOPO1; public domain). "
                   "Land cover: NLCD 2021 (USGS/MRLC, public domain). "
                   "Water, trails, protected areas: (c) OpenStreetMap contributors, ODbL 1.0.")
    meta = {
        "name": region["name"], "format": "webp", "type": "baselayer", "version": "1",
        "bounds": f"{west},{south},{east},{north}", "minzoom": min(t[0] for t in tiles), "maxzoom": max(t[0] for t in tiles),
        "description": "Yehsa offline terrain pack. No road layer. No parcel or owner layer.",
        "attribution": attribution, "license": "ODbL 1.0 (OpenStreetMap parts); public domain (terrain, land cover)",
        "built": built, "tile_px": TILE, "yehsa_pack_id": region["id"],
    }
    out = os.path.join(args.out, f"{region['id']}.mbtiles")
    write_mbtiles(out, results, meta)
    size = os.path.getsize(out)
    sha = hashlib.sha256()
    with open(out, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            sha.update(chunk)
    info = {
        "id": region["id"], "name": region["name"], "region": region["region"], "file": f"{region['id']}.mbtiles",
        "bytes": size, "sha256": sha.hexdigest(), "tiles": len(results),
        "bounds": {"west": west, "south": south, "east": east, "north": north},
        "minZoom": meta["minzoom"], "maxZoom": meta["maxzoom"], "tilePx": TILE, "built": built,
        "license": meta["license"], "attribution": attribution,
        "sources": ["AWS Terrain Tiles (Terrarium)", "NLCD 2021 Land Cover", "OpenStreetMap via Geofabrik", "Natural Earth admin-1 (state outline)"],
    }
    with open(os.path.join(args.out, f"{region['id']}.json"), "w") as f:
        json.dump(info, f, indent=1)
    print(f"  wrote {out} {size / 1e6:.1f} MB, {len(results)} tiles", flush=True)


if __name__ == "__main__":
    main()
