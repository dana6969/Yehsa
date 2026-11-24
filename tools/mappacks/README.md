# Yehsa map packs

Reproducible build of the offline map packs the app downloads. Each pack is one raster MBTiles
file (WebP tiles, 512 px, shown at 256 px size so they stay sharp on a phone). Nothing is
drawn from a road network, and there is no parcel or owner data.

## What is in a pack

| Layer | Source | License |
| --- | --- | --- |
| Terrain: hillshade, contour lines, elevation color | AWS Terrain Tiles (Terrarium): USGS 3DEP 10 m in the US, SRTM, GMTED, ETOPO1 | Public domain inputs |
| Land cover: forest (deciduous, evergreen, mixed), shrub, grass, farmland, wetland, barren | NLCD 2021 Land Cover, USGS / MRLC (WMS) | Public domain |
| Water: lakes, ponds, ocean, rivers, streams, canals | NLCD open water, elevation below sea level, OpenStreetMap waterways | NLCD public domain; OSM ODbL 1.0 |
| Trails (zoom 11 and up): path, bridleway, footway; no sidewalks or crossings | OpenStreetMap via Geofabrik | ODbL 1.0, © OpenStreetMap contributors |
| Public land outlines: protected areas, national parks, nature reserves | OpenStreetMap via Geofabrik | ODbL 1.0 |
| State outline, place names, peak names and heights | Natural Earth admin-1; OpenStreetMap | Public domain; ODbL 1.0 |

Roads: **not drawn in the packs.** The app draws roads from the built-in OpenStreetMap road graphs
instead (see `docs/map-layers.md`). NLCD "developed" pixels trace roads, so a morphological opening removes thin
developed lines before the land cover is colored. Hunting units (GMU / WMD) are state agency
data, not in these sources, so they are not drawn.

The license text shown under "About this data" for each pack comes from `license` and
`attribution` in `symbolic/pack_manifest.js`, which `make_manifest.mjs` writes from each pack's
own `.json`.

## Build

```
python3 -m venv .venv && . .venv/bin/activate
pip install -r tools/mappacks/requirements.txt
tools/mappacks/build_all.sh              # all regions in regions.json
tools/mappacks/build_all.sh ri me-southern
```

Needs about 1 GB of disk for cached inputs per large state, and 5 to 10 minutes per pack on 6 cores.
Inputs are fetched on first use and cached in `$YEHSA_PACK_DATA` (default `~/yehsa-pack-data`):
Geofabrik state extracts, Terrarium tiles, NLCD tiles, Natural Earth admin-1, Noto Sans fonts.
Output goes to `$YEHSA_PACK_OUT` (default `~/yehsa-packs`): `<id>.mbtiles` and `<id>.json`.

`--max-tiles N` and `--zooms 8,9` render a small preview for checking style changes.

## Publish

The app downloads from the `map-packs-YYYY-MM` release of `dana6969/Yehsa` (the URL base is in
`symbolic/pack_manifest.js`). Create it as a draft, upload, check, then publish:

```
gh release create map-packs-2026-11 --draft --title "Offline map packs 2026-11" \
  --notes-file tools/mappacks/RELEASE_NOTES.md ~/yehsa-packs/*.mbtiles
```

Do not rename the files: the manifest lists them by `file` and checks `md5` after download.

## Update a pack

Rebuild it, run `make_manifest.mjs` (the `built` date changes), upload under a new tag when the
file changes, and ship the manifest in an app update. A phone that has an older `built` date shows
"A newer version is ready" and an Update button on that pack's card.
