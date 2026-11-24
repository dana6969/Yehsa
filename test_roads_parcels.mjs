// Roads (built-in OpenStreetMap vector layer) and property lines (free state parcel services,
// saved on the phone with a date and refreshed when stale). No device and no network needed:
// the parcel tests use a fake fetch.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  GLYPH_RANGES, boxInside, emptyGlyphRange, glyphRange, glyphRangeOk, padBox, roadLayerSpecs, roadLinesFromGraph, roadMaxClassForZoom, roadsLayer
} from "./symbolic/roads.js";
import { createRouteService, regionsAt } from "./symbolic/routing/route_service.js";
import {
  PARCEL_GAPS, PARCEL_MIN_ZOOM, PARCEL_REFRESH_DAYS, PARCEL_SOURCES, cellFromKey, cellsForView, createParcelCache, fetchCell,
  gapAt, isStale, parcelCoverageList, parcelGeoJson, parcelNote, parcelQueryUrl, ringsFromGeoJson, sourcesAt
} from "./symbolic/parcels.js";
import { handleRequest, routeTile } from "./symbolic/tile_http.js";
import { mapAbout, mapLayers } from "./symbolic/map_layers.js";
import { viewBoxFrom } from "./symbolic/map_view_box.js";

const DAY = 24 * 60 * 60 * 1000;

const loadAsset = async (id, kind) => {
  const file = `assets/routing/${id}.${kind === "graph" ? "yrg" : "ypl"}`;
  if (!fs.existsSync(file)) return null;
  return kind === "graph" ? new Uint8Array(fs.readFileSync(file)) : fs.readFileSync(file, "utf8");
};

test("roads draw from the routing graphs (one copy of the roads), with class and name only", async () => {
  const svc = createRouteService({ loadAsset, fetchImpl: async () => { throw new Error("offline"); } });
  const providence = { longitude: -71.41, latitude: 41.82 };
  const region = regionsAt(providence)[0];
  assert.ok(region, "Providence is inside a road region");
  const box = { west: -71.42, east: -71.40, south: 41.815, north: 41.825 };
  const fc = await svc.roadsInBox(region.id, box, { maxClass: roadMaxClassForZoom(14) });
  const lines = roadLinesFromGraph([fc]);
  assert.ok(lines.features.length > 20, "downtown streets");
  assert.ok(lines.features.some((f) => f.properties.n), "street names");
  for (const f of lines.features) {
    assert.deepEqual(Object.keys(f.properties).filter((k) => !["c", "n"].includes(k)), []);
    assert.equal(f.geometry.type, "LineString");
  }
  const zoomedOut = roadLinesFromGraph([await svc.roadsInBox(region.id, box, { maxClass: roadMaxClassForZoom(9.5) })]);
  assert.ok(zoomedOut.features.length < lines.features.length);
  assert.ok(zoomedOut.features.every((f) => ["motorway", "primary"].includes(f.properties.c)));
  assert.ok(!fs.existsSync("assets/roads"), "no second copy of the roads is bundled");
});

test("road detail follows zoom, and a pan inside the padded box needs no new read", () => {
  assert.equal(roadMaxClassForZoom(8), -1);
  assert.equal(roadMaxClassForZoom(9.2), 2);
  assert.equal(roadMaxClassForZoom(12), 4);
  assert.equal(roadMaxClassForZoom(15), 8);
  const box = { west: -71, east: -70.9, south: 42, north: 42.1 };
  const padded = padBox(box, 0.4);
  assert.equal(boxInside({ west: -70.98, east: -70.89, south: 42.01, north: 42.11 }, padded), true);
  assert.equal(boxInside({ west: -71.2, east: -71.1, south: 42, north: 42.1 }, padded), false);
  assert.equal(roadLinesFromGraph([{ features: [{ properties: { cls: 9, name: "A trail" }, geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } }] }]).features.length, 0, "paths stay with the packs");
});

test("road styles differ by look, tracks are dashed, and labels use the bundled font", () => {
  const day = roadLayerSpecs({ style: "standard" });
  const night = roadLayerSpecs({ mode: "night", night: "red" });
  assert.notDeepEqual(day.line.lineColor, night.line.lineColor);
  assert.deepEqual(day.track.lineDasharray, [2, 1.5]);
  assert.deepEqual(day.label.textFont, ["Noto Sans Regular"]);
  const shape = { type: "FeatureCollection", features: [{ type: "Feature", properties: { c: "minor" }, geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } }] };
  assert.equal(roadsLayer({ on: false, port: 1, shape }), null);
  assert.equal(roadsLayer({ on: true, port: 1, shape: null }), null);
  assert.match(roadsLayer({ on: true, port: 9, shape }).glyphs, /^http:\/\/127\.0\.0\.1:9\/glyphs\/\{fontstack\}\/\{range\}\.pbf$/);
});

test("glyph requests route to the bundled font; unknown ranges get a valid empty range", async () => {
  assert.deepEqual(routeTile("/glyphs/Noto%20Sans%20Regular/0-255.pbf"), { kind: "glyphs", fontstack: "Noto Sans Regular", range: "0-255" });
  assert.equal(routeTile("/glyphs/x/abc.pbf"), null);
  assert.equal(glyphRangeOk("256-511"), true);
  assert.equal(glyphRangeOk("1-256"), false);
  for (const range of GLYPH_RANGES) assert.ok(glyphRange("Noto Sans Regular", range).length > 1000);
  assert.ok(glyphRange("Noto Sans Regular", "256-511").length < 100, "a range we do not ship is empty, not missing");
  const empty = emptyGlyphRange("Noto Sans Regular", "19968-20223");
  assert.equal(empty[0], 0x0a);
  assert.ok(Buffer.from(empty).includes(Buffer.from("19968-20223")));
  const reply = await handleRequest("GET /glyphs/Noto%20Sans%20Regular/0-255.pbf HTTP/1.1\r\n\r\n", { glyphs: async (f, r) => (f === "Noto Sans Regular" && r === "0-255" ? new Uint8Array([1, 2, 3]) : null) });
  assert.match(Buffer.from(reply).toString("latin1"), /^HTTP\/1\.1 200[\s\S]*application\/x-protobuf/);
});

test("with roads on, the map shows even before any pack, and About credits OpenStreetMap once", () => {
  const layers = mapLayers({ store: { packs: [] }, areas: [], port: 4100, roads: { on: true, shape: null } });
  assert.equal(layers.empty, false);
  assert.equal(layers.useMap, true);
  assert.match(layers.glyphs, /127\.0\.0\.1:4100\/glyphs/);
  const about = mapAbout({ store: { packs: [] }, areas: [], roads: true });
  assert.ok(about.lines.some((l) => /Roads and streets/.test(l)));
  assert.equal((about.credit.match(/OpenStreetMap/g) || []).length, 1);
  assert.equal(mapLayers({ store: { packs: [] }, areas: [], port: 4100, roads: { on: false } }).empty, true);
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
  assert.match(doc, /roadsInBox/);
  assert.match(doc, /30 days/);
  assert.match(doc, /not a legal survey/i);
});
