// Import a map file: every format, read in small chunks, with plain errors.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { importTextFile, describePick, extensionKind, sniffKind, mbtilesPackFrom, IMPORT_MESSAGES, CHUNK_BYTES } from "./symbolic/map_import.js";
import { addPack, emptyPackStore, packShapes } from "./symbolic/map_packs.js";
import { MAX_VERTICES, createUtf8Stream } from "./symbolic/geo_stream.js";

// A reader that hands the file out a few bytes at a time, like the phone reads base64 chunks.
function chunked(text, size) {
  const bytes = new TextEncoder().encode(text);
  let reads = 0;
  return { bytes, size: bytes.length, reads: () => reads, readChunk: async (pos, len) => { reads += 1; return bytes.subarray(pos, Math.min(pos + len, bytes.length)); } };
}

async function run(name, text, kind, extra = {}) {
  const file = chunked(text, 0);
  let yields = 0;
  const result = await importTextFile({ name, size: file.size, kind, readChunk: file.readChunk, yieldFrame: async () => { yields += 1; }, ...extra });
  return { result, yields, reads: file.reads() };
}

const GEOJSON = JSON.stringify({
  type: "FeatureCollection",
  properties: { name: "Camp loop", license: "CC0", attribution: "Dana" },
  features: [
    { type: "Feature", properties: { name: "Trail" }, geometry: { type: "LineString", coordinates: [[-69.8, 44.5], [-69.81, 44.51], [-69.82, 44.52]] } },
    { type: "Feature", properties: { name: "Pond", natural: "water" }, geometry: { type: "Polygon", coordinates: [[[-69.7, 44.4], [-69.69, 44.4], [-69.69, 44.41], [-69.7, 44.4]]] } },
    { type: "Feature", properties: { name: "Two parts" }, geometry: { type: "MultiLineString", coordinates: [[[-70, 44], [-70.1, 44.1]], [[-71, 45], [-71.1, 45.1]]] } },
    { type: "Feature", properties: { name: "Stand é" }, geometry: { type: "Point", coordinates: [-69.9, 44.6] } }
  ]
});

const GPX = `<?xml version="1.0"?><gpx version="1.1" creator="t"><wpt lat="44.5" lon="-69.8"><name>Truck</name><ele>120</ele></wpt>
<trk><name>Ridge</name><trkseg><trkpt lat="44.5" lon="-69.8"><ele>100</ele></trkpt><trkpt lat="44.51" lon="-69.81"><ele>110</ele></trkpt><trkpt lat="44.52" lon="-69.82"/></trkseg></trk>
<rte><name>Walk out</name><rtept lat="44.6" lon="-69.9"/><rtept lat="44.61" lon="-69.91"/></rte></gpx>`;

const KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>Fire road</name><LineString><coordinates>-69.8,44.5,0 -69.81,44.51,0 -69.82,44.52,0</coordinates></LineString></Placemark>
<Placemark><name>Spring</name><Point><coordinates>-69.7,44.4,0</coordinates></Point></Placemark>
<Placemark><name>Lake Pocket</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-69.7,44.4 -69.69,44.4 -69.69,44.41 -69.7,44.4</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Document></kml>`;

test("GeoJSON in 7-byte pieces, with a letter split across pieces, still reads whole", async () => {
  const bytes = new TextEncoder().encode(GEOJSON);
  const seen = [];
  const result = await importTextFile({
    name: "camp.geojson", size: bytes.length, kind: "geojson", yieldFrame: async () => {},
    readChunk: async (pos) => bytes.subarray(pos, Math.min(pos + 7, bytes.length)),
    onProgress: (p) => seen.push(p.done)
  });
  assert.equal(result.ok, true);
  assert.ok(result.pack.lines.some((l) => l.name === "Stand é"), "the split é survived");
  assert.equal(seen.at(-1), bytes.length);
});

test("GeoJSON becomes a pack that the map can draw", async () => {
  const { result, yields } = await run("camp.geojson", GEOJSON, "geojson");
  assert.equal(result.ok, true);
  assert.equal(result.pack.name, "Camp loop");
  assert.equal(result.pack.license, "CC0");
  const names = result.pack.lines.map((l) => l.name);
  assert.ok(names.includes("Trail") && names.includes("Pond") && names.includes("Stand é"));
  assert.equal(result.pack.lines.filter((l) => l.name === "Two parts").length, 2, "multi-part stays separate");
  assert.ok(result.pack.lines.find((l) => l.name === "Pond").ring, "polygons are marked as rings for land fill");
  assert.ok(yields >= 1, "the screen gets a turn after each chunk");
  const store = addPack(emptyPackStore(), result.pack).store;
  assert.ok(packShapes(store).length >= 5);
});

test("a one-feature GeoJSON and a bare geometry still import", async () => {
  const one = JSON.stringify({ type: "Feature", properties: { name: "Solo" }, geometry: { type: "LineString", coordinates: [[-69, 44], [-69.1, 44.1]] } });
  assert.equal((await run("one.json", one, "geojson")).result.ok, true);
  const bare = JSON.stringify({ type: "LineString", coordinates: [[-69, 44], [-69.1, 44.1]] });
  assert.equal((await run("bare.geojson", bare, "geojson")).result.ok, true);
});

test("GPX: track, route and waypoint", async () => {
  const { result } = await run("hike.gpx", GPX, "gpx");
  assert.equal(result.ok, true);
  const lines = result.pack.lines;
  assert.ok(lines.some((l) => l.points.length === 3), "the track");
  assert.ok(lines.some((l) => l.name === "Walk out" && l.points.length === 2), "the route");
  assert.ok(lines.some((l) => l.single && l.name === "Truck"), "the waypoint");
  assert.equal(lines.find((l) => l.points.length === 3).points[0].ele, 100);
});

test("KML: line, point and polygon, and a water name is marked as water", async () => {
  const { result } = await run("area.kml", KML, "kml");
  assert.equal(result.ok, true);
  assert.equal(result.pack.lines.length, 3);
  assert.equal(result.pack.lines.find((l) => l.name === "Lake Pocket").water, true);
});

test("every format reads the same with the file cut into tiny pieces", async () => {
  for (const [name, text, kind] of [["a.geojson", GEOJSON, "geojson"], ["a.gpx", GPX, "gpx"], ["a.kml", KML, "kml"]]) {
    const whole = await run(name, text, kind);
    const bytes = new TextEncoder().encode(text);
    const small = await importTextFile({
      name, size: bytes.length, kind, yieldFrame: async () => {},
      readChunk: async (pos, len) => bytes.subarray(pos, Math.min(pos + 13, bytes.length))
    });
    assert.equal(small.ok, true, `${kind} in 13-byte pieces`);
    assert.equal(small.pack.lines.length, whole.result.pack.lines.length, `${kind} same lines`);
    assert.deepEqual(small.pack.lines.map((l) => l.points.length), whole.result.pack.lines.map((l) => l.points.length));
  }
});

test("the UTF-8 reader keeps a letter that is split between two chunks", () => {
  const bytes = new TextEncoder().encode("Café ☃ 𝄞");
  for (let cut = 1; cut < bytes.length; cut += 1) {
    const s = createUtf8Stream();
    const text = s.push(bytes.subarray(0, cut)) + s.push(bytes.subarray(cut)) + s.end();
    assert.equal(text, "Café ☃ 𝄞", `cut at ${cut}`);
  }
});

test("a very large file is thinned, not frozen, and stays within the vertex cap", async () => {
  const coords = Array.from({ length: 60000 }, (_, i) => [-69 - i * 1e-5, 44 + i * 1e-5]);
  const text = JSON.stringify({ type: "FeatureCollection", features: Array.from({ length: 6 }, () => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } })) });
  const { result, reads, yields } = await run("big.geojson", text, "geojson");
  assert.equal(result.ok, true);
  assert.equal(result.truncated, true);
  const total = result.pack.lines.reduce((n, l) => n + l.points.length, 0);
  assert.ok(total <= MAX_VERTICES, `kept ${total} vertices`);
  assert.ok(reads > 5 && yields === reads, `many chunks (${reads}), one yield after each (${yields})`);
  assert.ok(Math.max(...result.pack.lines.map((l) => l.points.length)) <= 20001);
});

test("cancel stops the read between chunks", async () => {
  const controller = new AbortController();
  const file = chunked(GEOJSON.repeat(1), 0);
  const result = await importTextFile({
    name: "x.geojson", size: file.size, kind: "geojson", signal: controller.signal,
    readChunk: async (pos, len) => { controller.abort(); return file.readChunk(pos, 20); },
    yieldFrame: async () => {}
  });
  assert.equal(result.ok, false);
  assert.equal(result.canceled, true);
});

test("plain errors: empty, damaged, unsupported, too large, vector tiles", async () => {
  assert.equal((await run("e.geojson", JSON.stringify({ type: "FeatureCollection", features: [] }), "geojson")).result.reason, IMPORT_MESSAGES.empty);
  assert.equal((await run("e.gpx", "<gpx></gpx>", "gpx")).result.ok, false);
  const bad = await run("bad.geojson", "{ not json at all", "geojson");
  assert.equal(bad.result.ok, false);
  assert.match(bad.result.reason, /couldn't read|no map geometry/i);
  assert.equal((await run("p.txt", "hello", "txt")).result.reason, IMPORT_MESSAGES.unsupported);
  assert.match(IMPORT_MESSAGES.unsupported, /^This file type isn't supported\. Use GeoJSON, GPX, KML, or MBTiles\.$/);
  assert.equal(describePick({ name: "x.mbtiles", size: 500 }, { room: 100 }).reason, IMPORT_MESSAGES.tooLarge);
  assert.equal(describePick({ name: "x.pmtiles", size: 5 }).reason, IMPORT_MESSAGES.pmtiles);
  const ok = describePick({ name: "x.gpx", size: 2048 }, { room: 50 * 1024 * 1024 });
  assert.equal(ok.ok, true);
  assert.equal(ok.words, "A GPS track");
  assert.match(ok.text, /2 KB/);
  const huge = await importTextFile({ name: "h.geojson", size: 400 * 1024 * 1024, kind: "geojson", readChunk: async () => new Uint8Array(1) });
  assert.equal(huge.reason, IMPORT_MESSAGES.tooLargeText);
  const mbt = mbtilesPackFrom({ id: "i", name: "v.mbtiles", bytes: 10, meta: { format: "pbf" }, summary: { tiles: 5, minZoom: 1, maxZoom: 5 } });
  assert.equal(mbt.reason, IMPORT_MESSAGES.vector);
  assert.equal(mbtilesPackFrom({ id: "i", name: "v.mbtiles", bytes: 10, meta: {}, summary: { tiles: 0 } }).reason, IMPORT_MESSAGES.empty);
});

test("MBTiles with picture tiles becomes a tile pack that keeps its own license text", () => {
  const pack = mbtilesPackFrom({
    id: "import-1", name: "Hunting unit.mbtiles", bytes: 5 * 1024 * 1024,
    meta: { name: "Hunting unit", format: "png", bounds: "-70,44,-69,45", minzoom: "6", maxzoom: "13", attribution: "© Someone", description: "Data from OpenStreetMap, ODbL" },
    summary: { tiles: 100, minZoom: 6, maxZoom: 13 }
  });
  assert.equal(pack.kind, "mbtiles");
  assert.equal(pack.file, "import-1.mbtiles");
  assert.deepEqual(pack.bounds, { west: -70, south: 44, east: -69, north: 45 });
  assert.equal(pack.license, "ODbL 1.0");
  assert.equal(pack.minZoom, 6);
  const none = mbtilesPackFrom({ id: "i2", name: "n.mbtiles", bytes: 1, meta: { format: "png" }, summary: { tiles: 1, minZoom: 3, maxZoom: 4 } });
  assert.equal(none.license, "Not stated in the file", "never invents a license");
});

test("the file name can lie: the first bytes decide", () => {
  assert.equal(sniffKind(new TextEncoder().encode("SQLite format 3\0")), "mbtiles");
  assert.equal(sniffKind(new TextEncoder().encode("PMTiles")), "pmtiles");
  assert.equal(sniffKind(new TextEncoder().encode('\uFEFF<?xml version="1.0"?><gpx>')), "gpx");
  assert.equal(sniffKind(new TextEncoder().encode("  {\"type\":")), "geojson");
  assert.equal(sniffKind(new TextEncoder().encode("MZ binary")), null);
  assert.equal(extensionKind("Trip.GPX"), "gpx");
  assert.equal(extensionKind("a.json"), "geojson");
  assert.equal(extensionKind("a.zip"), null);
  assert.ok(CHUNK_BYTES <= 256 * 1024, "chunks stay small enough to keep the screen moving");
});

test("the phone importer uses the system picker and copies on the phone, never through JavaScript", () => {
  const src = fs.readFileSync("src/phone/map_import.native.js", "utf8");
  assert.match(src, /getDocumentAsync/);
  assert.match(src, /copyToCacheDirectory:\s*false/);
  assert.match(src, /copyAsync/);
  assert.match(src, /readChunk/);
  assert.doesNotMatch(src, /readAsStringAsync\([^)]*\)\s*;?\s*\n\s*const text/);
  const sheet = fs.readFileSync("src/phone/MapPacksSheet.js", "utf8");
  assert.match(sheet, /Add to this phone/);
  assert.match(sheet, /Cancel/);
});
