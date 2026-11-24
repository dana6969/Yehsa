// What the Map draws, worked out from what is saved on the phone. Pure and deterministic:
// the same saved packs and areas always give the same layers, so leaving the Map tab and
// coming back (the screen is rebuilt) draws exactly what it drew before.

import { attributionLine } from "./map_packs.js";

export const MAP_STYLES = [
  { id: "standard", label: "Standard" },
  { id: "terrain", label: "Terrain" },
  { id: "simple", label: "Simple" },
  { id: "night", label: "Night" }
];

const NIGHT_TINT = { red: "#7a0c0c", amber: "#7a5200" };

// Land and water fills for the World overview (country outlines), so it is never outlines on black.
const LAND = {
  standard: { water: "#9dbfd9", land: "#e6e1c8", border: "#8b8a7a", line: "#9a6b1f" },
  simple: { water: "#7fb0d8", land: "#f4efd6", border: "#4a4a40", line: "#6b4310" },
  night: { water: "#1a2530", land: "#2c2b23", border: "#5c5a4a", line: "#a9876a" },
  nightRed: { water: "#2a0f0f", land: "#3d1c16", border: "#7a4a3e", line: "#c97a62" },
  nightAmber: { water: "#2a1d08", land: "#3d2c10", border: "#7a6030", line: "#d9a35a" }
};

export function landStyleFor({ style = "standard", mode = "field", night = "red" } = {}) {
  if (mode === "night" || style === "night") return night === "amber" ? LAND.nightAmber : LAND.nightRed;
  return style === "simple" ? LAND.simple : LAND.standard;
}

// MapLibre raster paint for a style. Night follows the display mode and dims the picture so it
// does not flood a dark-adapted eye; a tint of the night color sits above it.
export function rasterPaintFor({ style = "standard", mode = "field", night = "red" } = {}) {
  if (mode === "night" || style === "night") {
    return {
      paint: { rasterSaturation: -0.9, rasterBrightnessMax: 0.5, rasterContrast: 0.05 },
      tint: { color: NIGHT_TINT[night] || NIGHT_TINT.red, opacity: 0.32 },
      label: "Night"
    };
  }
  if (style === "terrain") {
    return { paint: { rasterContrast: 0.18, rasterSaturation: 0.2 }, tint: null, label: "Terrain" };
  }
  if (style === "simple") {
    return { paint: { rasterContrast: 0.35, rasterSaturation: 0.2 }, tint: null, label: "Simple" };
  }
  return { paint: {}, tint: null, label: "Standard" };
}

function tilePacks(packs) {
  return (packs || []).filter((pack) => pack.kind === "mbtiles" || (pack.format === "mbtiles" && pack.file));
}

function zoomRange(items) {
  const mins = items.map((item) => item.minZoom).filter(Number.isFinite);
  const maxs = items.map((item) => item.maxZoom).filter(Number.isFinite);
  return { minZoom: mins.length ? Math.min(...mins) : 0, maxZoom: maxs.length ? Math.max(...maxs) : 22 };
}

// store: the pack store. areas: saved areas. port: loopback tile server port (null until bound).
export function mapLayers({ store, areas = [], port = null, style = "standard", mode = "field", night = "red" } = {}) {
  const packs = store?.packs || [];
  const tiled = tilePacks(packs);
  const drawn = (areas || []).filter((area) => area && area.rendered && area.box);
  const shapesPacks = packs.filter((pack) => Array.isArray(pack.lines) && pack.lines.length);
  const shapes = shapesPacks.flatMap((pack) => pack.lines);
  const rasters = [];
  if (port && drawn.length) {
    const zooms = drawn.flatMap(zoomsOf);
    rasters.push({
      id: "area",
      template: `http://127.0.0.1:${port}/area/{z}/{x}/{y}`,
      minZoom: zooms.length ? Math.min(...zooms) : 0,
      maxZoom: zooms.length ? Math.max(...zooms) : 12,
      tileSize: 256
    });
  }
  if (port && tiled.length) {
    const range = zoomRange(tiled);
    rasters.push({
      id: "pack",
      template: `http://127.0.0.1:${port}/pack/{z}/{x}/{y}`,
      minZoom: range.minZoom,
      maxZoom: range.maxZoom,
      // Pack tiles are 512 px pictures drawn at a 256 px size, so they are sharp on a phone screen.
      tileSize: 256
    });
  }
  const archivePack = packs.find((pack) => pack.archive) || null;
  const empty = !tiled.length && !drawn.length && !shapes.length && !archivePack;
  const hasLand = shapes.some((line) => line.ring);
  const look = rasterPaintFor({ style, mode, night });
  const sources = [];
  if (tiled.length) sources.push(...packs.filter((pack) => tiled.includes(pack)));
  const credit = aboutThisMap({ packs, drawn }).credit;
  return {
    empty,
    // The map component draws whenever there is something to draw, even while the tile server
    // is still starting (outlines show at once, tiles join when the port is known).
    useMap: !empty,
    waitingForTiles: (tiled.length > 0 || drawn.length > 0) && !port,
    rasters,
    archivePack,
    shapes,
    hasLand,
    land: landStyleFor({ style, mode, night }),
    paint: look.paint,
    tint: look.tint,
    styleLabel: look.label,
    attribution: empty ? "No map pack yet." : credit,
    firstFocus: focusOf(tiled, drawn)
  };
}

// Zoom levels an area really has tiles for. Areas saved by older builds have no zooms list,
// so read them from the tile keys ("terrain:8/80/94").
function zoomsOf(area) {
  const listed = (area.zooms || []).filter(Number.isFinite);
  if (listed.length) return listed;
  const found = new Set();
  for (const key of area.done || []) {
    const m = /(\d+)\/\d+\/\d+$/.exec(String(key));
    if (m) found.add(Number(m[1]));
  }
  return [...found];
}

// Where to look when there is no GPS fix: the pack or area added last.
function focusOf(tiled, drawn) {
  const area = drawn[drawn.length - 1];
  if (area?.box) return { west: area.box.west, south: area.box.south, east: area.box.east, north: area.box.north };
  const pack = tiled[tiled.length - 1];
  return pack?.bounds || null;
}

// Each sentence of a credit once, in order. "May be dated." and "Elevation: ..." never repeat.
export function dedupeCredit(text) {
  const seen = new Set();
  const out = [];
  for (const part of String(text || "").split(/(?<=\.)\s+/)) {
    const key = part.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(part.trim());
  }
  return out.join(" ");
}

// The About this map sheet for what is saved on the phone (same packs and areas the map draws).
// Kept apart from mapLayers(), which only ever describes what is drawn.
export function mapAbout({ store, areas = [] } = {}) {
  const packs = store?.packs || [];
  const drawn = (areas || []).filter((area) => area && area.rendered && area.box);
  return aboutThisMap({ packs, drawn });
}

const ELEVATION_CREDIT = "Elevation: AWS Terrain Tiles (USGS 3DEP, SRTM, GMTED, ETOPO1; public domain)";

// "About this map": what is on the map and every source credited once. The map itself only shows
// an "About this map" link; the credit lives here, so it is never a wall of text under the map.
export function aboutThisMap({ packs = [], drawn = [] } = {}) {
  const lines = [];
  for (const pack of packs) {
    if (!pack?.name) continue;
    const catalog = pack.kind === "mbtiles" && (pack.catalogId || /no roads/i.test(pack.description || "") || /AWS Terrain Tiles/i.test(pack.attribution || ""));
    const what = catalog
      ? "Land, water, trails, place names, and terrain. No roads."
      : Array.isArray(pack.lines) && pack.lines.length ? "Lines and points you imported." : "Imported map file.";
    const line = `${pack.name}. ${what}`;
    if (!lines.includes(line)) lines.push(line);
  }
  if (drawn.length) lines.push(`${drawn.length === 1 ? "1 downloaded area" : `${drawn.length} downloaded areas`}. Terrain and elevation only. No roads.`);
  const named = attributionLine({ packs: packs.filter((pack) => pack.attribution) });
  let credit = /^No map pack yet\.$/.test(named) ? "" : named;
  // The pack credit already names AWS Terrain Tiles; only add it when a downloaded area is the sole elevation source.
  if (drawn.length && !/AWS Terrain Tiles/i.test(credit)) {
    credit = credit ? credit.replace(/\s*May be dated\.$/, ` · ${ELEVATION_CREDIT}. May be dated.`) : `${ELEVATION_CREDIT}. May be dated.`;
  }
  return { title: "About this map", lines, credit: dedupeCredit(credit) || "No map pack yet." };
}
