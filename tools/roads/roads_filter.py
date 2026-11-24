#!/usr/bin/env python3
"""Reads `osmium export -f geojsonseq` lines on stdin and writes cleaned road features for
tippecanoe on stdout. Keeps only the road class, the name and the ref. Nothing else from OSM
(no addresses, no people, no access notes) goes into the app.

Also appends one row per named road per ~2 km cell to a names TSV (for road search).
"""
import json
import sys

CLASS = {
    "motorway": ("motorway", 6), "trunk": ("motorway", 6),
    "motorway_link": ("motorway", 10), "trunk_link": ("motorway", 10),
    "primary": ("primary", 7), "primary_link": ("primary", 11),
    "secondary": ("secondary", 9), "secondary_link": ("secondary", 12),
    "tertiary": ("tertiary", 10), "tertiary_link": ("tertiary", 12),
    "unclassified": ("minor", 12), "residential": ("minor", 12),
    "living_street": ("minor", 13), "road": ("minor", 12),
    "track": ("track", 12),
    "service": ("service", 14),
}
SKIP_SERVICE = {"driveway", "parking_aisle", "drive-through", "emergency_access"}

def main():
    state = sys.argv[1]
    names_path = sys.argv[2]
    seen = set()
    with open(names_path, "a", encoding="utf-8") as names:
        for line in sys.stdin:
            line = line.strip().lstrip("\x1e")
            if not line:
                continue
            try:
                feat = json.loads(line)
            except ValueError:
                continue
            geom = feat.get("geometry") or {}
            if geom.get("type") not in ("LineString", "MultiLineString"):
                continue
            tags = feat.get("properties") or {}
            hw = tags.get("highway")
            if hw not in CLASS:
                continue
            if hw == "service" and tags.get("service") in SKIP_SERVICE:
                continue
            if tags.get("area") == "yes":
                continue
            cls, minzoom = CLASS[hw]
            props = {"c": cls}
            name = (tags.get("name") or "").strip()
            ref = (tags.get("ref") or "").strip()
            if name:
                props["n"] = name[:80]
            if ref:
                props["r"] = ref[:40]
            if hw == "service" and not name:
                continue
            out = {"type": "Feature", "geometry": geom, "properties": props, "tippecanoe": {"minzoom": minzoom, "layer": "roads"}}
            sys.stdout.write(json.dumps(out, separators=(",", ":")) + "\n")
            label = name or ref
            if label:
                coords = geom["coordinates"]
                if geom["type"] == "MultiLineString":
                    coords = coords[0]
                mid = coords[len(coords) // 2]
                key = (label.lower(), round(mid[0] / 0.05), round(mid[1] / 0.04))
                if key in seen:
                    continue
                seen.add(key)
                names.write(f"{label}\t{state}\t{mid[0]:.5f}\t{mid[1]:.5f}\t{cls}\n")

if __name__ == "__main__":
    main()
