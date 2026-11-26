// Offline map packs. Nothing here opens a network connection.
// A download starts only when the caller passes approved: true.
// OSM's public tile servers are not used.

import { haversineKm } from "./landscape_math.js";
import { addGeometry, createGeoJsonReader, createGpxReader, createKmlReader, createLineSink } from "./geo_stream.js";
import { PACK_MANIFEST } from "./pack_manifest.js";

// Pack files live on the phone's disk, not in memory, so the budget is a disk budget.
export const STORAGE_BUDGET_BYTES = 2 * 1024 * 1024 * 1024;

// Pack descriptions, one place so cards and the About text agree.
function manifestItem(pack) {
  return {
    id: pack.id,
    name: pack.name,
    source: "Yehsa map pack: AWS Terrain Tiles, NLCD 2021, OpenStreetMap",
    license: pack.license,
    attribution: pack.attribution,
    url: `${PACK_MANIFEST.baseUrl}${pack.file}`,
    md5: pack.md5,
    exactBytes: true,
    bytesEstimate: pack.bytes,
    kind: "mbtiles",
    downloadable: true,
    offered: true,
    description: `Land, water, trails, place names and terrain for ${pack.name}, for offline use. No roads.`,
    region: pack.region,
    group: pack.group,
    built: pack.built,
    bounds: pack.bounds,
    minZoom: pack.minZoom,
    maxZoom: pack.maxZoom,
    note: "Terrain, land cover, water, trails and place names. No road layer. No parcel or owner layer."
  };
}

export const PACK_CATALOG = [
  {
    id: "natural-earth-overview",
    name: "World overview",
    source: "Natural Earth 1:110m",
    license: "Public domain",
    attribution: "Natural Earth",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
    bytesEstimate: 800000,
    kind: "geojson",
    downloadable: true,
    offered: true,
    description: "Country outlines you can see offline. Not streets or a live city map.",
    region: "World",
    group: "World",
    note: "Country outlines only. Not streets and not a live city map."
  },
  ...PACK_MANIFEST.packs.map(manifestItem),
  {
    id: "planet",
    name: "Whole world",
    source: "Not offered",
    license: "ODbL 1.0",
    attribution: "© OpenStreetMap contributors. ODbL.",
    url: "",
    bytesEstimate: 80 * 1024 * 1024 * 1024,
    kind: "refused",
    downloadable: false,
    offered: false,
    description: "A map of the whole world isn't offered — it's too large for this phone. Pick a region.",
    region: "World",
    note: "The whole world is tens of gigabytes. It is not offered."
  }
];

export function emptyPackStore() {
  return { packs: [], usedBytes: 0, budgetBytes: STORAGE_BUDGET_BYTES, jobs: [] };
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${Math.round(value / (1024 * 1024))} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

export function sizeWarning(bytes, roomBytes) {
  const estimate = Number(bytes) || 0;
  if (estimate >= 8 * 1024 * 1024 * 1024) {
    return `About ${formatBytes(estimate)}. The whole world is tens of gigabytes. Pick a region. Nothing was downloaded.`;
  }
  if (estimate > roomBytes) {
    return `About ${formatBytes(estimate)} is over the ${formatBytes(roomBytes)} left in the storage budget. Nothing was downloaded.`;
  }
  return `About ${formatBytes(estimate)}. May be out of date.`;
}

function bytesOf(raw) {
  if (raw instanceof Uint8Array) return raw;
  if (typeof raw === "string") return new TextEncoder().encode(raw);
  return new Uint8Array();
}

function textOf(raw) {
  if (typeof raw === "string") return raw;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytesOf(raw));
}

function boundsOf(points) {
  if (!points.length) return null;
  let west = 180;
  let east = -180;
  let south = 90;
  let north = -90;
  for (const point of points) {
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
  }
  return { west, south, east, north };
}

export function buildPack(partial) {
  const lines = partial.lines || [];
  const points = lines.flatMap((line) => line.points);
  return {
    ok: true,
    id: partial.id,
    name: partial.name,
    format: partial.format,
    bytes: partial.bytes,
    bounds: partial.bounds || boundsOf(points.length ? points : partial.boundPoints || []),
    minZoom: partial.minZoom ?? null,
    maxZoom: partial.maxZoom ?? null,
    built: partial.built || null,
    source: partial.source || "Imported file",
    license: partial.license || "Not stated in the file",
    attribution: partial.attribution || "Attribution was not in the file.",
    lines,
    paintsTiles: partial.paintsTiles === true,
    note: partial.note || "May be out of date.",
    importedAt: new Date().toISOString()
  };
}

const finish = buildPack;

function linesFromSink(sink) {
  return sink.lines;
}

function boundPointsOf(lines) {
  return lines.flatMap((line) => line.points);
}

function parseGeoJson(name, text, bytes) {
  const sink = createLineSink();
  const reader = createGeoJsonReader({ onFeature: (feature) => addGeometry(sink, feature?.geometry || feature, feature?.properties) });
  reader.push(text);
  const done = reader.end();
  if (!done.ok) return { ok: false, reason: done.reason };
  // A file that is one Feature or one bare geometry.
  if (!done.features) {
    let doc = null;
    try {
      doc = JSON.parse(text);
    } catch {
      return { ok: false, reason: "That file is not valid GeoJSON. Nothing was added." };
    }
    if (Array.isArray(doc)) for (const item of doc) addGeometry(sink, item?.geometry || item, item?.properties);
    else if (doc?.type === "Feature") addGeometry(sink, doc.geometry, doc.properties);
    else if (doc?.type) addGeometry(sink, doc, doc.properties);
  }
  const lines = linesFromSink(sink);
  if (!lines.length) {
    const valid = (() => { try { JSON.parse(text); return true; } catch { return false; } })();
    return { ok: false, reason: valid ? "That GeoJSON has no coordinates. Nothing was added." : "That file is not valid GeoJSON. Nothing was added." };
  }
  const props = done.meta.properties || {};
  return finish({
    id: `import-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: String(props.name || done.meta.name || name || "GeoJSON"),
    format: "geojson",
    bytes,
    lines,
    built: props.date || props.built || done.meta.date || done.meta.built || null,
    source: props.source || done.meta.source || "Imported GeoJSON",
    license: props.license || done.meta.license || "Not stated in the file",
    attribution: props.attribution || done.meta.attribution || "Attribution was not in the file.",
    paintsTiles: true,
    note: sink.state.truncated ? "Drawn from the file, thinned to keep the map smooth. May be out of date." : "Drawn from the file. May be out of date."
  });
}

function parseGpx(name, text, bytes) {
  if (!/<gpx[\s>]/i.test(text)) return { ok: false, reason: "That file is not GPX. Nothing was added." };
  const sink = createLineSink();
  const reader = createGpxReader({ sink });
  reader.push(text);
  const done = reader.end();
  if (!done.ok) return { ok: false, reason: done.reason };
  if (!sink.lines.length) return { ok: false, reason: "That GPX has no points. Nothing was added." };
  return finish({
    id: `import-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: name || "GPX track",
    format: "gpx",
    bytes,
    lines: sink.lines,
    source: "Imported GPX",
    paintsTiles: true,
    note: "Track from the file. May be out of date."
  });
}

function parseKml(name, text, bytes) {
  if (!/<kml[\s>]|<coordinates/i.test(text)) return { ok: false, reason: "That file is not KML. Nothing was added." };
  const sink = createLineSink();
  const reader = createKmlReader({ sink });
  reader.push(text);
  const done = reader.end();
  if (!done.ok) return { ok: false, reason: done.reason };
  // Coordinates outside any Placemark (bare KML fragments).
  if (!sink.lines.length) {
    for (const block of text.match(/<coordinates[^>]*>[\s\S]*?<\/coordinates>/gi) || []) {
      const points = [];
      for (const token of block.replace(/<[^>]+>/g, " ").trim().split(/\s+/)) {
        const [lon, lat, ele] = token.split(",").map(Number);
        if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) points.push(Number.isFinite(ele) && ele !== 0 ? { latitude: lat, longitude: lon, ele } : { latitude: lat, longitude: lon });
      }
      sink.add(points, "kml", false);
    }
  }
  if (!sink.lines.length) return { ok: false, reason: "That KML has no coordinates. Nothing was added." };
  return finish({
    id: `import-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: name || "KML",
    format: "kml",
    bytes,
    lines: sink.lines,
    source: "Imported KML",
    paintsTiles: true,
    note: "Shapes from the file. May be out of date."
  });
}

function parsePmtiles(name, bytes) {
  if (bytes.length < 127) return { ok: false, reason: "That PMTiles file is too small to be valid. Nothing was added." };
  const magic = new TextDecoder().decode(bytes.subarray(0, 7));
  if (magic !== "PMTiles") return { ok: false, reason: "That file is not PMTiles. Nothing was added." };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(7);
  if (version !== 3) return { ok: false, reason: "Only PMTiles version 3 is checked. Nothing was added." };
  const minZoom = view.getUint8(100);
  const maxZoom = view.getUint8(101);
  const west = view.getInt32(102, true) / 1e7;
  const south = view.getInt32(106, true) / 1e7;
  const east = view.getInt32(110, true) / 1e7;
  const north = view.getInt32(114, true) / 1e7;
  const ring = [
    { latitude: south, longitude: west },
    { latitude: south, longitude: east },
    { latitude: north, longitude: east },
    { latitude: north, longitude: west },
    { latitude: south, longitude: west }
  ];
  return finish({
    id: `import-${Date.now()}`,
    name: name || "PMTiles",
    format: "pmtiles",
    bytes: bytes.length,
    lines: [{ points: ring, water: false, name: "coverage" }],
    boundPoints: ring,
    minZoom,
    maxZoom,
    source: "Imported PMTiles",
    paintsTiles: true,
    note: "Tiles in this file are drawn. Streets appear only if this file contains them. May be out of date."
  });
}

function parseMbtiles(name, bytes) {
  const magic = new TextDecoder().decode(bytes.subarray(0, 16));
  if (magic !== "SQLite format 3\u0000") {
    return { ok: false, reason: "That file is not a valid MBTiles archive. Nothing was added." };
  }
  const sample = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 512000)));
  const bounds = sample.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/);
  const minZoom = (sample.match(/minzoom[\s\u0000]{0,4}(\d{1,2})/i) || [])[1];
  const maxZoom = (sample.match(/maxzoom[\s\u0000]{0,4}(\d{1,2})/i) || [])[1];
  let ring = [];
  if (bounds) {
    const [west, south, east, north] = bounds[0].split(",").map(Number);
    ring = [
      { latitude: south, longitude: west },
      { latitude: south, longitude: east },
      { latitude: north, longitude: east },
      { latitude: north, longitude: west },
      { latitude: south, longitude: west }
    ];
  }
  const license = /ODbL/i.test(sample) ? "ODbL 1.0" : "Not stated in the file";
  const attribution = /OpenStreetMap/i.test(sample)
    ? "© OpenStreetMap contributors. ODbL."
    : "Attribution was not in the file.";
  return finish({
    id: `import-${Date.now()}`,
    name: name || "MBTiles",
    format: "mbtiles",
    bytes: bytes.length,
    lines: ring.length ? [{ points: ring, water: false, name: "coverage" }] : [],
    boundPoints: ring,
    minZoom: minZoom == null ? null : Number(minZoom),
    maxZoom: maxZoom == null ? null : Number(maxZoom),
    source: "Imported MBTiles",
    license,
    attribution,
    paintsTiles: true,
    note: "Tiles in this file are drawn. Streets appear only if this file contains them. May be out of date."
  });
}

export function validateImport(name, raw) {
  const bytes = bytesOf(raw);
  if (!bytes.length) return { ok: false, reason: "That file is empty. Nothing was added." };
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".pmtiles")) return parsePmtiles(name, bytes);
  if (lower.endsWith(".mbtiles")) return parseMbtiles(name, bytes);
  const text = textOf(raw);
  if (lower.endsWith(".gpx") || /<gpx[\s>]/i.test(text.slice(0, 200))) return parseGpx(name, text, bytes.length);
  if (lower.endsWith(".kml") || /<kml[\s>]/i.test(text.slice(0, 200))) return parseKml(name, text, bytes.length);
  if (lower.endsWith(".geojson") || lower.endsWith(".json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    return parseGeoJson(name, text, bytes.length);
  }
  return { ok: false, reason: "That file type is not a map pack this phone can check. Nothing was added." };
}

export function addPack(store, pack) {
  const current = store || emptyPackStore();
  if (!pack?.ok) return { store: current, added: false, reason: pack?.reason || "Nothing was added." };
  const same = pack.catalogId ? current.packs.filter((item) => item.catalogId === pack.catalogId) : [];
  if (same.length) {
    // Update: swap the old copy out so storage and the card list never double up.
    const freed = same.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
    const base = current.usedBytes - freed;
    if (base + pack.bytes > current.budgetBytes) {
      return { store: current, added: false, reason: sizeWarning(pack.bytes, current.budgetBytes - base) };
    }
    return {
      store: {
        ...current,
        packs: [...current.packs.filter((item) => item.catalogId !== pack.catalogId), pack],
        usedBytes: Math.max(0, base + pack.bytes),
        jobs: (current.jobs || []).filter((job) => job.id !== pack.catalogId)
      },
      added: true,
      replaced: true,
      reason: null
    };
  }
  if (current.usedBytes + pack.bytes > current.budgetBytes) {
    return {
      store: current,
      added: false,
      reason: sizeWarning(pack.bytes, current.budgetBytes - current.usedBytes)
    };
  }
  return {
    store: {
      ...current,
      packs: [...current.packs, pack],
      usedBytes: current.usedBytes + pack.bytes
    },
    added: true,
    reason: null
  };
}

// Collapse duplicate copies of the same catalog pack (stores saved before the update fix).
export function dedupePacks(store) {
  const current = store || emptyPackStore();
  const seen = new Map();
  for (const pack of current.packs || []) {
    const key = pack.catalogId || pack.id;
    seen.set(key, pack);
  }
  const packs = [...seen.values()];
  if (packs.length === (current.packs || []).length) return current;
  return { ...current, packs, usedBytes: packs.reduce((sum, pack) => sum + (Number(pack.bytes) || 0), 0) };
}

export function deletePack(store, id) {
  const current = store || emptyPackStore();
  const pack = current.packs.find((item) => item.id === id);
  return {
    ...current,
    packs: current.packs.filter((item) => item.id !== id),
    usedBytes: Math.max(0, current.usedBytes - (pack?.bytes || 0)),
    jobs: (current.jobs || []).filter((job) => job.id !== id)
  };
}

// Short credit for the map corner: each source once, never "Public domain. Public domain.".
export function attributionLine(store) {
  const packs = store?.packs || [];
  if (!packs.length) return "No map pack yet.";
  const names = [];
  for (const pack of packs) {
    const name = String(pack.attribution || pack.source || pack.name || "").replace(/\.\s*(Public domain|ODbL)\.?$/i, "").replace(/\.$/, "").trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return `${names.join(" · ")}. May be dated.`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function builtLabel(value) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text.slice(0, 20);
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

// "About this data": source, license, and date, said once.
export function aboutPackData(pack) {
  const source = String(pack?.attribution || pack?.source || "Source not stated").replace(/\.\s*(Public domain|ODbL)\.?$/i, "").replace(/\.$/, "").trim();
  const license = String(pack?.license || "license not stated").replace(/^Public domain$/i, "public domain");
  const built = builtLabel(pack?.built || pack?.importedAt);
  return `${source} · ${license}${built ? ` · built ${built}` : ""}. May be dated.`;
}

// Everything on the phone in one number: packs, saved areas, and imported files.
export function totalUsedBytes(store, areaBytes = 0) {
  const current = store || emptyPackStore();
  return (Number(current.usedBytes) || 0) + (Number(areaBytes) || 0);
}

export function storageLine(store, areaBytes = 0) {
  const current = store || emptyPackStore();
  if (totalUsedBytes(current, areaBytes) <= 0) return `Nothing stored yet. Room for ${formatBytes(current.budgetBytes)} of maps.`;
  return `Using ${formatBytes(totalUsedBytes(current, areaBytes))} of ${formatBytes(current.budgetBytes)} on this phone.`;
}

// "412 KB of 819 KB · 52%". Total unknown: just what has arrived.
export function progressText(job) {
  if (!job) return "";
  const received = Number(job.received) || 0;
  const total = Number(job.total) || 0;
  if (total > 0) {
    const pct = Math.min(100, Math.round((received / total) * 100));
    return `${formatBytes(received)} of ${formatBytes(total)} · ${pct}%`;
  }
  return `${formatBytes(received)} so far`;
}

/**
 * One plain card per pack: what is on the phone first, then what can be downloaded.
 * Whole world is never a card. A catalog entry already on the phone is not listed twice.
 * Every card shown can be downloaded: an entry that is not downloadable is not listed.
 * jobs: { [catalogId]: { state: "downloading" | "paused" | "error" | "verifying", received?, total?, reason? } }
 * opts.native: false on the web preview, where tile archives cannot be stored.
 */
export function packCards(store, jobs = {}, { online = true, native = true } = {}) {
  const current = dedupePacks(store);
  const cards = [];
  const have = new Set();
  const stateOf = (job, ready) => {
    if (job?.state === "downloading") return "Downloading";
    if (job?.state === "verifying") return "Checking";
    if (job?.state === "paused") return "Paused";
    if (job?.state === "error") return "Error";
    return ready ? "Ready" : "Not downloaded";
  };
  for (const pack of current.packs || []) {
    const item = PACK_CATALOG.find((entry) => entry.id === pack.catalogId);
    if (pack.catalogId) have.add(pack.catalogId);
    const job = pack.catalogId ? jobs[pack.catalogId] : null;
    const zoom = pack.format === "mbtiles" && Number.isFinite(pack.minZoom) && Number.isFinite(pack.maxZoom) ? ` · zoom ${pack.minZoom}–${pack.maxZoom}` : "";
    cards.push({
      key: pack.id,
      packId: pack.id,
      catalogId: pack.catalogId || null,
      name: item?.name || pack.name || "Map file",
      group: "On this phone",
      state: stateOf(job, true),
      description: item?.description || "A map file you added. It works without a signal.",
      meta: `${formatBytes(pack.bytes)} · ${item?.region || "Your file"}${zoom}`,
      about: aboutPackData(pack),
      canUpdate: Boolean(item?.downloadable) && (job ? job.state !== "downloading" : true),
      updateAvailable: Boolean(item?.built && pack.built && String(item.built) > String(pack.built)),
      focus: pack.bounds || null,
      job: job || null,
      progress: job ? progressText(job) : null
    });
  }
  for (const item of PACK_CATALOG) {
    if (item.offered === false || item.downloadable !== true || have.has(item.id)) continue;
    if (item.kind === "mbtiles" && !native) continue;
    const job = jobs[item.id] || null;
    cards.push({
      key: item.id,
      packId: null,
      catalogId: item.id,
      name: item.name.replace(/ extract$/i, ""),
      group: item.group || "More",
      state: stateOf(job, false),
      description: item.description,
      meta: `About ${formatBytes(item.bytesEstimate)} · ${item.region}${item.kind === "mbtiles" ? ` · zoom ${item.minZoom}–${item.maxZoom}` : ""}`,
      about: aboutPackData(item),
      canDownload: true,
      waitingForSignal: online === false,
      focus: item.bounds || null,
      job,
      progress: job ? progressText(job) : null
    });
  }
  return cards;
}

export function beginDownload(store, catalogId, { approved } = {}) {
  const current = store || emptyPackStore();
  const item = PACK_CATALOG.find((entry) => entry.id === catalogId);
  if (!item) return { store: current, fetch: false, reason: "That region is not in the catalog. Nothing was downloaded." };
  if (approved !== true) {
    const next = item.downloadable === true
      ? "Approve to download."
      : "Approving will still not download this one.";
    return {
      store: current,
      fetch: false,
      reason: `${item.name}. ${sizeWarning(item.bytesEstimate, current.budgetBytes - current.usedBytes)} ${item.note || ""} ${item.attribution} ${next}`
    };
  }
  if (item.downloadable !== true) {
    return { store: current, fetch: false, reason: `${item.note} ${sizeWarning(item.bytesEstimate, current.budgetBytes - current.usedBytes)}` };
  }
  const reclaim = current.packs.filter((pack) => pack.catalogId === item.id).reduce((sum, pack) => sum + (Number(pack.bytes) || 0), 0);
  if (item.bytesEstimate > current.budgetBytes - current.usedBytes + reclaim) {
    return { store: current, fetch: false, reason: sizeWarning(item.bytesEstimate, current.budgetBytes - current.usedBytes + reclaim) };
  }
  const job = {
    id: item.id,
    status: "fetching",
    received: 0,
    total: item.bytesEstimate,
    approved: true,
    url: item.url,
    kind: item.kind,
    md5: item.md5 || null
  };
  return {
    store: { ...current, jobs: [...current.jobs.filter((entry) => entry.id !== item.id), job] },
    fetch: true,
    job,
    item
  };
}

export function pauseDownload(store, id) {
  const current = store || emptyPackStore();
  return {
    ...current,
    jobs: current.jobs.map((job) => job.id === id ? { ...job, status: "paused" } : job)
  };
}

export function resumeDownload(store, id) {
  const current = store || emptyPackStore();
  const job = current.jobs.find((entry) => entry.id === id);
  if (!job?.approved) return { store: current, fetch: false, reason: "Not approved. Nothing was downloaded." };
  return {
    store: {
      ...current,
      jobs: current.jobs.map((entry) => entry.id === id ? { ...entry, status: "fetching" } : entry)
    },
    fetch: true,
    job: { ...job, status: "fetching" }
  };
}

export function estimateBoxBytes(box) {
  const south = Number(box?.south);
  const north = Number(box?.north);
  const west = Number(box?.west);
  const east = Number(box?.east);
  if (![south, north, west, east].every(Number.isFinite) || north <= south || east <= west) {
    return { bytes: 0, text: "Draw a box with a north edge above the south edge. Nothing was downloaded." };
  }
  const heightKm = haversineKm({ latitude: south, longitude: west }, { latitude: north, longitude: west });
  const widthKm = haversineKm({ latitude: south, longitude: west }, { latitude: south, longitude: east });
  const area = heightKm * widthKm;
  const bytes = Math.round(area * 2000);
  return {
    bytes,
    text: `About ${formatBytes(bytes)} for this box. This is an estimate, not a measurement. The whole world is tens of gigabytes and is not offered. Nothing is downloaded until you approve.`
  };
}

export function nearestWater(store, origin) {
  const packs = store?.packs || [];
  if (!packs.length) {
    return { found: false, text: "No map pack is on this phone. I will not name a place that is not in a pack." };
  }
  if (!origin) {
    return { found: false, text: "GPS is off, so I will not guess where water is. Nothing was downloaded." };
  }
  let best = null;
  for (const pack of packs) {
    for (const line of pack.lines || []) {
      if (!line.water) continue;
      for (const point of line.points) {
        const distanceKm = haversineKm(origin, point);
        if (!best || distanceKm < best.distanceKm) best = { pack, line, distanceKm };
      }
    }
  }
  if (!best) {
    return { found: false, text: "No water is in the packs on this phone. I did not invent a lake or a stream." };
  }
  const distance = best.distanceKm >= 1 ? `${best.distanceKm.toFixed(1)} km` : `${Math.round(best.distanceKm * 1000)} m`;
  return {
    found: true,
    text: `${best.line.name} is about ${distance} from the fix, in ${best.pack.name}. ${best.pack.attribution} May be out of date.`
  };
}

export function elevationNear(store, origin) {
  if (!origin) return { found: false, text: "Turn on GPS to see the elevation where you are." };
  let best = null;
  for (const pack of store?.packs || []) {
    for (const line of pack.lines || []) {
      for (const point of line.points) {
        if (!Number.isFinite(point.ele)) continue;
        const distanceKm = haversineKm(origin, point);
        if (!best || distanceKm < best.distanceKm) best = { ele: point.ele, distanceKm, pack };
      }
    }
  }
  if (!best) {
    return { found: false, text: "Elevation and terrain isn't on this phone yet." };
  }
  return {
    found: true,
    text: `About ${Math.round(best.ele)} m in ${best.pack.name}, from a point in the file. May be out of date.`
  };
}

export function packShapes(store) {
  return (store?.packs || []).flatMap((pack) => pack.lines || []);
}
