// Guards for Dana's Map packs freeze (ANR) and the duplicated pack text.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { MAX_SEGMENTS, clipSegment, visibleSegments } from "./src/phone/map_segments.js";
import { addPack, aboutPackData, attributionLine, elevationNear, emptyPackStore, packCards, storageLine, validateImport } from "./symbolic/map_packs.js";

function worldPack(features = 80, points = 400) {
  const list = [];
  for (let f = 0; f < features; f += 1) {
    const coords = [];
    for (let p = 0; p < points; p += 1) coords.push([-180 + (p * 360) / points, -60 + f]);
    list.push({ type: "Feature", properties: { name: `c${f}` }, geometry: { type: "LineString", coordinates: coords } });
  }
  return JSON.stringify({ type: "FeatureCollection", features: list });
}

test("a world-size pack draws at most MAX_SEGMENTS clipped segments on the canvas", () => {
  const pack = validateImport("world.geojson", worldPack());
  const features = [...pack.lines, ...pack.lines];
  const origin = { latitude: 44.6, longitude: -70 };
  const project = (point) => ({ x: 180 + (point.longitude - origin.longitude) * 111 * 18, y: 300 - (point.latitude - origin.latitude) * 111 * 18 });
  const started = process.hrtime.bigint();
  const segments = visibleSegments(features, project, 360, 600);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(segments.length <= MAX_SEGMENTS);
  for (const segment of segments) {
    for (const point of [segment.from, segment.to]) {
      assert.ok(point.x >= -9 && point.x <= 369 && point.y >= -9 && point.y <= 609, "segment stays on screen");
    }
  }
  assert.ok(ms < 100, `segment pass took ${ms} ms`);
});

test("clipSegment trims a far line to the screen and drops one that misses it", () => {
  const clipped = clipSegment({ x: -100000, y: 50 }, { x: 100000, y: 50 }, 300, 300);
  assert.ok(clipped.from.x >= -8 && clipped.to.x <= 308);
  assert.equal(clipSegment({ x: -500, y: -500 }, { x: -400, y: -400 }, 300, 300), null);
});

test("Update replaces the same pack instead of stacking a second copy", () => {
  const first = { ...validateImport("ne.geojson", worldPack(2, 4)), catalogId: "natural-earth-overview", license: "Public domain", attribution: "Natural Earth", built: "2026-11-17" };
  const second = { ...validateImport("ne.geojson", worldPack(2, 4)), catalogId: "natural-earth-overview", license: "Public domain", attribution: "Natural Earth", built: "2026-11-18" };
  const one = addPack(emptyPackStore(), first).store;
  const two = addPack(one, second).store;
  assert.equal(two.packs.length, 1);
  assert.equal(two.usedBytes, second.bytes);
  const cards = packCards(two);
  assert.equal(cards.filter((card) => card.catalogId === "natural-earth-overview").length, 1);
  assert.equal(cards.some((card) => /Whole world/i.test(card.name)), false);
  const text = cards.map((card) => `${card.name} ${card.description} ${card.meta}`).join(" ");
  assert.doesNotMatch(text, /Public domain\. Public domain|SRTM|Copernicus|Review /);
  assert.equal(aboutPackData(two.packs[0]), "Natural Earth · public domain · built 18 Nov 2026. May be dated.");
  assert.doesNotMatch(attributionLine(two), /Public domain\. Public domain/);
  assert.equal(storageLine(two).startsWith("Using "), true);
  assert.equal(elevationNear(emptyPackStore(), { latitude: 1, longitude: 1 }).text, "Elevation and terrain isn't on this phone yet.");
});

test("Map packs screen does not run heavy work inside a press handler without yielding", () => {
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(app, /function yieldFrame\(\)/);
  const elevation = app.slice(app.indexOf("function startElevation()"), app.indexOf("function cancelElevation()"));
  assert.ok((elevation.match(/await yieldFrame\(\)/g) || []).length >= 4, "elevation loop yields between steps");
  assert.doesNotMatch(app, /Review \$\{item\.name\}|The whole world is not offered|SRTM|Copernicus/);
});
