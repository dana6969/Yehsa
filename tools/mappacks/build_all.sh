#!/usr/bin/env bash
# Builds every pack in regions.json (or the ones named), one after another. Safe to re-run:
# a pack that already has its .json is skipped, and downloaded inputs are cached in $DATA.
#   tools/mappacks/build_all.sh                 all regions
#   tools/mappacks/build_all.sh ri nh           only these
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="${YEHSA_PACK_DATA:-$HOME/yehsa-pack-data}"
OUT="${YEHSA_PACK_OUT:-$HOME/yehsa-packs}"
PY="${PYTHON:-python3}"
mkdir -p "$DATA" "$OUT"
if [ "$#" -eq 0 ]; then
  set -- $("$PY" -c "import json;print(' '.join(r['id'] for r in json.load(open('$HERE/regions.json'))['regions']))")
fi
for r in "$@"; do
  if [ -f "$OUT/$r.json" ]; then echo "skip $r (already built)"; continue; fi
  echo "=== $r $(date)"
  "$PY" "$HERE/build_pack.py" --region "$r" --data "$DATA" --out "$OUT" --workers "${WORKERS:-6}"
done
node "$HERE/make_manifest.mjs" "$OUT" "${RELEASE_TAG:-map-packs-2026-11}"
