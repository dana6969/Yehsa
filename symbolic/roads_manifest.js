// Written by tools/roads/shard.py. The bundled offline road layer (OpenStreetMap, ODbL 1.0).
// A tile z/x/y lives in shard (x + y) % shards.length.
export const ROADS_MANIFEST = {
  "version": "b6e6f5f9adaa",
  "built": "2026-11-24",
  "osmDate": "2026-11-23",
  "states": [
    "rhode-island"
  ],
  "minZoom": 6,
  "maxZoom": 14,
  "bounds": {
    "west": -71.861001,
    "south": 41.148857,
    "east": -71.102964,
    "north": 42.035139
  },
  "shards": [
    {
      "file": "roads-0.mbtiles",
      "bytes": 4190208,
      "md5": "7136d34568dce50de414b49c8c6592f9"
    }
  ],
  "names": {
    "file": "road-names.db",
    "rows": 23314,
    "bytes": 1892352,
    "md5": "67b1d86770522f9aa17ac4ac2f141c43"
  },
  "layer": "roads",
  "attribution": "Roads: \u00a9 OpenStreetMap contributors, ODbL 1.0",
  "license": "Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/"
};

export default ROADS_MANIFEST;
