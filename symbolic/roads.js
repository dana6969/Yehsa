// The built-in offline road and street layer: OpenStreetMap roads with names, bundled in the app
// as vector MBTiles shards (see tools/roads/ and docs/map-layers.md). Pure: no files, no network.
// The phone side (src/phone/roads_store.native.js) installs and opens the shards; the loopback
// tile server serves /roads/{z}/{x}/{y} and /glyphs/{fontstack}/{range}.pbf from them.

import ROADS_MANIFEST from "./roads_manifest.js";

export const ROADS_ATTRIBUTION = "Roads and street names: © OpenStreetMap contributors, ODbL 1.0";
export const ROAD_FONT = "Noto Sans Regular";
// Glyph ranges bundled with the app (Latin, Latin Extended, punctuation). Others get an empty range.
export const GLYPH_RANGES = ["0-255", "256-511", "8192-8447"];

const STATE_NAMES = {
  "rhode-island": "Rhode Island", maine: "Maine", "new-hampshire": "New Hampshire", vermont: "Vermont",
  massachusetts: "Massachusetts", connecticut: "Connecticut", "new-york": "New York", pennsylvania: "Pennsylvania",
  michigan: "Michigan", wisconsin: "Wisconsin", minnesota: "Minnesota", colorado: "Colorado",
  montana: "Montana", idaho: "Idaho", wyoming: "Wyoming"
};

export function stateLabel(id) {
  return STATE_NAMES[id] || String(id || "");
}

export function roadsCoverageText(manifest = ROADS_MANIFEST) {
  const names = (manifest?.states || []).map(stateLabel);
  if (!names.length) return "No road layer in this build.";
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return `Roads and street names for ${list}, built in and offline. OpenStreetMap data from ${manifest.osmDate}. Not every logging road or gate is mapped; check on the ground.`;
}

// Which shard file holds tile z/x/y. Same rule as tools/roads/shard.py.
export function roadShardFor(x, y, count) {
  const n = Math.max(1, count | 0);
  return (((x + y) % n) + n) % n;
}

// Is this tile inside the road layer at all (zoom and bounds)? Saves a file read for open ocean.
export function roadTileWanted(z, x, y, manifest = ROADS_MANIFEST) {
  if (!manifest || z < manifest.minZoom || z > manifest.maxZoom) return false;
  const b = manifest.bounds;
  if (!b) return true;
  const n = 2 ** z;
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const lat = (t) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * t) / n))) * 180) / Math.PI;
  const north = lat(y);
  const south = lat(y + 1);
  return east >= b.west && west <= b.east && north >= b.south && south <= b.north;
}

// Colors per map look. Roads sit above the terrain picture and below marks and the cone.
const ROAD_COLORS = {
  standard: { motorway: "#c7672a", primary: "#d08a2e", secondary: "#c9a23a", minor: "#fbf7ea", track: "#7a5a2e", service: "#e9e3d0", casing: "#5e4a2c", text: "#2b2418", halo: "#f7f3e6" },
  simple: { motorway: "#b04a12", primary: "#b8711a", secondary: "#a9882a", minor: "#ffffff", track: "#6b4310", service: "#f2eee2", casing: "#3d3326", text: "#1d1a14", halo: "#ffffff" },
  night: { motorway: "#a9876a", primary: "#a9876a", secondary: "#8f7559", minor: "#6e604c", track: "#6e604c", service: "#5c5040", casing: "#1a1610", text: "#c9b79a", halo: "#141210" },
  nightRed: { motorway: "#c97a62", primary: "#b8664f", secondary: "#a0563f", minor: "#7a4a3e", track: "#7a4a3e", service: "#5e3a30", casing: "#1e0c0a", text: "#d98c74", halo: "#1a0a08" },
  nightAmber: { motorway: "#d9a35a", primary: "#c89448", secondary: "#b0803a", minor: "#7a6030", track: "#7a6030", service: "#5e4a26", casing: "#1e160a", text: "#e0b070", halo: "#1a1208" }
};

export function roadColors({ style = "standard", mode = "field", night = "red" } = {}) {
  if (mode === "night" || style === "night") return night === "amber" ? ROAD_COLORS.nightAmber : ROAD_COLORS.nightRed;
  return style === "simple" ? ROAD_COLORS.simple : ROAD_COLORS.standard;
}

// MapLibre layer specs (plain data so node tests can check them). `c` is the road class,
// `n` the name and `r` the route number, as written by tools/roads/roads_filter.py.
export function roadLayerSpecs(look = {}) {
  const colors = roadColors(look);
  const byClass = ["match", ["get", "c"],
    "motorway", colors.motorway,
    "primary", colors.primary,
    "secondary", colors.secondary,
    "track", colors.track,
    "service", colors.service,
    colors.minor];
  const width = ["interpolate", ["linear"], ["zoom"],
    6, ["match", ["get", "c"], "motorway", 1.2, "primary", 0.8, 0.4],
    12, ["match", ["get", "c"], "motorway", 3.5, "primary", 3, "secondary", 2.5, "tertiary", 2, "track", 1.2, 1.6],
    16, ["match", ["get", "c"], "motorway", 9, "primary", 8, "secondary", 7, "tertiary", 6, "track", 2.5, "service", 3, 5]];
  return {
    casing: { lineColor: colors.casing, lineOpacity: 0.55, lineWidth: ["interpolate", ["linear"], ["zoom"], 10, 0, 12, 2.6, 16, 9.5], lineCap: "round", lineJoin: "round" },
    line: { lineColor: byClass, lineWidth: width, lineCap: "round", lineJoin: "round" },
    track: { lineDasharray: [2, 1.5] },
    label: {
      textField: ["coalesce", ["get", "n"], ["get", "r"]],
      textFont: [ROAD_FONT],
      textSize: ["interpolate", ["linear"], ["zoom"], 11, 10, 16, 13],
      symbolPlacement: "line",
      textColor: colors.text,
      textHaloColor: colors.halo,
      textHaloWidth: 1.4,
      textMaxAngle: 30,
      textPadding: 2
    },
    labelMinZoom: 11
  };
}

// What the map needs to draw roads, or null when they are off or not installed yet.
export function roadsLayer({ on = true, ready = false, port = null, look = {}, manifest = ROADS_MANIFEST } = {}) {
  if (!on || !ready || !port || !manifest?.shards?.length) return null;
  return {
    id: "roads",
    template: `http://127.0.0.1:${port}/roads/{z}/{x}/{y}.pbf`,
    glyphs: `http://127.0.0.1:${port}/glyphs/{fontstack}/{range}.pbf`,
    minZoom: manifest.minZoom,
    maxZoom: manifest.maxZoom,
    sourceLayer: manifest.layer || "roads",
    specs: roadLayerSpecs(look),
    attribution: ROADS_ATTRIBUTION
  };
}

// ------------------------------------------------------------------ search by name

// One SQL query for road names. Prefix match first (uses the NOCASE index); `anywhere` also
// finds a word inside the name ("Ridge" finds "Old Ridge Road").
export function roadSearchQuery(text, { anywhere = false, limit = 40 } = {}) {
  const clean = String(text || "").replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length < 2) return null;
  const pattern = anywhere ? `%${clean}%` : `${clean}%`;
  return {
    sql: "SELECT name, state, lon, lat, cls FROM road_names WHERE name LIKE ? ESCAPE '\\' LIMIT ?",
    args: [pattern, limit]
  };
}

function km(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Rows from the query, nearest first when we know where you are, each once per ~4 km.
export function rankRoadHits(rows, { near = null, limit = 12 } = {}) {
  const seen = new Set();
  const hits = [];
  for (const row of rows || []) {
    const point = { latitude: Number(row.lat), longitude: Number(row.lon) };
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue;
    const key = `${String(row.name).toLowerCase()}|${Math.round(point.latitude * 25)}|${Math.round(point.longitude * 20)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const distanceKm = near ? km(near, point) : null;
    hits.push({ name: row.name, state: stateLabel(row.state), cls: row.cls, ...point, distanceKm });
  }
  hits.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.name.localeCompare(b.name));
  return hits.slice(0, limit);
}

export function roadHitText(hit) {
  const where = hit.distanceKm == null ? hit.state : `${hit.state}, ${hit.distanceKm < 10 ? hit.distanceKm.toFixed(1) : Math.round(hit.distanceKm)} km away`;
  return `${hit.name} · ${where}`;
}

// A small box around a hit, for "Show on map".
export function roadHitBox(hit, halfKm = 0.6) {
  const dLat = halfKm / 111;
  const dLon = halfKm / (111 * Math.max(0.2, Math.cos((hit.latitude * Math.PI) / 180)));
  return { west: hit.longitude - dLon, east: hit.longitude + dLon, south: hit.latitude - dLat, north: hit.latitude + dLat };
}

// ------------------------------------------------------------------ glyphs

// An empty glyph range for a font stack (a valid PBF with no glyphs), so text in a script we
// do not ship is skipped quietly instead of failing the whole label layer.
export function emptyGlyphRange(fontstack, range) {
  const enc = (s) => Array.from(new TextEncoder().encode(String(s)));
  const field = (tag, bytes) => [tag, ...varint(bytes.length), ...bytes];
  const inner = [...field(0x0a, enc(fontstack)), ...field(0x12, enc(range))];
  return new Uint8Array(field(0x0a, inner));
}

function varint(n) {
  const out = [];
  let v = n >>> 0;
  while (v > 127) {
    out.push((v & 127) | 128);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

export function glyphRangeOk(range) {
  const m = /^(\d+)-(\d+)$/.exec(String(range || ""));
  if (!m) return false;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  return lo % 256 === 0 && hi === lo + 255 && hi <= 65535;
}

export { ROADS_MANIFEST };
