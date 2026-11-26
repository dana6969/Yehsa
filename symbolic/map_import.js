// Import a map file picked on the phone: MBTiles, GeoJSON, GPX, KML.
// Text formats are read in chunks (the phone passes readChunk) and yield to the screen between
// chunks, so even a big file never freezes the app. MBTiles are never read here: the phone moves
// the file as-is and SQLite opens it.
// PMTiles are recognised and refused with a plain reason (not painted on the phone yet).

import { buildPack, formatBytes } from "./map_packs.js";
import { addGeometry, createGeoJsonReader, createGpxReader, createKmlReader, createLineSink, createUtf8Stream } from "./geo_stream.js";

export const CHUNK_BYTES = 192 * 1024;
export const TEXT_FILE_LIMIT = 150 * 1024 * 1024;

export const IMPORT_MESSAGES = {
  unsupported: "This file type isn't supported. Use GeoJSON, GPX, KML, or MBTiles.",
  pmtiles: "PMTiles files aren't painted on this phone yet. Use MBTiles with raster tiles, GeoJSON, GPX, or KML.",
  vector: "This MBTiles file holds vector tiles, which this phone can't paint yet. Use one with picture (raster) tiles.",
  unreadable: "I couldn't read this file.",
  tooLarge: "This file is too large for the remaining storage.",
  tooLargeText: "This file is too large to read on this phone. Split it, or use MBTiles.",
  empty: "This file has no map geometry I can paint.",
  canceled: "You canceled the file picker."
};

export const KIND_WORDS = {
  mbtiles: "Offline tiles",
  geojson: "Places and lines",
  kml: "Places and lines",
  gpx: "A GPS track"
};

const EXT = { mbtiles: "mbtiles", geojson: "geojson", json: "geojson", gpx: "gpx", kml: "kml", pmtiles: "pmtiles" };

export function extensionKind(name) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? EXT[m[1]] || null : null;
}

function asciiOf(bytes, n) {
  let s = "";
  for (let i = 0; i < Math.min(n, bytes.length); i += 1) s += String.fromCharCode(bytes[i]);
  return s;
}

// Look at the first bytes: the name can lie, the header does not.
export function sniffKind(head) {
  const text = asciiOf(head, 16);
  if (text.startsWith("SQLite format 3")) return "mbtiles";
  if (text.startsWith("PMTiles")) return "pmtiles";
  const start = asciiOf(head, 2048).replace(/^(\uFEFF|\xEF\xBB\xBF)/, "").trimStart();
  if (/^<\?xml|^<gpx|^<kml/i.test(start)) {
    if (/<gpx[\s>]/i.test(start)) return "gpx";
    if (/<kml[\s>]/i.test(start)) return "kml";
    if (/<gpx/i.test(start)) return "gpx";
    return "kml";
  }
  if (start.startsWith("{") || start.startsWith("[")) return "geojson";
  return null;
}

// What the confirm card says before anything is copied. room is the free storage in bytes.
export function describePick({ name, size }, { room = null } = {}) {
  const kind = extensionKind(name);
  if (kind === "pmtiles") return { ok: false, reason: IMPORT_MESSAGES.pmtiles };
  const words = kind ? KIND_WORDS[kind] : "Map file";
  const sizeText = Number.isFinite(size) ? formatBytes(size) : "size unknown";
  if (Number.isFinite(room) && Number.isFinite(size) && size > room) return { ok: false, reason: IMPORT_MESSAGES.tooLarge };
  return {
    ok: true,
    kind,
    title: name || "Map file",
    words,
    sizeText,
    roomText: Number.isFinite(room) ? `${formatBytes(room)} left` : null,
    text: `${name || "Map file"} · ${words} · ${sizeText}${Number.isFinite(room) ? ` · ${formatBytes(room)} left on this phone` : ""}`
  };
}

const yieldDefault = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Reads GeoJSON / GPX / KML from a file in chunks and returns a pack ({ ok, pack } or { ok:false, reason }).
 * io.readChunk(position, length) -> Uint8Array. Pass the byte size of the file.
 */
export async function importTextFile({ name, size, kind, readChunk, onProgress, yieldFrame = yieldDefault, signal }) {
  if (size > TEXT_FILE_LIMIT) return { ok: false, reason: IMPORT_MESSAGES.tooLargeText };
  const sink = createLineSink();
  let reader;
  let geo = null;
  if (kind === "geojson") {
    geo = createGeoJsonReader({ onFeature: (feature) => addGeometry(sink, feature?.geometry || feature, feature?.properties) });
    reader = geo;
  } else if (kind === "gpx") reader = createGpxReader({ sink });
  else if (kind === "kml") reader = createKmlReader({ sink });
  else return { ok: false, reason: IMPORT_MESSAGES.unsupported };
  const utf8 = createUtf8Stream();
  let position = 0;
  let first = true;
  let loose = "";
  try {
    while (position < size) {
      if (signal?.aborted) return { ok: false, reason: IMPORT_MESSAGES.canceled, canceled: true };
      const length = Math.min(CHUNK_BYTES, size - position);
      const bytes = await readChunk(position, length);
      if (!bytes || !bytes.length) break;
      let text = utf8.push(bytes);
      if (first) {
        text = text.replace(/^\uFEFF/, "");
        first = false;
      }
      if (kind === "geojson" && loose.length < 4 * 1024 * 1024) loose += text;
      reader.push(text);
      position += bytes.length;
      onProgress?.({ done: position, total: size });
      await yieldFrame();
    }
    reader.push(utf8.end());
  } catch {
    return { ok: false, reason: IMPORT_MESSAGES.unreadable };
  }
  const done = reader.end();
  if (done && done.ok === false) return { ok: false, reason: done.reason || IMPORT_MESSAGES.unreadable };
  let lines = sink.lines;
  let meta = geo ? done.meta : {};
  // A file that is one Feature or one bare geometry has no "features" array to stream.
  if (geo && !lines.length && loose && size <= loose.length + 4) {
    try {
      const doc = JSON.parse(loose);
      if (Array.isArray(doc)) for (const item of doc) addGeometry(sink, item?.geometry || item, item?.properties);
      else if (doc?.type === "Feature") addGeometry(sink, doc.geometry, doc.properties);
      else if (doc?.type) addGeometry(sink, doc, doc.properties);
      lines = sink.lines;
    } catch {
      return { ok: false, reason: IMPORT_MESSAGES.unreadable };
    }
  }
  if (!lines.length) return { ok: false, reason: IMPORT_MESSAGES.empty };
  const props = meta.properties || {};
  const nameOut = String(props.name || meta.name || name || (kind === "gpx" ? "GPS track" : "Map file")).replace(/\.(geojson|json|gpx|kml)$/i, "");
  const pack = buildPack({
    id: `import-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: nameOut,
    format: kind,
    bytes: size,
    lines,
    built: props.date || props.built || meta.date || meta.built || null,
    source: props.source || meta.source || `Imported ${kind.toUpperCase()}`,
    license: props.license || meta.license || "Not stated in the file",
    attribution: props.attribution || meta.attribution || "Attribution was not in the file.",
    paintsTiles: true,
    note: sink.state.truncated ? "Drawn from the file, thinned to keep the map smooth. May be out of date." : "Drawn from the file. May be out of date."
  });
  return { ok: true, pack, truncated: sink.state.truncated };
}

const RASTER = new Set(["png", "jpg", "jpeg", "webp"]);

// Checks the numbers read from an MBTiles file's own tables and builds the pack record.
// meta: metadata table as an object. summary: { tiles, minZoom, maxZoom }.
export function mbtilesPackFrom({ id, name, bytes, meta, summary, sampleKind }) {
  if (!summary || !summary.tiles) return { ok: false, reason: IMPORT_MESSAGES.empty };
  const format = String(meta?.format || sampleKind || "").toLowerCase();
  if (format === "pbf" || format === "mvt") return { ok: false, reason: IMPORT_MESSAGES.vector };
  if (format && !RASTER.has(format)) return { ok: false, reason: IMPORT_MESSAGES.unsupported };
  let bounds = null;
  const parts = String(meta?.bounds || "").split(",").map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > parts[0] && parts[3] > parts[1]) {
    bounds = { west: parts[0], south: parts[1], east: parts[2], north: parts[3] };
  }
  const minZoom = Number.isFinite(Number(meta?.minzoom)) && meta?.minzoom !== undefined ? Number(meta.minzoom) : summary.minZoom;
  const maxZoom = Number.isFinite(Number(meta?.maxzoom)) && meta?.maxzoom !== undefined ? Number(meta.maxzoom) : summary.maxZoom;
  const license = meta?.license || (/ODbL/i.test(`${meta?.attribution || ""}${meta?.description || ""}`) ? "ODbL 1.0" : "Not stated in the file");
  const pack = buildPack({
    id,
    name: String(meta?.name || name || "Offline tiles").replace(/\.mbtiles$/i, ""),
    format: "mbtiles",
    bytes,
    lines: [],
    bounds,
    minZoom,
    maxZoom,
    built: meta?.built || meta?.date || null,
    source: meta?.source || "Imported MBTiles",
    license,
    attribution: meta?.attribution ? String(meta.attribution).slice(0, 300) : "Attribution was not in the file.",
    paintsTiles: true,
    note: "Tiles in this file are drawn. Streets appear only if this file contains them. May be out of date."
  });
  pack.kind = "mbtiles";
  pack.file = `${id}.mbtiles`;
  pack.tileFormat = format || null;
  return pack;
}
