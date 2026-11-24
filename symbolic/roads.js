// The road and street layer on the Map and Hunt map. Drawn from the offline OpenStreetMap road
// graphs that routing already ships (assets/routing/<state>.yrg, read with roadsInBox), so the app
// carries one copy of the roads. Pure: no files, no network. Road names are drawn with a small
// bundled font served by the loopback tile server at /glyphs/{fontstack}/{range}.pbf.

import { GLYPH_BASE64 } from "./road_glyphs.js";

export const ROADS_ATTRIBUTION = "Roads and street names: © OpenStreetMap contributors, ODbL 1.0";
export const ROAD_FONT = "Noto Sans Regular";
// Glyph ranges bundled with the app (Latin and punctuation). Others get an empty range.
export const GLYPH_RANGES = Object.keys(GLYPH_BASE64);
// Below this zoom the packs' own picture is enough; roads would be too many to read from the graph.
export const ROADS_MIN_ZOOM = 9;

// Road class numbers in the routing graph (symbolic/routing/graph_format.js CLASS_NAMES) -> drawing class.
const GRAPH_CLASS = ["motorway", "motorway", "primary", "secondary", "tertiary", "minor", "minor", "service", "track"];

// Highest graph class to read at a zoom: main roads when zoomed out, every street and track close in.
export function roadMaxClassForZoom(zoom) {
  if (!(zoom >= ROADS_MIN_ZOOM)) return -1;
  if (zoom < 10) return 2;
  if (zoom < 11.5) return 3;
  if (zoom < 12.5) return 4;
  if (zoom < 13.5) return 6;
  return 8;
}

// Most lines handed to the map at once (bigger roads kept first), so a wide view stays smooth.
export const ROAD_LINE_CAP = 12000;
const r5 = (n) => Math.round(n * 1e5) / 1e5;

// roadsInBox() GeoJSON -> the drawing's properties: c (class), n (name). Paths are left to the packs.
export function roadLinesFromGraph(collections, { cap = ROAD_LINE_CAP } = {}) {
  const features = [];
  const seen = new Set();
  for (const fc of collections || []) {
    for (const f of fc?.features || []) {
      const cls = f?.properties?.cls;
      const c = GRAPH_CLASS[cls];
      if (!c || f.geometry?.type !== "LineString") continue;
      const a = f.geometry.coordinates[0];
      const b = f.geometry.coordinates.at(-1);
      const key = `${a[0]},${a[1]},${b[0]},${b[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const props = { c };
      if (f.properties.name) props.n = f.properties.name;
      features.push({ cls, f: { type: "Feature", properties: props, geometry: { type: "LineString", coordinates: f.geometry.coordinates.map((p) => [r5(p[0]), r5(p[1])]) } } });
    }
  }
  if (features.length > cap) features.sort((x, y) => x.cls - y.cls);
  return { type: "FeatureCollection", features: features.slice(0, cap).map((x) => x.f) };
}

// Pads the view so a small pan does not need a new read.
export function padBox(box, fraction = 0.25) {
  const w = (box.east - box.west) * fraction;
  const h = (box.north - box.south) * fraction;
  return { west: box.west - w, east: box.east + w, south: box.south - h, north: box.north + h };
}

export function boxInside(inner, outer) {
  return Boolean(inner && outer && inner.west >= outer.west && inner.east <= outer.east && inner.south >= outer.south && inner.north <= outer.north);
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

export function glyphsUrl(port) {
  return port ? `http://127.0.0.1:${port}/glyphs/{fontstack}/{range}.pbf` : null;
}

// What the map needs to draw roads, or null when they are off. shape: the GeoJSON lines on screen.
export function roadsLayer({ on = true, port = null, shape = null, look = {} } = {}) {
  if (!on || !port || !shape?.features?.length) return null;
  return {
    id: "roads",
    shape,
    glyphs: glyphsUrl(port),
    specs: roadLayerSpecs(look),
    attribution: ROADS_ATTRIBUTION
  };
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

function fromBase64(text) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(text, "base64"));
  const binary = globalThis.atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

const glyphBytes = new Map();

// The bytes for one glyph range of the label font (an empty range when we do not ship it).
export function glyphRange(fontstack, range) {
  if (!glyphRangeOk(range)) return null;
  if (!GLYPH_BASE64[range]) return emptyGlyphRange(fontstack, range);
  if (!glyphBytes.has(range)) glyphBytes.set(range, fromBase64(GLYPH_BASE64[range]));
  return glyphBytes.get(range);
}
