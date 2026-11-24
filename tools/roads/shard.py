#!/usr/bin/env python3
"""Splits the merged roads MBTiles into shards of under ~45 MB each (GitHub rejects files over
100 MB and warns over 50 MB), and moves the road names into their own small SQLite file.

A tile lives in shard (x + y) % N. The phone computes the same number, so it opens one file per tile.
Writes assets/roads/roads-<k>.mbtiles, assets/roads/road-names.db and symbolic/roads_manifest.js,
plus src/phone/roads_assets.native.js with one require() per file.
"""
import datetime
import hashlib
import json
import math
import os
import sqlite3
import sys

merged, names_tsv, root = sys.argv[1], sys.argv[2], sys.argv[3]
states = sys.argv[4].split(",")
limit = 45 * 1024 * 1024
src = sqlite3.connect(merged)
total = src.execute("SELECT SUM(LENGTH(tile_data)) FROM tiles").fetchone()[0]
n = max(1, math.ceil(total * 1.08 / limit))
meta = dict(src.execute("SELECT name, value FROM metadata").fetchall())
out_dir = os.path.join(root, "assets", "roads")
os.makedirs(out_dir, exist_ok=True)
for f in os.listdir(out_dir):
    if f.startswith("roads-") and f.endswith(".mbtiles") or f == "road-names.db":
        os.remove(os.path.join(out_dir, f))
files = []
for k in range(n):
    path = os.path.join(out_dir, f"roads-{k}.mbtiles")
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
    db.execute("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
    db.executemany("INSERT INTO metadata VALUES (?, ?)", [(a, b) for a, b in meta.items() if a != "json"] + [("json", meta.get("json", "")), ("yehsa_shard", f"{k}/{n}")])
    files.append(db)
for z, x, row, data in src.execute("SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles"):
    y = (1 << z) - 1 - row
    files[(x + y) % n].execute("INSERT INTO tiles VALUES (?, ?, ?, ?)", (z, x, row, data))
shards = []
for k, db in enumerate(files):
    db.execute("CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)")
    db.commit()
    db.execute("VACUUM")
    db.close()
    path = os.path.join(out_dir, f"roads-{k}.mbtiles")
    shards.append({"file": f"roads-{k}.mbtiles", "bytes": os.path.getsize(path), "md5": hashlib.md5(open(path, "rb").read()).hexdigest()})

names_path = os.path.join(out_dir, "road-names.db")
nd = sqlite3.connect(names_path)
nd.execute("CREATE TABLE road_names (name TEXT, state TEXT, lon REAL, lat REAL, cls TEXT)")
rows = []
with open(names_tsv, encoding="utf-8") as fh:
    for line in fh:
        parts = line.rstrip("\n").split("\t")
        if len(parts) == 5:
            rows.append((parts[0], parts[1], round(float(parts[2]), 5), round(float(parts[3]), 5), parts[4]))
nd.executemany("INSERT INTO road_names VALUES (?, ?, ?, ?, ?)", rows)
# LIKE 'prefix%' can use this index because it is NOCASE, the same as LIKE itself.
nd.execute("CREATE INDEX road_names_name ON road_names (name COLLATE NOCASE)")
nd.commit()
nd.execute("VACUUM")
nd.close()

bounds = [float(v) for v in meta.get("bounds", "-180,-85,180,85").split(",")]
manifest = {
    "version": hashlib.md5("".join(s["md5"] for s in shards).encode()).hexdigest()[:12],
    "built": datetime.date.today().isoformat(),
    "osmDate": os.environ.get("OSM_DATE", datetime.date.today().isoformat()),
    "states": states,
    "minZoom": int(meta.get("minzoom", 6)),
    "maxZoom": int(meta.get("maxzoom", 14)),
    "bounds": {"west": bounds[0], "south": bounds[1], "east": bounds[2], "north": bounds[3]},
    "shards": shards,
    "names": {"file": "road-names.db", "rows": len(rows), "bytes": os.path.getsize(names_path), "md5": hashlib.md5(open(names_path, "rb").read()).hexdigest()},
    "layer": "roads",
    "attribution": "Roads: © OpenStreetMap contributors, ODbL 1.0",
    "license": "Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/",
}
with open(os.path.join(root, "symbolic", "roads_manifest.js"), "w") as fh:
    fh.write("// Written by tools/roads/shard.py. The bundled offline road layer (OpenStreetMap, ODbL 1.0).\n")
    fh.write("// A tile z/x/y lives in shard (x + y) % shards.length.\n")
    fh.write("export const ROADS_MANIFEST = " + json.dumps(manifest, indent=2) + ";\n\nexport default ROADS_MANIFEST;\n")
with open(os.path.join(root, "src", "phone", "roads_assets.native.js"), "w") as fh:
    fh.write("// Written by tools/roads/shard.py. One require() per bundled road file, in shard order.\n")
    fh.write("export const ROAD_SHARD_ASSETS = [\n")
    for s in shards:
        fh.write(f'  require("../../assets/roads/{s["file"]}"),\n')
    fh.write("];\n")
    fh.write('export const ROAD_NAMES_ASSET = require("../../assets/roads/road-names.db");\n')
print(json.dumps({"shards": [(s["file"], s["bytes"]) for s in shards], "names_rows": len(rows), "names_bytes": manifest["names"]["bytes"]}))
