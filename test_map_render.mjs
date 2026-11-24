// Proves tiles get decoded and drawn, that the map layers come back the same after a remount,
// and that delete-with-Undo and the loopback tile server behave. No device needed:
// the drawing code is plain typed-array code, and the phone's SQLite reader shares one query.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { encode, decode } from "fast-png";
import { renderTerrainRgba, paddedGrid, contourInterval, elevationFromRgba, tileLatitude } from "./symbolic/terrain_render.js";
import { handleRequest, routeTile, isLoopback, contentTypeFor, buildResponse } from "./symbolic/tile_http.js";
import { createPackTiles } from "./symbolic/pack_tiles.js";
import { mbtilesQuery } from "./symbolic/dem_tiles.js";
import { mapLayers, MAP_STYLES } from "./symbolic/map_layers.js";
import { initialHost, mapViewKey, nextHost, rememberCamera, shouldMountMap } from "./symbolic/map_host.js";
import { createUndoable } from "./symbolic/area_undo.js";
import { addPack, emptyPackStore } from "./symbolic/map_packs.js";
import { planArea, areasTotalBytes, areaBytes } from "./symbolic/area_download.js";

const N = 256;

// A made-up landscape: a sea on the left, two hills, a valley between them. Meters.
function landscape() {
  const g = new Float32Array(N * N);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const hill1 = 420 * Math.exp(-(((x - 150) ** 2) + ((y - 90) ** 2)) / 2600);
      const hill2 = 300 * Math.exp(-(((x - 210) ** 2) + ((y - 190) ** 2)) / 1800);
      g[y * N + x] = x < 40 ? -20 : 30 + hill1 + hill2 + x * 0.2;
    }
  }
  return g;
}

// Terrarium: meters = r*256 + g + b/256 - 32768
function terrariumPng(grid) {
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < grid.length; i += 1) {
    const v = grid[i] + 32768;
    data[i * 4] = Math.floor(v / 256);
    data[i * 4 + 1] = Math.floor(v) % 256;
    data[i * 4 + 2] = Math.floor((v - Math.floor(v)) * 256);
    data[i * 4 + 3] = 255;
  }
  return encode({ width: N, height: N, data, channels: 4 });
}

function drawn(z = 11) {
  const png = decode(terrariumPng(landscape()));
  const elev = elevationFromRgba(png.data, png.width, png.height);
  const padded = paddedGrid((dx, dy) => (dx === 0 && dy === 0 ? elev : null), N, N);
  return { elev, rgba: renderTerrainRgba(padded, { width: N, height: N, z, latitude: 44.5 }) };
}

function stats(rgba) {
  const colors = new Set();
  let min = 255;
  let max = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    colors.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
    const l = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
    min = Math.min(min, l);
    max = Math.max(max, l);
  }
  return { colors: colors.size, range: max - min };
}

test("a Terrarium tile decodes to the elevations that went in", () => {
  const png = decode(terrariumPng(landscape()));
  const elev = elevationFromRgba(png.data, png.width, png.height);
  const src = landscape();
  for (const i of [0, 5000, 20000, 40000, 65535]) assert.ok(Math.abs(elev[i] - src[i]) < 0.5, `pixel ${i}`);
});

test("terrain draws as color, hillshade, contour lines and water, never one flat color", () => {
  const { rgba } = drawn(11);
  const s = stats(rgba);
  assert.ok(s.colors > 300, `${s.colors} distinct colors`);
  assert.ok(s.range > 60, `light range ${s.range}`);
  // Sea on the left is blue. Land is not.
  const px = (x, y) => [rgba[(y * N + x) * 4], rgba[(y * N + x) * 4 + 1], rgba[(y * N + x) * 4 + 2]];
  const sea = px(10, 100);
  assert.ok(sea[2] > sea[0], "sea is bluish");
  const land = px(100, 20);
  assert.ok(land[1] >= land[2], "land is greenish or tan");
  // Hillshade: the side of the hill facing the light is brighter than the far side.
  const lit = px(130, 90);
  const shaded = px(175, 90);
  assert.notDeepEqual(lit, shaded);
  // Contour lines: some pixels carry the contour brown.
  let lines = 0;
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i] > rgba[i + 2] + 40 && rgba[i + 1] < rgba[i] - 20 && rgba[i] < 200) lines += 1;
  assert.ok(lines > 200, `${lines} contour pixels`);
});

test("contour spacing follows the zoom, and low zooms stay uncluttered", () => {
  assert.ok(contourInterval(12) < contourInterval(10) && contourInterval(10) < contourInterval(8));
  assert.equal(contourInterval(5), 0);
});

test("neighboring tiles join with no seam: a ridge crossing the edge keeps its shading", () => {
  const left = new Float32Array(N * N).map((_, i) => 100 + (i % N) * 3);
  const right = new Float32Array(N * N).map((_, i) => 100 + (N + (i % N)) * 3);
  const neighbors = { "1,0": right };
  const joined = paddedGrid((dx, dy) => (dx === 0 && dy === 0 ? left : neighbors[`${dx},${dy}`] || null), N, N);
  const alone = paddedGrid((dx, dy) => (dx === 0 && dy === 0 ? left : null), N, N);
  const a = renderTerrainRgba(joined, { width: N, height: N, z: 11, latitude: 45 });
  const b = renderTerrainRgba(alone, { width: N, height: N, z: 11, latitude: 45 });
  const edge = ((100 * N) + (N - 1)) * 4;
  const inner = ((100 * N) + (N - 20)) * 4;
  assert.equal(a[inner], b[inner]);
  assert.ok(Math.abs(a[edge] - a[inner]) < 14, "the edge column matches its neighbors");
});

// ---- tiles from a real MBTiles file, served over the loopback server, decoded and drawn

function makeMbtiles() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE metadata (name TEXT, value TEXT); CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);");
  const { rgba } = drawn(11);
  const png = encode({ width: N, height: N, data: new Uint8Array(rgba.buffer), channels: 4 });
  const z = 11;
  const x = 631;
  const y = 740;
  db.prepare("INSERT INTO tiles VALUES (?,?,?,?)").run(z, x, (2 ** z) - 1 - y, png); // TMS row
  return { db, z, x, y, png };
}

test("a tile in an MBTiles pack is found by its map address, served, decoded and drawn", async () => {
  const { db, z, x, y } = makeMbtiles();
  const getTile = async (tz, tx, ty) => {
    const q = mbtilesQuery(tz, tx, ty);
    const row = db.prepare(q.sql).get(...q.args);
    return row ? new Uint8Array(row.tile_data) : null;
  };
  const tiles = createPackTiles();
  tiles.set([{ id: "t", bounds: { west: -70, south: 44, east: -69, north: 45 }, minZoom: 8, maxZoom: 12, getTile }]);
  const reply = await handleRequest(`GET /pack/${z}/${x}/${y} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`, { pack: (a, b, c) => tiles.get(a, b, c) });
  const head = new TextDecoder().decode(reply.subarray(0, 120));
  assert.match(head, /^HTTP\/1\.1 200 OK/);
  assert.match(head, /Content-Type: image\/png/);
  const body = reply.subarray(reply.length - Number(/Content-Length: (\d+)/.exec(head)[1]));
  const png = decode(body);
  assert.equal(png.width, N);
  assert.ok(stats(png.data).colors > 300, "the served tile is the drawn terrain, not a blank");
  // A tile that isn't in the pack is a clean 404, and so is one outside the pack's zooms.
  assert.match(new TextDecoder().decode((await handleRequest(`GET /pack/${z}/${x + 1}/${y} HTTP/1.1\r\n\r\n`, { pack: (a, b, c) => tiles.get(a, b, c) })).subarray(0, 20)), /404/);
  assert.equal(await tiles.get(14, 1, 1), null);
});

test("the tile server answers GET on known paths only, and only to this phone", async () => {
  assert.match(new TextDecoder().decode((await handleRequest("POST /pack/1/0/0 HTTP/1.1\r\n\r\n", {})).subarray(0, 20)), /405/);
  assert.equal(routeTile("/pack/3/9/0"), null, "x out of range");
  assert.equal(routeTile("/etc/passwd"), null);
  assert.deepEqual(routeTile("/area/9/150/184.png"), { kind: "area", z: 9, x: 150, y: 184 });
  assert.equal(isLoopback("127.0.0.1"), true);
  assert.equal(isLoopback("192.168.1.20"), false);
  assert.equal(contentTypeFor(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), "image/webp");
  assert.equal(buildResponse(200, new Uint8Array(3), "image/png").length > 3, true);
  const src = fs.readFileSync("src/phone/tile_server.native.js", "utf8");
  assert.match(src, /127\.0\.0\.1/);
  assert.match(src, /isLoopback/);
  assert.doesNotMatch(src, /0\.0\.0\.0/);
});

test("the Android build allows plain http to 127.0.0.1 and nowhere else", () => {
  const { XML } = require_plugin();
  assert.match(XML, /cleartextTrafficPermitted="false"/);
  assert.match(XML, /<domain includeSubdomains="false">127\.0\.0\.1<\/domain>/);
  assert.doesNotMatch(XML, /<domain[^>]*>(?!127\.0\.0\.1|localhost)[^<]+<\/domain>/);
  assert.match(fs.readFileSync("app.json", "utf8"), /withLoopbackCleartext/);
});
function require_plugin() {
  const text = fs.readFileSync("plugins/withLoopbackCleartext.js", "utf8");
  return { XML: text.match(/const XML = `([\s\S]*?)`;/)[1] };
}

// ---- layers and remount

function storeWithPack() {
  const pack = {
    ok: true, id: "pack-ri", catalogId: "ri", name: "Rhode Island", kind: "mbtiles", format: "mbtiles", file: "pack-ri.mbtiles",
    bytes: 6 * 1024 * 1024, bounds: { west: -71.9, south: 41.1, east: -71.1, north: 42.02 }, minZoom: 5, maxZoom: 13,
    license: "ODbL 1.0", attribution: "© OpenStreetMap contributors; AWS Terrain Tiles; NLCD 2021", source: "Yehsa pack", built: "2026-11-17", lines: []
  };
  return addPack(emptyPackStore(), pack).store;
}

const AREA = { id: "a1", name: "50 km area", box: { west: -70.3, south: 44.1, east: -69.3, north: 44.9 }, zooms: [8, 9, 10, 11], done: ["terrain:8/80/94"], status: "complete", rendered: true, renderBytes: 3000, receivedBytes: 1000 };

test("with nothing on the phone the map says so, with Lucky's words, instead of drawing bare outlines", () => {
  const layers = mapLayers({ store: emptyPackStore(), areas: [], port: 4000 });
  assert.equal(layers.empty, true);
  assert.equal(layers.useMap, false);
  assert.equal(layers.attribution, "No map pack yet.");
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(app, /No map pack yet/);
  assert.match(app, /Download a region to see land, water, and terrain\. The map stays quiet until a pack is on this phone\./);
  assert.match(app, /Layers and packs/);
});

test("a pack or a saved area gives the map a tile layer, at the right zoom range and size", () => {
  const withPack = mapLayers({ store: storeWithPack(), areas: [], port: 4000 });
  assert.equal(withPack.useMap, true);
  assert.equal(withPack.rasters.length, 1);
  assert.equal(withPack.rasters[0].template, "http://127.0.0.1:4000/pack/{z}/{x}/{y}");
  assert.equal(withPack.rasters[0].tileSize, 256);
  assert.equal(withPack.rasters[0].maxZoom, 13);
  const withArea = mapLayers({ store: emptyPackStore(), areas: [AREA], port: 4000 });
  assert.equal(withArea.useMap, true);
  assert.equal(withArea.rasters[0].template, "http://127.0.0.1:4000/area/{z}/{x}/{y}");
  assert.equal(withArea.rasters[0].maxZoom, 11);
  assert.deepEqual(withArea.firstFocus, AREA.box);
  // The earlier bug: "Done 104 of 104 tiles" but the map stayed black. An area that is downloaded
  // but not drawn yet is not claimed as drawn, and once drawn it is.
  const undrawn = mapLayers({ store: emptyPackStore(), areas: [{ ...AREA, rendered: false }], port: 4000 });
  assert.equal(undrawn.rasters.length, 0);
});

test("before the tile server is ready the map still draws, and the tiles join when the port is known", () => {
  const early = mapLayers({ store: storeWithPack(), areas: [AREA], port: null });
  assert.equal(early.useMap, true);
  assert.equal(early.waitingForTiles, true);
  assert.equal(early.rasters.length, 0);
  assert.equal(mapLayers({ store: storeWithPack(), areas: [AREA], port: 4000 }).waitingForTiles, false);
});

test("styles: Standard, Terrain, Simple, Night; Night follows the display and keeps the night tint", () => {
  assert.deepEqual(MAP_STYLES.map((s) => s.label), ["Standard", "Terrain", "Simple", "Night"]);
  const base = { store: storeWithPack(), areas: [], port: 4000 };
  assert.equal(mapLayers({ ...base, style: "standard" }).tint, null);
  assert.notDeepEqual(mapLayers({ ...base, style: "terrain" }).paint, mapLayers({ ...base, style: "simple" }).paint);
  assert.equal(mapLayers({ ...base, style: "night" }).styleLabel, "Night");
  const nightMode = mapLayers({ ...base, mode: "night", night: "red" });
  assert.equal(nightMode.styleLabel, "Night");
  assert.ok(nightMode.tint.opacity > 0);
  assert.notEqual(mapLayers({ ...base, mode: "night", night: "amber" }).tint.color, nightMode.tint.color);
});

test("roads only come from the built-in OpenStreetMap layer, and parcel lines carry no owner data", () => {
  // Without the road switch, the packs and areas draw exactly what they drew before.
  const layers = mapLayers({ store: storeWithPack(), areas: [AREA], port: 4000 });
  assert.equal(layers.roads, null);
  const { roads, ...rest } = layers;
  assert.doesNotMatch(JSON.stringify(rest).replace(/OpenStreetMap/g, ""), /road|street|parcel|owner/i);
  const withRoads = mapLayers({ store: storeWithPack(), areas: [AREA], port: 4000, roads: { on: true, ready: true } });
  assert.equal(withRoads.roads.template, "http://127.0.0.1:4000/roads/{z}/{x}/{y}.pbf");
  assert.match(withRoads.attribution, /OpenStreetMap contributors, ODbL/);
  const src = fs.readFileSync("src/phone/OfflineMap.native.js", "utf8");
  assert.doesNotMatch(src, /owner/i);
  assert.doesNotMatch(src, /https?:\/\/(?!127\.0\.0\.1)/, "the map view never names an outside server");
});

test("remount: Map, Ask, Field, Map builds a fresh map view and draws the same layers", () => {
  const inputs = { store: storeWithPack(), areas: [AREA], port: 4000 };
  const before = mapLayers(inputs);
  let host = initialHost();
  assert.equal(shouldMountMap(host, before), false, "nothing is built before the Map screen shows");
  host = nextHost(host, true); // open Map
  const firstKey = mapViewKey(host);
  assert.equal(shouldMountMap(host, before), true);
  host = nextHost(host, false); // go to Ask
  assert.equal(shouldMountMap(host, before), false, "the hidden screen holds no GL view that could lose its layers");
  host = nextHost(host, false); // Field
  host = nextHost(host, true); // back to Map
  assert.notEqual(mapViewKey(host), firstKey, "a new view is built, so sources and layers are added again");
  assert.equal(shouldMountMap(host, before), true);
  const after = mapLayers(inputs);
  assert.deepEqual(after, before, "the same saved data gives the same layers");
  assert.equal(nextHost(host, true), host, "no rebuild while it stays visible");
});

test("the map comes back where it was left", () => {
  let cam = null;
  cam = rememberCamera(cam, { geometry: { coordinates: [-69.808, 44.514] }, properties: { zoomLevel: 11.4 } });
  assert.deepEqual(cam, { center: [-69.808, 44.514], zoom: 11.4 });
  assert.deepEqual(rememberCamera(cam, { geometry: {}, properties: {} }), cam, "a bad event keeps the last good camera");
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(app, /key=\{mapViewKey\(host\)\}/);
  assert.match(app, /shouldMountMap\(host, layers\)/);
  assert.match(app, /active=\{visible === "map"\}/);
  const view = fs.readFileSync("src/phone/OfflineMap.native.js", "utf8");
  assert.match(view, /onRegionDidChange/);
  assert.match(view, /initialCamera/);
});

// ---- area download then draw

test("a 50 km area plans tiles at several zooms, so there is something to draw as you zoom in", () => {
  const plan = planArea({ around: { latitude: 44.514, longitude: -69.808, radiusKm: 50 } });
  assert.equal(plan.ok, true);
  const zooms = [...new Set(plan.tiles.map((t) => t.z))];
  assert.ok(zooms.length >= 3, `zooms ${zooms}`);
  assert.ok(Math.max(...zooms) >= 11, "fine enough to read hills at his spot");
  assert.equal(areasTotalBytes([AREA]), areaBytes(AREA));
  assert.ok(areaBytes(AREA) >= 3000, "the drawn copy is counted in storage");
});

// ---- delete with Undo

test("Delete removes the row at once, shows Undo, and removes the files after the window", async () => {
  const timers = [];
  const removed = [];
  const toasts = [];
  const u = createUndoable({
    removeFiles: async (id) => removed.push(id),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: (id) => { timers[id - 1].cleared = true; },
    onChange: (v) => toasts.push(v && v.text)
  });
  const list = [AREA, { ...AREA, id: "a2" }];
  const after = u.remove(list, AREA, "50 km area");
  assert.deepEqual(after.map((a) => a.id), ["a2"]);
  assert.equal(toasts.at(-1), "50 km area removed.");
  assert.deepEqual(removed, [], "files stay for Undo");
  const back = u.undo(after);
  assert.deepEqual(back.map((a) => a.id).sort(), ["a1", "a2"]);
  assert.equal(timers[0].cleared, true);
  assert.equal(toasts.at(-1), null);
  assert.deepEqual(removed, []);
  // Not undone: after the window the files go.
  u.remove(back, AREA, "50 km area");
  await timers[1].fn();
  assert.deepEqual(removed, ["a1"]);
  assert.equal(u.pending(), null);
  // A second delete settles the first one for good.
  u.remove(list, AREA, "A");
  u.remove([list[1]], list[1], "B");
  assert.deepEqual(removed, ["a1", "a1"]);
});

test("the sheet shows one storage line, and a toast with Undo for removed areas", () => {
  const sheet = fs.readFileSync("src/phone/MapPacksSheet.js", "utf8");
  assert.match(sheet, /storageLine\(store, areasTotalBytes\(areas\)\)/);
  const area = fs.readFileSync("src/phone/DownloadArea.js", "utf8");
  assert.match(area, /Undo/);
  assert.doesNotMatch(area, /storageLine/);
});

test("an area saved by an older build (no zoom list) still reads its zoom range from its tiles", () => {
  const legacy = { id: "old", name: "50 km area", box: AREA.box, done: ["terrain:8/80/94", "terrain:8/81/94"], status: "complete", rendered: true };
  const layers = mapLayers({ store: emptyPackStore(), areas: [legacy], port: 4000 });
  assert.equal(layers.rasters[0].minZoom, 8);
  assert.equal(layers.rasters[0].maxZoom, 8);
});
