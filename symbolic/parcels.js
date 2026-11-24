import { inState } from "./state_outlines.js";

// Property lines for the Hunt map. Fetched online, only when the person turns the layer on, from
// free public parcel services run by state GIS offices; saved on the phone with the date so they
// work offline; refreshed by themselves when online and the saved copy is older than
// PARCEL_REFRESH_DAYS. Lines only: the query asks for the record id and the shape, never owner,
// address or value fields, and the id is thrown away before anything is saved.
// Approximate, not a legal survey. Sources and licenses: docs/map-layers.md.

export const PARCEL_REFRESH_DAYS = 30;
export const PARCEL_MIN_ZOOM = 13; // about 5 km across on a phone; wider views ask too much of the servers
export const PARCEL_CELL_ZOOM = 14; // one saved cell is a z14 tile, about 2 x 1.8 km in New England
export const PARCEL_MAX_CELLS_PER_VIEW = 6;
export const PARCEL_MAX_PAGES = 4; // up to 4 x page size parcels per cell
export const PARCEL_CACHE_LIMIT = 400; // cells kept on the phone (oldest use is dropped first)
const DAY_MS = 24 * 60 * 60 * 1000;

// state: two-letter code. bbox: [west, south, east, north], a rough outline used only to decide
// which service to ask. oid: the record-id field, the only attribute ever requested.
export const PARCEL_SOURCES = [
  {
    state: "ME", name: "Maine", bbox: [-71.1, 42.95, -66.9, 47.5],
    url: "https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer/10",
    oid: "OBJECTID", page: 2000,
    source: "Maine GeoLibrary, Maine Parcels Organized Towns (towns that submitted data)",
    license: "Public access; user assumes risk; not survey grade (Maine GeoLibrary terms).",
    coverage: "Organized towns that sent data to the Maine GeoLibrary. The Unorganized Territory and some towns are missing, and some towns' lines are many years old."
  },
  {
    state: "NH", name: "New Hampshire", bbox: [-72.56, 42.69, -70.6, 45.31],
    url: "https://nhgeodata.unh.edu/hosting/rest/services/Hosted/CAD_ParcelMosaic/FeatureServer/1",
    oid: "objectid", page: 2000,
    source: "NH GRANIT, NH Parcel Mosaic (data from NH Department of Revenue Administration)",
    license: "Public service for estimation and planning only, not for legal use (NH GRANIT terms).",
    coverage: "Statewide mosaic of town parcel maps; completeness varies by town."
  },
  {
    state: "VT", name: "Vermont", bbox: [-73.44, 42.72, -71.46, 45.02],
    url: "https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0",
    oid: "OBJECTID", page: 2000,
    source: "VCGI, Vermont Statewide Standardized Parcel Data",
    license: "VCGI open data; not a legal survey, planning use only (VCGI terms).",
    coverage: "Statewide; updated weekly by VCGI from town data."
  },
  {
    state: "MA", name: "Massachusetts", bbox: [-73.51, 41.23, -69.92, 42.89],
    url: "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0",
    oid: "OBJECTID", page: 2000,
    source: "MassGIS (Bureau of Geographic Information), Property Tax Parcels",
    license: "MassGIS public data; assessor mapping, not an authoritative boundary (MassGIS terms).",
    coverage: "All 351 cities and towns."
  },
  {
    state: "CT", name: "Connecticut", bbox: [-73.73, 40.98, -71.78, 42.05],
    url: "https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0",
    oid: "OBJECTID", page: 2000,
    source: "Connecticut Office of Policy and Management / CT GIS Office, CAMA and Parcel Layer",
    license: "CC0 (public domain dedication).",
    coverage: "All 169 towns."
  },
  {
    state: "NY", name: "New York", bbox: [-79.77, 40.49, -71.85, 45.02],
    url: "https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/arcgis/rest/services/NYS_Tax_Parcels_Public/FeatureServer/1",
    oid: "OBJECTID", page: 1000,
    source: "NYS ITS Geospatial Services, NYS Tax Parcels Public (contributing counties)",
    license: "Public map service, provided as is (NYS ITS terms).",
    coverage: "Only counties that share parcels publicly (about 38 of 62). Missing counties include Allegany, Cattaraugus, Chemung, Chenango, Clinton, Columbia, Delaware, Dutchess, Essex, Franklin, Fulton, Herkimer, Jefferson, Madison, Monroe, Nassau, Niagara, Orleans, Saratoga, Schenectady, Schoharie, Seneca, Washington and Yates."
  },
  {
    state: "WI", name: "Wisconsin", bbox: [-92.89, 42.49, -86.25, 47.31],
    url: "https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0",
    oid: "OBJECTID", page: 2000,
    source: "Wisconsin State Cartographer's Office / WLIP, Statewide Parcel Map Database (V12)",
    license: "Free for public use (Wisconsin Statewide Parcel Map Database terms).",
    coverage: "All 72 counties; updated once a year."
  },
  {
    state: "MN", name: "Minnesota", bbox: [-97.24, 43.5, -89.49, 49.38],
    url: "https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/FeatureServer/1",
    oid: "objectid", page: 2000,
    source: "MnGeo, Parcels compiled from opt-in open data counties",
    license: "Open data from counties that opted in to free distribution (MnGeo terms).",
    coverage: "Only counties that opted in (about 59 of 87)."
  },
  {
    state: "CO", name: "Colorado", bbox: [-109.06, 36.99, -102.04, 41.0],
    url: "https://gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/FeatureServer/0",
    oid: "OBJECTID", page: 2000,
    source: "State of Colorado OIT GIS, Colorado Public Parcels (accessed from gis.colorado.gov)",
    license: "Free with attribution to the State of Colorado; resale forbidden (Colorado OIT terms).",
    coverage: "About 44 of 64 counties."
  },
  {
    state: "MT", name: "Montana", bbox: [-116.05, 44.36, -104.04, 49.0],
    url: "https://gisservice.mt.gov/arcgis/rest/services/msdi_cadastral_map_v1/MapServer/1",
    oid: "OBJECTID", page: 2000,
    source: "Montana State Library, Montana Cadastral Framework (Department of Revenue data)",
    license: "Public, informational use only; not a legal survey (Montana State Library terms).",
    coverage: "All 56 counties; updated monthly."
  },
  {
    state: "ID", name: "Idaho", bbox: [-117.24, 41.99, -111.04, 49.0],
    url: "https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/Public_Idaho_Parcels_/FeatureServer/7",
    oid: "OBJECTID", page: 2000,
    source: "State of Idaho, Public Idaho Parcels (participating county assessors)",
    license: "Public; county data as is; no mailing-list use (Idaho Parcel Data Exchange terms).",
    coverage: "Only 13 of 44 counties: Ada, Bear Lake, Boise, Camas, Gooding, Jerome, Lincoln, Minidoka, Nez Perce, Oneida, Teton, Valley and Washington."
  },
  {
    state: "WY", name: "Wyoming", bbox: [-111.06, 40.99, -104.05, 45.01],
    url: "https://services3.arcgis.com/r0iJ85SKZ4zAzz3P/arcgis/rest/services/Wyoming_Parcels_for_2026/FeatureServer/0",
    oid: "FID", page: 2000,
    source: "Wyoming Department of Revenue, Wyoming Parcels for 2026",
    license: "Public service; no license text published (Wyoming Department of Revenue).",
    coverage: "All 23 counties; a new service is published each tax year."
  }
];

// States with a Yehsa map pack but no free statewide parcel source we could use.
export const PARCEL_GAPS = [
  { state: "RI", name: "Rhode Island", bbox: [-71.91, 41.14, -71.11, 42.02], note: "Rhode Island has no statewide public parcel layer yet (RIGIS lists it as a work in progress), so there are no property lines for Rhode Island." },
  { state: "PA", name: "Pennsylvania", bbox: [-80.52, 39.72, -74.69, 42.27], note: "Pennsylvania has no free statewide parcel layer; only some counties publish their own, so there are no property lines for Pennsylvania yet." },
  { state: "MI", name: "Michigan", bbox: [-90.42, 41.7, -82.41, 48.31], note: "Michigan has no free statewide parcel layer; only some counties publish their own, so there are no property lines for Michigan yet." }
];

const inBox = (b, lon, lat) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
const within = (entry, lon, lat) => inBox(entry.bbox, lon, lat) && inState(entry.state, lon, lat);

// Sources whose state holds a point.
export function sourcesAt(longitude, latitude) {
  return PARCEL_SOURCES.filter((s) => within(s, longitude, latitude));
}

// Sources for a map cell: any state holding its middle or a corner (so both sides of a border).
export function sourcesForBox(box) {
  const points = [
    [(box.west + box.east) / 2, (box.south + box.north) / 2],
    [box.west, box.south], [box.west, box.north], [box.east, box.south], [box.east, box.north]
  ];
  return PARCEL_SOURCES.filter((s) => points.some(([lon, lat]) => within(s, lon, lat)));
}

export function gapAt(longitude, latitude) {
  if (sourcesAt(longitude, latitude).length) return null;
  return PARCEL_GAPS.find((g) => within(g, longitude, latitude)) || null;
}

// ------------------------------------------------------------------ cells

function lonToX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToY(lat, z) {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

export function cellBox(z, x, y) {
  const n = 2 ** z;
  const lat = (t) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * t) / n))) * 180) / Math.PI;
  return { west: (x / n) * 360 - 180, east: ((x + 1) / n) * 360 - 180, north: lat(y), south: lat(y + 1) };
}

export function cellKey(source, x, y, z = PARCEL_CELL_ZOOM) {
  return `${source.state}-${z}-${x}-${y}`;
}

// The cells (and which source each asks) for a view box. Nearest the middle first, capped.
export function cellsForView(box, { zoom = PARCEL_MIN_ZOOM, max = PARCEL_MAX_CELLS_PER_VIEW } = {}) {
  if (!box || !(zoom >= PARCEL_MIN_ZOOM)) return [];
  const z = PARCEL_CELL_ZOOM;
  const x0 = lonToX(box.west, z);
  const x1 = lonToX(box.east, z);
  const y0 = latToY(box.north, z);
  const y1 = latToY(box.south, z);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cells = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      const b = cellBox(z, x, y);
      for (const source of sourcesForBox(b)) {
        cells.push({ key: cellKey(source, x, y, z), source, z, x, y, box: b, d: (x - cx) ** 2 + (y - cy) ** 2 });
      }
    }
  }
  cells.sort((a, b) => a.d - b.d);
  return cells.slice(0, max);
}

// ------------------------------------------------------------------ query

// ArcGIS REST query for the parcel shapes in one cell. Only the record id is requested; owner,
// address and value fields are never asked for. Shapes come back in WGS84, simplified to ~1 m.
export function parcelQueryUrl(source, box, { offset = 0 } = {}) {
  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${box.west.toFixed(6)},${box.south.toFixed(6)},${box.east.toFixed(6)},${box.north.toFixed(6)}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: source.oid,
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "6",
    maxAllowableOffset: "0.00001",
    resultOffset: String(offset),
    resultRecordCount: String(source.page),
    orderByFields: source.oid,
    f: "geojson"
  });
  return `${source.url}/query?${params.toString()}`;
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

// GeoJSON polygons -> outline rings as flat [lon, lat, lon, lat, ...] arrays. Every property
// (the record id included) is dropped here, so nothing about an owner can be saved or shown.
export function ringsFromGeoJson(json) {
  const rings = [];
  for (const feature of json?.features || []) {
    const g = feature?.geometry;
    if (!g) continue;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      for (const ring of poly || []) {
        if (!Array.isArray(ring) || ring.length < 4) continue;
        const flat = [];
        for (const pt of ring) {
          if (!Array.isArray(pt) || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
          flat.push(round6(pt[0]), round6(pt[1]));
        }
        if (flat.length >= 8) rings.push(flat);
      }
    }
  }
  return rings;
}

function withTimeout(fetchImpl, url, timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  return Promise.resolve(fetchImpl(url, { headers: { Accept: "application/geo+json, application/json" }, signal: controller?.signal }))
    .finally(() => timer && clearTimeout(timer));
}

// Fetches one cell (paging up to PARCEL_MAX_PAGES). Returns { ok, rings, partial } or { ok: false, error }.
export async function fetchCell(cell, { fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  if (typeof fetchImpl !== "function") return { ok: false, error: "no network" };
  const rings = [];
  let partial = false;
  try {
    for (let page = 0; page < PARCEL_MAX_PAGES; page += 1) {
      const res = await withTimeout(fetchImpl, parcelQueryUrl(cell.source, cell.box, { offset: page * cell.source.page }), timeoutMs);
      if (!res || !res.ok) return { ok: false, error: `the parcel service answered ${res?.status || "nothing"}` };
      const json = await res.json();
      if (json?.error) return { ok: false, error: "the parcel service refused the request" };
      rings.push(...ringsFromGeoJson(json));
      const count = (json?.features || []).length;
      const more = json?.exceededTransferLimit === true || json?.properties?.exceededTransferLimit === true || count >= cell.source.page;
      if (!more) break;
      if (page === PARCEL_MAX_PAGES - 1) partial = true;
    }
  } catch (error) {
    return { ok: false, error: /abort/i.test(String(error?.name || error)) ? "the parcel service took too long" : "no connection" };
  }
  return { ok: true, rings, partial };
}

// ------------------------------------------------------------------ the saved copy

export function isStale(entry, now = Date.now(), days = PARCEL_REFRESH_DAYS) {
  return !entry || !Number.isFinite(entry.fetchedAt) || now - entry.fetchedAt > days * DAY_MS;
}

function dateText(ms) {
  if (!Number.isFinite(ms)) return "unknown date";
  return new Date(ms).toISOString().slice(0, 10);
}

// storage: { get(key) -> entry|null, put(key, entry), list() -> [{key, usedAt}], remove(key) }
// One entry: { key, state, fetchedAt, usedAt, rings, partial }.
export function createParcelCache(storage, { now = () => Date.now(), fetchImpl = globalThis.fetch, limit = PARCEL_CACHE_LIMIT } = {}) {
  const inflight = new Map();

  async function trim() {
    const all = await storage.list();
    if (all.length <= limit) return;
    all.sort((a, b) => (a.usedAt || 0) - (b.usedAt || 0));
    for (const item of all.slice(0, all.length - limit)) await storage.remove(item.key);
  }

  async function refresh(cell) {
    if (inflight.has(cell.key)) return inflight.get(cell.key);
    const job = (async () => {
      const got = await fetchCell(cell, { fetchImpl });
      if (!got.ok) return { ok: false, error: got.error };
      const entry = { key: cell.key, state: cell.source.state, fetchedAt: now(), usedAt: now(), rings: got.rings, partial: got.partial };
      await storage.put(cell.key, entry);
      await trim();
      return { ok: true, entry };
    })().finally(() => inflight.delete(cell.key));
    inflight.set(cell.key, job);
    return job;
  }

  // Lines for a view: saved cells at once, then online fetches for missing or stale cells.
  // online: false means use only what is saved. Returns { rings, cells, notes, fetched, failed }.
  async function linesFor(box, { zoom, online = true } = {}) {
    const cells = cellsForView(box, { zoom });
    const out = { rings: [], cells: [], fetched: 0, failed: [], tooWide: !(zoom >= PARCEL_MIN_ZOOM) };
    for (const cell of cells) {
      let entry = await storage.get(cell.key);
      let fresh = false;
      if (online && isStale(entry, now())) {
        const got = await refresh(cell);
        if (got.ok) {
          entry = got.entry;
          fresh = true;
          out.fetched += 1;
        } else {
          out.failed.push(got.error);
        }
      }
      if (entry) {
        if (!fresh) await storage.put(cell.key, { ...entry, usedAt: now() });
        out.rings.push(...entry.rings);
        out.cells.push({ key: cell.key, state: entry.state, fetchedAt: entry.fetchedAt, partial: entry.partial, source: cell.source });
      }
    }
    return out;
  }

  // Refreshes every saved cell older than the interval (when the app is online). Small batches.
  async function refreshStale({ max = 12 } = {}) {
    const all = await storage.list();
    let done = 0;
    for (const item of all) {
      if (done >= max) break;
      const entry = await storage.get(item.key);
      if (!isStale(entry, now())) continue;
      const cell = cellFromKey(item.key);
      if (!cell) continue;
      const got = await refresh(cell);
      if (got.ok) done += 1;
    }
    return done;
  }

  return { linesFor, refresh, refreshStale, trim };
}

export function cellFromKey(key) {
  const m = /^([A-Z]{2})-(\d+)-(\d+)-(\d+)$/.exec(String(key || ""));
  if (!m) return null;
  const source = PARCEL_SOURCES.find((s) => s.state === m[1]);
  if (!source) return null;
  const z = Number(m[2]);
  const x = Number(m[3]);
  const y = Number(m[4]);
  return { key, source, z, x, y, box: cellBox(z, x, y) };
}

// Outline rings -> a GeoJSON FeatureCollection of lines with no properties at all.
export function parcelGeoJson(rings) {
  const features = [];
  for (const flat of rings || []) {
    const coords = [];
    for (let i = 0; i + 1 < flat.length; i += 2) coords.push([flat[i], flat[i + 1]]);
    if (coords.length >= 2) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  return { type: "FeatureCollection", features };
}

// The note under the map and in the layer sheet: approximate, date, source.
export function parcelNote(result, { center = null } = {}) {
  if (!result) return "";
  if (result.tooWide) return "Zoom in closer to see property lines.";
  const gap = center ? gapAt(center.longitude, center.latitude) : null;
  if (gap && !result.cells.length) return gap.note;
  if (!result.cells.length) {
    if (result.failed.length) return `Property lines could not load (${result.failed[0]}) and none are saved for this spot.`;
    return center && !sourcesAt(center.longitude, center.latitude).length ? "No free property-line source covers this spot." : "No property lines saved here yet.";
  }
  const oldest = Math.min(...result.cells.map((c) => c.fetchedAt));
  const sources = [...new Set(result.cells.map((c) => c.source.source))];
  const partial = result.cells.some((c) => c.partial) ? " Some lines in busy areas were left out." : "";
  const offline = result.failed.length && !result.fetched ? " Offline: showing the copy saved on this phone." : "";
  return `Property lines are approximate, not a legal survey. Data date ${dateText(oldest)}. Source: ${sources.join("; ")}.${partial}${offline}`;
}

// One line per state for the layer sheet: covered (with source and license) or not.
export function parcelCoverageList() {
  return [
    ...PARCEL_SOURCES.map((s) => ({ state: s.name, covered: true, text: `${s.name}: ${s.source}. ${s.coverage} License: ${s.license}` })),
    ...PARCEL_GAPS.map((g) => ({ state: g.name, covered: false, text: `${g.name}: no free source. ${g.note}` }))
  ].sort((a, b) => a.state.localeCompare(b.state));
}
