#!/bin/bash
# Build the offline road graphs (.yrg) and place indexes (.ypl) for every map-pack state.
# Needs osmium-tool and pyosmium (tools/mappacks/requirements.txt) and Geofabrik state extracts in $PBF.
# Usage: PBF=/path/to/pbf OUT=assets/routing PY=python3 tools/routing/build_all.sh
set -euo pipefail
PBF=${PBF:-/workspace/yehsa-r3-data/pbf}
OUT=${OUT:-assets/routing}
WORK=${WORK:-/tmp/yehsa-routing}
PY=${PY:-python3}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT" "$WORK"
declare -A CODE=([maine]=me [rhode-island]=ri [new-hampshire]=nh [vermont]=vt [massachusetts]=ma [connecticut]=ct
  [new-york]=ny [pennsylvania]=pa [michigan]=mi [wisconsin]=wi [minnesota]=mn [colorado]=co [montana]=mt [idaho]=id [wyoming]=wy)
one() {
  local s=$1 c=$2
  osmium tags-filter -O -o "$WORK/$s-roads.pbf" "$PBF/$s.osm.pbf" \
    w/highway=motorway,motorway_link,trunk,trunk_link,primary,primary_link,secondary,secondary_link,tertiary,tertiary_link,unclassified,residential,living_street,track,path,bridleway,service,footway
  osmium tags-filter -O -o "$WORK/$s-places.pbf" "$PBF/$s.osm.pbf" \
    n/place=city,town,village,hamlet,suburb,neighbourhood,locality \
    nw/amenity=fuel,hospital,clinic,pharmacy,police,fire_station,ranger_station,townhall,post_office,library,school,restaurant,cafe,fast_food,bank,shelter,doctors \
    nw/shop=supermarket,convenience,hardware,outdoor,sports,general,farm,department_store,doityourself \
    nw/tourism=camp_site,caravan_site,hotel,motel,viewpoint,alpine_hut,wilderness_hut,picnic_site,attraction,museum \
    nw/natural=peak,water,spring,bay nw/highway=trailhead nw/leisure=park,nature_reserve nw/boundary=protected_area
  "$PY" "$HERE/build_graph.py" "$WORK/$s-roads.pbf" "$WORK/$s-places.pbf" "$OUT/$c" 2> "$WORK/$c.log"
  echo "$c $(tail -n +2 "$WORK/$c.log" | head -1)"
}
export -f one; export WORK OUT PY HERE
for s in "${!CODE[@]}"; do echo "$s ${CODE[$s]}"; done | xargs -P 4 -n 2 bash -c 'one "$0" "$1"'
