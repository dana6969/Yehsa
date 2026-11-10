// Offline map packs. Nothing here opens a network connection.
// A download starts only when the caller passes approved: true.
// OSM's public tile servers are not used.

import { haversineKm } from "./landscape_math.js";

export const STORAGE_BUDGET_BYTES = 256 * 1024 * 1024;
const DRAW_CAP = 400;

export const PACK_CATALOG = [
  {
    id: "natural-earth-overview",
    name: "World overview",
    source: "Natural Earth 1:110m",
    license: "Public domain",
    attribution: "Natural Earth. Public domain.",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
    bytesEstimate: 800000,
    kind: "geojson",
    downloadable: true,
    note: "Country outlines only. Not streets and not a live city map."
  },
  {
    id: "geofabrik-rhode-island",
    name: "Rhode Island extract",
    source: "Geofabrik, OpenStreetMap",
    license: "ODbL 1.0",
    attribution: "© OpenStreetMap contributors. ODbL.",
    url: "https://download.geofabrik.de/north-america/us/rhode-island-latest.osm.pbf",
    bytesEstimate: 20000000,
    kind: "osm-pbf",
    downloadable: false,
    note: "Geofabrik permits this download. This build does not paint OSM protocol-buffer extracts, so it is not fetched. OSM public tile servers are not used."
  },
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

function pushPoint(points, longitude, latitude, ele) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
  if (points.length >= DRAW_CAP) return;
  const point = { latitude, longitude };
  if (Number.isFinite(ele)) point.ele = ele;
  points.push(point);
}

function walkCoords(coords, points, ele) {
  if (!Array.isArray(coords) || points.length >= DRAW_CAP) return;
  if (typeof coords[0] === "number") {
    pushPoint(points, Number(coords[0]), Number(coords[1]), ele);
    return;
  }
  for (const child of coords) walkCoords(child, points, ele);
}

function geometryOf(geo) {
  const lines = [];
  const features = geo?.type === "FeatureCollection"
    ? geo.features
    : geo?.type === "Feature"
      ? [geo]
      : geo?.type
        ? [{ type: "Feature", geometry: geo, properties: {} }]
        : [];
  for (const feature of features || []) {
    if (lines.length >= 80) break;
    const props = feature?.properties || {};
    const ele = Number(props.ele ?? props.elevation);
    const points = [];
    walkCoords(feature?.geometry?.coordinates, points, ele);
    if (points.length) {
      lines.push({
        points,
        water: /water|river|lake|spring|creek/i.test(`${props.natural || ""} ${props.waterway || ""} ${props.name || ""}`),
        name: String(props.name || props.natural || "shape").slice(0, 80)
      });
    }
  }
  return lines;
}

function finish(partial) {
  const lines = partial.lines || [];
  const points = lines.flatMap((line) => line.points);
  return {
    ok: true,
    id: partial.id,
    name: partial.name,
    format: partial.format,
    bytes: partial.bytes,
    bounds: boundsOf(points.length ? points : partial.boundPoints || []),
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

function parseGeoJson(name, text, bytes) {
  let geo;
  try {
    geo = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file is not valid GeoJSON. Nothing was added." };
  }
  const lines = geometryOf(geo);
  if (!lines.length) return { ok: false, reason: "That GeoJSON has no coordinates. Nothing was added." };
  const props = geo.properties || geo.features?.[0]?.properties || {};
  return finish({
    id: `import-${Date.now()}`,
    name: String(props.name || name || "GeoJSON"),
    format: "geojson",
    bytes,
    lines,
    built: props.date || props.built || null,
    source: props.source || "Imported GeoJSON",
    license: props.license || "Not stated in the file",
    attribution: props.attribution || "Attribution was not in the file.",
    paintsTiles: true,
    note: "Drawn from the file. May be out of date."
  });
}

function parseGpx(name, text, bytes) {
  if (!/<gpx[\s>]/i.test(text)) return { ok: false, reason: "That file is not GPX. Nothing was added." };
  const points = [];
  const pattern = /<(?:trkpt|wpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:trkpt|wpt|rtept)>/gi;
  let match;
  while ((match = pattern.exec(text)) && points.length < DRAW_CAP) {
    const lat = Number((match[1].match(/\blat="([^"]+)"/i) || [])[1]);
    const lon = Number((match[1].match(/\blon="([^"]+)"/i) || [])[1]);
    const ele = Number((match[2].match(/<ele>([^<]+)<\/ele>/i) || [])[1]);
    pushPoint(points, lon, lat, ele);
  }
  if (!points.length) return { ok: false, reason: "That GPX has no points. Nothing was added." };
  return finish({
    id: `import-${Date.now()}`,
    name: name || "GPX track",
    format: "gpx",
    bytes,
    lines: [{ points, water: false, name: "track" }],
    source: "Imported GPX",
    paintsTiles: true,
    note: "Track from the file. May be out of date."
  });
}

function parseKml(name, text, bytes) {
  if (!/<kml[\s>]|<coordinates>/i.test(text)) return { ok: false, reason: "That file is not KML. Nothing was added." };
  const points = [];
  const blocks = text.match(/<coordinates>[\s\S]*?<\/coordinates>/gi) || [];
  for (const block of blocks) {
    for (const token of block.replace(/<\/?coordinates>/gi, "").trim().split(/\s+/)) {
      const [lon, lat, ele] = token.split(",").map(Number);
      pushPoint(points, lon, lat, ele);
      if (points.length >= DRAW_CAP) break;
    }
  }
  if (!points.length) return { ok: false, reason: "That KML has no coordinates. Nothing was added." };
  return finish({
    id: `import-${Date.now()}`,
    name: name || "KML",
    format: "kml",
    bytes,
    lines: [{ points, water: false, name: "kml" }],
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

export function attributionLine(store) {
  const packs = store?.packs || [];
  if (!packs.length) return "No map pack. Blank landscape. No streets are stored.";
  return packs.map((pack) => {
    const when = pack.built || pack.importedAt || "date not in the file";
    return `${pack.name}. ${pack.attribution} ${pack.license}. Built ${when}. May be out of date.`;
  }).join(" ");
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
  if (item.bytesEstimate > current.budgetBytes - current.usedBytes) {
    return { store: current, fetch: false, reason: sizeWarning(item.bytesEstimate, current.budgetBytes - current.usedBytes) };
  }
  const job = {
    id: item.id,
    status: "fetching",
    received: 0,
    total: item.bytesEstimate,
    approved: true,
    url: item.url
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
  if (!origin) return { found: false, text: "GPS is off, so elevation is not looked up." };
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
    return { found: false, text: "No elevation is in the packs. SRTM and Copernicus are not downloaded, and no elevation service was called." };
  }
  return {
    found: true,
    text: `About ${Math.round(best.ele)} m in ${best.pack.name}, from a point in the file. May be out of date.`
  };
}

export function packShapes(store) {
  return (store?.packs || []).flatMap((pack) => pack.lines || []);
}
