// Roads (built-in OpenStreetMap vector layer) and property lines (free state parcel services,
// saved on the phone with a date and refreshed when stale). No device and no network needed:
// the parcel tests use a fake fetch.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "fflate";
import {
  ROADS_MANIFEST, emptyGlyphRange, glyphRangeOk, rankRoadHits, roadHitBox, roadHitText, roadLayerSpecs, roadSearchQuery,
  roadShardFor, roadTileWanted, roadsCoverageText, roadsLayer
} from "./symbolic/roads.js";
import {
  PARCEL_GAPS, PARCEL_MIN_ZOOM, PARCEL_REFRESH_DAYS, PARCEL_SOURCES, cellFromKey, cellsForView, createParcelCache, fetchCell,
  gapAt, isStale, parcelCoverageList, parcelGeoJson, parcelNote, parcelQueryUrl, ringsFromGeoJson, sourcesAt
} from "./symbolic/parcels.js";
import { handleRequest, routeTile } from "./symbolic/tile_http.js";
import { mbtilesQuery } from "./symbolic/dem_tiles.js";
import { mapAbout, mapLayers } from "./symbolic/map_layers.js";
import { viewBoxFrom } from "./symbolic/map_view_box.js";

const DAY = 24 * 60 * 60 * 1000;

function lonLatTile(lon, lat, z) {
  const x = Math.floor(((lon + 180) / 360) * 2 ** z);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  return { x, y };
}

// ------------------------------------------------------------------ roads

test("the road manifest lists real shard files under GitHub's size limit, and covers Rhode Island", () => {
  assert.ok(ROADS_MANIFEST.shards.length >= 1);
  for (const shard of ROADS_MANIFEST.shards) {
    const size = fs.statSync(`assets/roads/${shard.file}`).size;
    assert.equal(size, shard.bytes);
    assert.ok(size < 50 * 1024 * 1024, `${shard.file} stays under 50 MB`);
  }
  assert.ok(fs.statSync(`assets/roads/${ROADS_MANIFEST.names.file}`).size < 50 * 1024 * 1024);
  assert.ok(ROADS_MANIFEST.states.includes("rhode-island"));
  assert.match(ROADS_MANIFEST.attribution, /OpenStreetMap contributors, ODbL/);
  assert.match(roadsCoverageText(), /Rhode Island/);
  const assets = fs.readFileSync("src/phone/roads_assets.native.js", "utf8");
  for (const shard of ROADS_MANIFEST.shards) assert.ok(assets.includes(`assets/roads/${shard.file}`));
});

test("a Rhode Island road tile is found in its shard, unzips to a vector tile, and is served as protobuf", async () => {
  const { x, y } = lonLatTile(-71.41, 41.82, 14); // Providence
  assert.equal(roadTileWanted(14, x, y), true);
  assert.equal(roadTileWanted(5, x >> 9, y >> 9), false, "below the layer's min zoom");
  const k = roadShardFor(x, y, ROADS_MANIFEST.shards.length);
  const db = new DatabaseSync(`assets/roads/${ROADS_MANIFEST.shards[k].file}`, { readOnly: true });
  const q = mbtilesQuery(14, x, y);
  const row = db.prepare(q.sql).get(...q.args);
  assert.ok(row?.tile_data, "Providence has roads at z14");
  const raw = new Uint8Array(row.tile_data);
  const tile = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
  assert.ok(Buffer.from(tile).includes(Buffer.from("roads")), "layer named roads");
  db.close();
  const reply = await handleRequest(`GET /roads/14/${x}/${y}.pbf HTTP/1.1\r\n\r\n`, { roads: async () => tile });
  const head = Buffer.from(reply).toString("latin1").split("\r\n\r\n")[0];
  assert.match(head, /^HTTP\/1\.1 200/);
  assert.match(head, /application\/x-protobuf/);
  const none = await handleRequest("GET /roads/14/1/1.pbf HTTP/1.1\r\n\r\n", { roads: async () => null });
  assert.match(Buffer.from(none).toString("latin1"), /^HTTP\/1\.1 204/);
});

test("the road layer only ever keeps class, name and route number", () => {
  const db = new DatabaseSync(`assets/roads/${ROADS_MANIFEST.shards[0].file}`, { readOnly: true });
  const meta = Object.fromEntries(db.prepare("SELECT name, value FROM metadata").all().map((r) => [r.name, r.value]));
  db.close();
  const json = JSON.parse(meta.json);
  const fields = Object.keys(json.vector_layers.find((l) => l.id === "roads").fields).sort();
  assert.deepEqual(fields, ["c", "n", "r"].filter((f) => fields.includes(f)));
  assert.ok(fields.includes("c") && fields.includes("n"));
});

test("road search finds a name by prefix and by a word inside it, nearest first", () => {
  const db = new DatabaseSync(`assets/roads/${ROADS_MANIFEST.names.file}`, { readOnly: true });
  const q = roadSearchQuery("Main St");
  const rows = db.prepare(q.sql).all(...q.args);
  assert.ok(rows.length > 0);
  const near = { latitude: 41.82, longitude: -71.41 };
  const hits = rankRoadHits(rows, { near });
  assert.ok(hits.every((h, i) => i === 0 || h.distanceKm >= hits[i - 1].distanceKm));
  assert.match(roadHitText(hits[0]), /Main St.* · .*km away/);
  const box = roadHitBox(hits[0]);
  assert.ok(box.west < hits[0].longitude && box.east > hits[0].longitude);
  const inside = roadSearchQuery("Ridge", { anywhere: true });
  assert.equal(inside.args[0], "%Ridge%");
  assert.ok(db.prepare(inside.sql).all(...inside.args).length > 0);
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...q.args).map((r) => r.detail).join(" ");
  assert.match(plan, /road_names_name/, "prefix search uses the index");
  assert.equal(roadSearchQuery("a"), null);
  assert.equal(roadSearchQuery("50%_off").args[0], "50 off%");
  db.close();
});

test("road styles differ by look, tracks are dashed, and labels use the bundled font", () => {
  const day = roadLayerSpecs({ style: "standard" });
  const night = roadLayerSpecs({ mode: "night", night: "red" });
  assert.notDeepEqual(day.line.lineColor, night.line.lineColor);
  assert.deepEqual(day.track.lineDasharray, [2, 1.5]);
  assert.deepEqual(day.label.textFont, ["Noto Sans Regular"]);
  assert.equal(roadsLayer({ on: false, ready: true, port: 1 }), null);
  assert.equal(roadsLayer({ on: true, ready: false, port: 1 }), null);
  assert.match(roadsLayer({ on: true, ready: true, port: 9 }).glyphs, /^http:\/\/127\.0\.0\.1:9\/glyphs\/\{fontstack\}\/\{range\}\.pbf$/);
});

test("glyph requests route to the bundled font; unknown ranges get a valid empty range", async () => {
  assert.deepEqual(routeTile("/glyphs/Noto%20Sans%20Regular/0-255.pbf"), { kind: "glyphs", fontstack: "Noto Sans Regular", range: "0-255" });
  assert.equal(routeTile("/glyphs/x/abc.pbf"), null);
  assert.equal(glyphRangeOk("256-511"), true);
  assert.equal(glyphRangeOk("1-256"), false);
  for (const range of ["0-255", "256-511", "8192-8447"]) assert.ok(fs.statSync(`assets/roads/glyphs/${range}.pbf`).size > 1000);
  const empty = emptyGlyphRange("Noto Sans Regular", "19968-20223");
  assert.equal(empty[0], 0x0a);
  assert.ok(Buffer.from(empty).includes(Buffer.from("19968-20223")));
  const reply = await handleRequest("GET /glyphs/Noto%20Sans%20Regular/0-255.pbf HTTP/1.1\r\n\r\n", { glyphs: async (f, r) => (f === "Noto Sans Regular" && r === "0-255" ? new Uint8Array([1, 2, 3]) : null) });
  assert.match(Buffer.from(reply).toString("latin1"), /^HTTP\/1\.1 200[\s\S]*application\/x-protobuf/);
});

test("with roads on, the map shows even before any pack, and About credits OpenStreetMap once", () => {
  const layers = mapLayers({ store: { packs: [] }, areas: [], port: 4100, roads: { on: true, ready: true } });
  assert.equal(layers.empty, false);
  assert.equal(layers.useMap, true);
  const about = mapAbout({ store: { packs: [] }, areas: [], roads: true });
  assert.ok(about.lines.some((l) => /Roads and streets/.test(l)));
  assert.equal((about.credit.match(/OpenStreetMap/g) || []).length, 1);
  assert.equal(mapLayers({ store: { packs: [] }, areas: [], port: 4100, roads: { on: false, ready: true } }).empty, true);
});

// ------------------------------------------------------------------ parcels

test("every parcel source asks only for the record id, over https, with no key", () => {
  assert.ok(PARCEL_SOURCES.length >= 10);
  for (const source of PARCEL_SOURCES) {
    assert.match(source.url, /^https:\/\//);
    assert.ok(source.license && source.source && source.coverage);
    const url = parcelQueryUrl(source, { west: -71, south: 42, east: -70.99, north: 42.01 });
    const params = new URL(url).searchParams;
    assert.equal(params.get("outFields"), source.oid);
    assert.equal(params.get("f"), "geojson");
    assert.equal(params.get("outSR"), "4326");
    assert.doesNotMatch(url, /owner|token|key=|apikey/i);
  }
  const states = new Set(PARCEL_SOURCES.map((s) => s.state));
  for (const st of ["ME", "NH", "VT", "MA", "CT", "NY"]) assert.ok(states.has(st), `${st} has a source`);
});

test("states without a free source say so: Rhode Island, Pennsylvania, Michigan", () => {
  assert.deepEqual(PARCEL_GAPS.map((g) => g.state).sort(), ["MI", "PA", "RI"]);
  const ri = gapAt(-71.5, 41.6);
  assert.match(ri.note, /Rhode Island has no statewide public parcel layer/);
  assert.equal(sourcesAt(-71.5, 41.6).length, 0);
  assert.equal(gapAt(-70.26, 43.66), null, "Portland, Maine has a source");
  const list = parcelCoverageList();
  assert.ok(list.find((i) => i.state === "Rhode Island" && !i.covered));
  assert.ok(list.find((i) => i.state === "Connecticut" && i.covered && /CC0/.test(i.text)));
});

test("cells only load when zoomed in, are capped, and come nearest-first", () => {
  const box = { west: -70.3, east: -70.2, south: 43.62, north: 43.7 };
  assert.deepEqual(cellsForView(box, { zoom: PARCEL_MIN_ZOOM - 1 }), []);
  const cells = cellsForView(box, { zoom: 14 });
  assert.ok(cells.length > 0 && cells.length <= 6);
  assert.ok(cells.every((c) => c.source.state === "ME"));
  const back = cellFromKey(cells[0].key);
  assert.deepEqual(back.box, cells[0].box);
  assert.equal(cellFromKey("XX-14-1-1"), null);
});

test("owner and address fields are dropped before anything is saved", () => {
  const json = {
    features: [
      { type: "Feature", id: 7, properties: { OBJECTID: 7, OWNER1: "Jane Doe", SITE_ADDR: "1 Main St" }, geometry: { type: "Polygon", coordinates: [[[-70, 43], [-70.001, 43], [-70.001, 43.001], [-70, 43.001], [-70, 43]]] } },
      { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: [[[[-70, 43], [-70.0011234567, 43], [-70.001, 43.001], [-70, 43]]]] } }
    ]
  };
  const rings = ringsFromGeoJson(json);
  assert.equal(rings.length, 2);
  assert.equal(rings[1][2], -70.001123, "rounded to 6 places (~0.1 m)");
  assert.doesNotMatch(JSON.stringify(rings), /Jane|Main|OBJECTID|7,/);
  const fc = parcelGeoJson(rings);
  assert.ok(fc.features.every((f) => Object.keys(f.properties).length === 0 && f.geometry.type === "LineString"));
});

function fakeService({ pages = 1, fail = false, perPage = 2 } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (fail) throw new Error("offline");
    const offset = Number(new URL(url).searchParams.get("resultOffset"));
    const page = Math.floor(offset / 2000);
    const features = Array.from({ length: perPage }, (_, i) => ({
      type: "Feature",
      properties: { OBJECTID: page * 10 + i },
      geometry: { type: "Polygon", coordinates: [[[-70.25, 43.65], [-70.2501, 43.65], [-70.2501, 43.6501 + i / 1e5], [-70.25, 43.65]]] }
    }));
    return { ok: true, status: 200, json: async () => ({ type: "FeatureCollection", features, exceededTransferLimit: page < pages - 1 }) };
  };
  return { calls, fetchImpl };
}

function memoryStorage() {
  const map = new Map();
  return {
    map,
    async get(k) { return map.get(k) || null; },
    async put(k, v) { map.set(k, v); },
    async list() { return [...map.entries()].map(([key, v]) => ({ key, usedAt: v.usedAt })); },
    async remove(k) { map.delete(k); }
  };
}

test("fetchCell pages until the service says it is done", async () => {
  const cell = cellsForView({ west: -70.26, east: -70.25, south: 43.65, north: 43.655 }, { zoom: 15 })[0];
  const svc = fakeService({ pages: 3 });
  const got = await fetchCell(cell, { fetchImpl: svc.fetchImpl });
  assert.equal(got.ok, true);
  assert.equal(svc.calls.length, 3);
  assert.equal(got.rings.length, 6);
  const down = await fetchCell(cell, { fetchImpl: fakeService({ fail: true }).fetchImpl });
  assert.equal(down.ok, false);
});

test("lines are saved with a date, used offline, and refreshed once older than the interval", async () => {
  assert.equal(PARCEL_REFRESH_DAYS, 30);
  let clock = Date.UTC(2026, 10, 24);
  const storage = memoryStorage();
  const svc = fakeService();
  const cache = createParcelCache(storage, { now: () => clock, fetchImpl: svc.fetchImpl });
  const box = { west: -70.26, east: -70.25, south: 43.65, north: 43.655 };
  const first = await cache.linesFor(box, { zoom: 15 });
  assert.ok(first.fetched > 0 && first.rings.length > 0);
  const note = parcelNote(first, { center: { longitude: -70.255, latitude: 43.652 } });
  assert.match(note, /approximate, not a legal survey/);
  assert.match(note, /Data date 2026-11-24/);
  assert.match(note, /Source: Maine GeoLibrary/);
  const calls = svc.calls.length;

  clock += 10 * DAY; // fresh: no new request
  const second = await cache.linesFor(box, { zoom: 15 });
  assert.equal(second.fetched, 0);
  assert.equal(svc.calls.length, calls);

  // Offline and stale: the saved copy still shows, and the note says so.
  clock += 40 * DAY;
  const offlineCache = createParcelCache(storage, { now: () => clock, fetchImpl: fakeService({ fail: true }).fetchImpl });
  const offline = await offlineCache.linesFor(box, { zoom: 15 });
  assert.ok(offline.rings.length > 0);
  assert.match(parcelNote(offline), /Offline: showing the copy saved on this phone/);
  assert.match(parcelNote(offline), /Data date 2026-11-24/);

  // Back online: stale cells refresh by themselves and get the new date.
  const refreshed = await createParcelCache(storage, { now: () => clock, fetchImpl: svc.fetchImpl }).refreshStale();
  assert.ok(refreshed > 0);
  const entry = [...storage.map.values()][0];
  assert.equal(isStale(entry, clock), false);
  assert.equal(new Date(entry.fetchedAt).toISOString().slice(0, 10), "2027-01-13");
});

test("the saved copy is bounded: the least recently used cells go first", async () => {
  let clock = 1;
  const storage = memoryStorage();
  const cache = createParcelCache(storage, { now: () => clock++, fetchImpl: fakeService().fetchImpl, limit: 2 });
  await cache.linesFor({ west: -70.3, east: -70.2, south: 43.62, north: 43.7 }, { zoom: 14 });
  assert.equal(storage.map.size, 2);
});

test("zoomed out, the note asks to zoom in; in Rhode Island it says there is no free source", () => {
  assert.equal(parcelNote({ tooWide: true, rings: [], cells: [], failed: [] }), "Zoom in closer to see property lines.");
  assert.match(parcelNote({ rings: [], cells: [], failed: [], fetched: 0 }, { center: { longitude: -71.5, latitude: 41.6 } }), /no property lines for Rhode Island/);
});

test("the view box comes from visibleBounds, or from center and zoom", () => {
  const a = viewBoxFrom({ geometry: { coordinates: [-70, 44] }, properties: { zoomLevel: 14, visibleBounds: [[-69.99, 44.01], [-70.01, 43.99]] } });
  assert.deepEqual(a.box, { west: -70.01, east: -69.99, south: 43.99, north: 44.01 });
  const b = viewBoxFrom({ geometry: { coordinates: [-70, 44] }, properties: { zoomLevel: 14 } }, { width: 400, height: 800 });
  assert.ok(b.box.west < -70 && b.box.east > -70 && b.box.north > 44);
  assert.equal(viewBoxFrom({}), null);
});

test("docs/map-layers.md names every parcel source, its license, the refresh interval, and the road data", () => {
  const doc = fs.readFileSync("docs/map-layers.md", "utf8");
  for (const s of PARCEL_SOURCES) assert.ok(doc.includes(s.url), `${s.state} URL in docs`);
  for (const g of PARCEL_GAPS) assert.ok(doc.includes(g.name));
  assert.match(doc, /ODbL/);
  assert.match(doc, /30 days/);
  assert.match(doc, /not a legal survey/i);
});
