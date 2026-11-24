#!/usr/bin/env bash
# Builds the bundled offline road layer: OpenStreetMap roads (with names) for every pack state,
# as vector MBTiles shards in assets/roads/ (each under 45 MB), plus road-names.db for search.
#   tools/roads/build_roads.sh                    all states below
#   tools/roads/build_roads.sh rhode-island       only these Geofabrik extracts
# Needs osmium-tool, tippecanoe (felt/tippecanoe) and python3. Inputs are cached in $YEHSA_ROAD_DATA.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DATA="${YEHSA_ROAD_DATA:-$HOME/yehsa-roads}"
OUT="$DATA/work/roads-merged.mbtiles"
STATES=(rhode-island maine new-hampshire vermont massachusetts connecticut new-york pennsylvania michigan wisconsin minnesota colorado montana idaho wyoming)
[ "$#" -gt 0 ] && STATES=("$@")
mkdir -p "$DATA/pbf" "$DATA/work"
NAMES="$DATA/work/names.tsv"
: > "$NAMES"
LAYERS=()
for s in "${STATES[@]}"; do
  pbf="$DATA/pbf/$s-latest.osm.pbf"
  [ -f "$pbf" ] || curl -sSfL -o "$pbf" "https://download.geofabrik.de/north-america/us/$s-latest.osm.pbf"
  roads="$DATA/work/$s-roads.osm.pbf"
  osmium tags-filter -O -o "$roads" "$pbf" \
    w/highway=motorway,trunk,primary,secondary,tertiary,unclassified,residential,living_street,road,track,service,motorway_link,trunk_link,primary_link,secondary_link,tertiary_link
  osmium export -O -f geojsonseq -o "$DATA/work/$s.raw.geojsons" --geometry-types=linestring "$roads"
  python3 "$HERE/roads_filter.py" "$s" "$NAMES" < "$DATA/work/$s.raw.geojsons" > "$DATA/work/$s.geojsons"
  rm -f "$DATA/work/$s.raw.geojsons"
  LAYERS+=("$DATA/work/$s.geojsons")
  echo "roads: $s $(wc -l < "$DATA/work/$s.geojsons") features"
done
rm -f "$OUT"
# Lines only, no attributes beyond class/name/ref. z6-z14; the map overzooms z14 for closer views.
tippecanoe -o "$OUT" -Z6 -z14 --read-parallel -P \
  --simplification=4 --drop-densest-as-needed \
  --no-tile-size-limit --coalesce-smallest-as-needed \
  -n "Yehsa roads" -A "© OpenStreetMap contributors (ODbL 1.0)" \
  --force -q "${LAYERS[@]}"
OSM_DATE="$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$DATA/pbf/${STATES[0]}-latest.osm.pbf" | cut -c1-10)" \
  python3 "$HERE/shard.py" "$OUT" "$NAMES" "$ROOT" "$(IFS=,; echo "${STATES[*]}")"
ls -la "$ROOT/assets/roads"
