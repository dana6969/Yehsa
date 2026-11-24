import assert from "node:assert/strict";
import test from "node:test";
import {
  KINDS, TEXT, addMark, assessMarks, boxAround, clearMarks, marksOf, nextName, normalizeSpots, removeMark,
  restoreAll, restoreMark, sightingMarks, toSpots, updateMark, whereText
} from "./symbolic/hunt/marks.js";
import { chooseApex, coneView, labelPoint } from "./symbolic/hunt/cone_view.js";
import { hasSavedForecastWind, isManualWind, resetWindPatch, savedForecastLine } from "./symbolic/hunt/wind_source.js";
import { conePolygon, scentCone } from "./symbolic/hunt/scent.js";
import { makeSaved } from "./symbolic/hunt/nws.js";

const HERE = { latitude: 44.55, longitude: -69.63 };
const T = Date.UTC(2026, 10, 17, 22, 0);

function huntWith(wind, extra = {}) {
  return { wind: { fromPoint: "", speedClass: "light", swirling: false, source: "manual", ...wind }, manual: { tempF: "", precip: "", windMph: "" }, saved: null, ...extra };
}

test("default names count up per kind and do not reuse a number still on the map", () => {
  let marks = [];
  marks = addMark(marks, { kind: "stand", ...HERE }).marks;
  marks = addMark(marks, { kind: "stand", ...HERE }).marks;
  assert.deepEqual(marks.map((m) => m.name), ["Stand 1", "Stand 2"]);
  marks = removeMark(marks, marks[0].id).marks;
  assert.equal(nextName(marks, "stand"), "Stand 1");
  assert.equal(nextName(marks, "trail"), "Trail 1");
  marks = addMark(marks, { kind: "sighting", ...HERE }).marks;
  assert.equal(marks.at(-1).name, "Sighting");
  assert.equal(nextName(marks, "sighting"), "Sighting 2");
});

test("a mark drops where you tapped, not at your fix, and bad spots are refused", () => {
  const tap = { latitude: 44.6, longitude: -69.7 };
  const r = addMark([], { kind: "bedding", ...tap });
  assert.equal(r.ok, true);
  assert.equal(r.mark.latitude, 44.6);
  assert.equal(addMark([], { kind: "bedding", latitude: 99, longitude: 0 }).ok, false);
  assert.equal(addMark([], { kind: "moose", ...HERE }).ok, false);
});

test("edit renames, changes type, and moves; blank names fall back to a default", () => {
  let marks = addMark([], { kind: "stand", ...HERE }).marks;
  const id = marks[0].id;
  marks = updateMark(marks, id, { name: "  Oak ridge  " }).marks;
  assert.equal(marks[0].name, "Oak ridge");
  marks = updateMark(marks, id, { kind: "bedding" }).marks;
  assert.equal(marks[0].kind, "bedding");
  assert.equal(marks[0].name, "Oak ridge");
  marks = updateMark(marks, id, { latitude: 44.7, longitude: -69.8 }).marks;
  assert.equal(marks[0].latitude, 44.7);
  marks = updateMark(marks, id, { name: "   " }).marks;
  assert.equal(marks[0].name, "Bedding 1");
  assert.equal(updateMark(marks, "nope", { name: "x" }).ok, false);
});

test("a default name follows a type change, a typed name does not", () => {
  let marks = addMark([], { kind: "stand", ...HERE }).marks;
  marks = updateMark(marks, marks[0].id, { kind: "trail" }).marks;
  assert.equal(marks[0].name, "Trail 1");
});

test("delete can be undone in place, and Clear all can be undone", () => {
  let marks = [];
  for (const kind of ["stand", "trail", "bedding"]) marks = addMark(marks, { kind, ...HERE }).marks;
  const before = marks.map((m) => m.id);
  const gone = removeMark(marks, marks[1].id);
  assert.equal(gone.marks.length, 2);
  assert.deepEqual(restoreMark(gone.marks, gone.removed, gone.index).map((m) => m.id), before);
  assert.deepEqual(restoreMark(restoreMark(gone.marks, gone.removed, gone.index), gone.removed, gone.index).length, 3);
  const cleared = clearMarks(marks);
  assert.equal(cleared.marks.length, 0);
  assert.deepEqual(restoreAll(cleared.marks, cleared.removed).map((m) => m.id), before);
});

test("old stands and avoid lists still read as marks", () => {
  const old = { stands: [{ name: "Stand 1", latitude: 44.5, longitude: -69.6, kind: "stand" }], avoid: [{ name: "Bedding 1", latitude: 44.51, longitude: -69.6, kind: "bedding" }, { name: "Trail 2", latitude: 44.52, longitude: -69.6, kind: "trail" }] };
  const marks = marksOf(old);
  assert.deepEqual(marks.map((m) => [m.name, m.kind]), [["Stand 1", "stand"], ["Bedding 1", "bedding"], ["Trail 2", "trail"]]);
  assert.deepEqual(marksOf(undefined), []);
  assert.deepEqual(marksOf({ stands: [], avoid: [] }), []);
  // The new shape round-trips.
  assert.deepEqual(marksOf(toSpots(marks)).map((m) => m.name), marks.map((m) => m.name));
  assert.equal(normalizeSpots({ marks: [{ kind: "stand", latitude: "x", longitude: 1 }] }).marks.length, 0);
});

test("logged sightings with a point show as read-only sighting marks", () => {
  const log = { entries: [{ id: "a", t: T, spot: { latitude: 44.5, longitude: -69.5 } }, { id: "b", t: T, spot: null }] };
  const list = sightingMarks(log);
  assert.equal(list.length, 1);
  assert.equal(list[0].fromLog, true);
  assert.equal(list[0].kind, "sighting");
});

test("the cone points downwind, from you when there is a fix", () => {
  const view = coneView({ hunt: huntWith({ fromPoint: "W", speedClass: "light" }), fix: HERE, marks: [], now: T });
  assert.equal(view.ok, true);
  assert.equal(view.cone.downwindDeg, 90);
  assert.equal(view.label, "Scent cone · downwind E · about 30°");
  assert.equal(view.apex.kind, "you");
  assert.ok(view.polygon.length >= 4);
  // Every point of the cone is east of the apex.
  assert.ok(view.polygon.slice(1, -1).every((p) => p.longitude > HERE.longitude));
  assert.deepEqual(view.polygon[0], view.polygon.at(-1));
  assert.ok(labelPoint(view));
});

test("the cone follows the wind live: a new wind gives a new cone, a cleared one gives none", () => {
  const w = coneView({ hunt: huntWith({ fromPoint: "W" }), fix: HERE, marks: [], now: T });
  const n = coneView({ hunt: huntWith({ fromPoint: "N" }), fix: HERE, marks: [], now: T });
  assert.equal(n.cone.downwindDeg, 180);
  assert.notDeepEqual(w.polygon, n.polygon);
  const none = coneView({ hunt: huntWith({}), fix: HERE, marks: [], now: T });
  assert.equal(none.ok, false);
  assert.equal(none.message, TEXT.noWind);
  assert.equal(none.polygon.length, 0);
});

test("light swirling air widens the cone to 60 degrees", () => {
  const view = coneView({ hunt: huntWith({ fromPoint: "W", speedClass: "calm", swirling: true }), fix: HERE, marks: [], now: T });
  assert.equal(view.cone.widthDeg, 60);
  assert.match(view.label, /about 60°/);
});

test("no fix and no stand: wind is known but there is no cone, with the plain message", () => {
  const view = coneView({ hunt: huntWith({ fromPoint: "W" }), fix: null, marks: [], now: T });
  assert.equal(view.ok, false);
  assert.equal(view.message, TEXT.noFix);
  assert.equal(view.polygon.length, 0);
});

test("with no fix the cone starts at a stand, the chosen one first", () => {
  let marks = addMark([], { kind: "stand", latitude: 44.5, longitude: -69.6 }).marks;
  marks = addMark(marks, { kind: "stand", latitude: 44.6, longitude: -69.6 }).marks;
  assert.equal(chooseApex(null, marks, null).name, "Stand 1");
  assert.equal(chooseApex(null, marks, marks[1].id).name, "Stand 2");
  assert.equal(chooseApex(HERE, marks, null).kind, "you");
  assert.equal(chooseApex(HERE, marks, marks[1].id).name, "Stand 2");
  assert.equal(chooseApex(null, [], null), null);
  const view = coneView({ hunt: huntWith({ fromPoint: "W" }), fix: null, marks, now: T });
  assert.equal(view.ok, true);
  assert.equal(view.apex.name, "Stand 1");
});

test("marks in the cone say At risk, outside say Out of cone, in words", () => {
  const inCone = { id: "t", name: "Trail 4", kind: "trail", latitude: HERE.latitude, longitude: HERE.longitude + 0.0008 };
  const off = { id: "b", name: "Bedding 2", kind: "bedding", latitude: HERE.latitude + 0.004, longitude: HERE.longitude };
  const far = { id: "s", name: "Sighting", kind: "sighting", latitude: HERE.latitude, longitude: HERE.longitude + 0.05 };
  const view = coneView({ hunt: huntWith({ fromPoint: "W", speedClass: "light" }), fix: HERE, marks: [inCone, off, far], now: T });
  const words = Object.fromEntries(view.assessed.map((a) => [a.mark.id, a.word]));
  assert.deepEqual(words, { t: "At risk", b: "Out of cone", s: "Out of cone" });
});

test("a stand is Clear when the wind carries your scent away from marked trails and bedding, At risk when not", () => {
  const stand = { id: "st", name: "Stand 1", kind: "stand", latitude: HERE.latitude, longitude: HERE.longitude };
  const east = { id: "bd", name: "Bedding 2", kind: "bedding", latitude: HERE.latitude, longitude: HERE.longitude + 0.0008 };
  const west = { id: "bw", name: "Bedding 3", kind: "bedding", latitude: HERE.latitude, longitude: HERE.longitude - 0.0008 };
  const wind = huntWith({ fromPoint: "W" }); // blows toward the east
  const bad = coneView({ hunt: wind, fix: null, marks: [stand, east], now: T }).assessed.find((a) => a.mark.id === "st");
  assert.equal(bad.word, "At risk");
  assert.match(bad.reason, /Bedding 2/);
  const good = coneView({ hunt: wind, fix: null, marks: [stand, west], now: T }).assessed.find((a) => a.mark.id === "st");
  assert.equal(good.word, "Clear");
  const lone = coneView({ hunt: wind, fix: null, marks: [stand], now: T }).assessed[0];
  assert.equal(lone.word, "Clear");
  assert.match(lone.reason, /No trails or bedding/);
});

test("two stands with the same name are judged on their own", () => {
  const a = { id: "a", name: "Stand", kind: "stand", latitude: HERE.latitude, longitude: HERE.longitude };
  const b = { id: "b", name: "Stand", kind: "stand", latitude: HERE.latitude + 0.01, longitude: HERE.longitude };
  const bed = { id: "x", name: "Bedding 1", kind: "bedding", latitude: HERE.latitude, longitude: HERE.longitude + 0.0008 };
  const cone = scentCone({ fromDeg: 270, cls: "light" });
  const out = assessMarks([a, b, bed], cone, { ...HERE, kind: "you", name: "you" });
  assert.equal(out[0].word, "At risk");
  assert.equal(out[1].word, "Clear");
});

test("reset puts the wind back to the saved forecast", () => {
  const saved = makeSaved({ savedAt: T - 12 * 60000, hourly: [{ start: T - 1800000, end: T + 1800000, windFrom: "SW", windMph: 5, tempF: 40, rainChance: 10 }] });
  const manual = huntWith({ fromPoint: "N" }, { saved });
  assert.equal(isManualWind(manual), true);
  assert.equal(coneView({ hunt: manual, fix: HERE, marks: [], now: T }).wind.source, "manual");
  const patch = resetWindPatch();
  const after = { ...manual, wind: patch.wind, manual: { ...manual.manual, windMph: patch.manualMph } };
  assert.equal(isManualWind(after), false);
  const view = coneView({ hunt: after, fix: HERE, marks: [], now: T });
  assert.equal(view.wind.source, "saved forecast");
  assert.equal(Math.round(view.cone.fromDeg), 225);
  assert.equal(hasSavedForecastWind(after, T), true);
  assert.match(savedForecastLine(after, T), /^Saved forecast: SW 5 mph · updated 12 min ago\. This phone has no wind sensor\.$/);
  assert.match(savedForecastLine(huntWith({}), T), /No saved forecast wind/);
});

test("where a mark sits is said in words", () => {
  const apex = { ...HERE, kind: "you", name: "you" };
  assert.match(whereText(apex, { latitude: HERE.latitude, longitude: HERE.longitude - 0.002 }), /^west of you, \d+ m$/);
  assert.equal(whereText(null, HERE), "");
  const box = boxAround(HERE);
  assert.ok(box.north > HERE.latitude && box.south < HERE.latitude && box.east > HERE.longitude && box.west < HERE.longitude);
});

test("the cone polygon stays closed and has no road or parcel data", () => {
  const poly = conePolygon(HERE, scentCone({ fromDeg: 0, cls: "strong" }), 10);
  assert.deepEqual(poly[0], poly.at(-1));
  assert.equal(KINDS.map((k) => k.id).join(), "stand,trail,bedding,sighting");
});

import { readFileSync } from "node:fs";

test("the standalone Wind diagram is gone and Wind opens the Hunt map", () => {
  const wind = readFileSync("./src/phone/WindScreen.js", "utf8");
  assert.ok(!/ConeDiagram/.test(wind));
  const field = readFileSync("./src/phone/FieldPane.js", "utf8");
  assert.ok(!/WindScreen/.test(field));
  assert.match(field, /onOpenWind\(\)/);
  const hud = readFileSync("./src/phone/HuntHud.js", "utf8");
  assert.match(hud, /onOpenWind \? onOpenWind\(\)/);
  const app = readFileSync("./src/phone/YehsaApp.js", "utf8");
  assert.match(app, /onOpenWind=\{\(\) => \{ setTab\("map"\); setHuntRequest/);
  const native = readFileSync("./src/phone/OfflineMap.native.js", "utf8");
  assert.match(native, /scent-cone-fill/);
});

// ---- map layout: cone on the canvas map, About this map, state chips

import fs from "node:fs";
import { coneShape } from "./symbolic/hunt/cone_view.js";
import { aboutThisMap, mapAbout, mapLayers } from "./symbolic/map_layers.js";
import { addPack, emptyPackStore } from "./symbolic/map_packs.js";

test("the canvas map (no pack) draws the cone outline and a fill, and nothing off screen", () => {
  const view = coneView({ hunt: huntWith({ fromPoint: "W", speedClass: "light" }), fix: HERE, now: T });
  const project = (p) => ({ x: 160 + (p.longitude - HERE.longitude) * 40000, y: 180 - (p.latitude - HERE.latitude) * 55000 });
  const shape = coneShape(view.polygon, project, 320, 360);
  assert.equal(shape.edges.length, view.polygon.length - 1);
  assert.ok(shape.dots.length > 0);
  assert.ok(shape.dots.every((d) => d.x >= 0 && d.x <= 320 && d.y >= 0 && d.y <= 360));
  // Downwind of a west wind is east: the fill sits right of the apex.
  assert.ok(shape.dots.every((d) => d.x >= 159));
  assert.deepEqual(coneShape([], project, 320, 360), { edges: [], dots: [] });
  const land = fs.readFileSync("src/phone/LandscapeMap.js", "utf8");
  assert.match(land, /overlay\?\.markers/);
  assert.match(land, /MarkPin/);
  assert.match(land, /onTap/);
});

function packStore() {
  const pack = {
    ok: true, id: "pack-me-n", catalogId: "me-north-woods", name: "Maine, North Woods", kind: "mbtiles", format: "mbtiles", file: "me-north-woods.mbtiles",
    bytes: 6 * 1024 * 1024, bounds: { west: -70.3, south: 45.2, east: -68.3, north: 47.4 }, minZoom: 6, maxZoom: 12, license: "ODbL 1.0 (OpenStreetMap parts); public domain (terrain, land cover)",
    attribution: "Elevation: AWS Terrain Tiles (USGS 3DEP, SRTM, GMTED, ETOPO1; public domain). Land cover: NLCD 2021 (USGS/MRLC, public domain). Water, trails, protected areas: (c) OpenStreetMap contributors, ODbL 1.0.",
    built: "2026-11-17", lines: []
  };
  return addPack(emptyPackStore(), pack).store;
}
const AREA = { id: "a1", name: "50 km area", box: { west: -70.3, south: 44.1, east: -69.3, north: 44.9 }, zooms: [8, 9], done: ["terrain:8/80/94"], status: "complete", rendered: true };

test("About this map credits the Elevation source once, even with a pack and a downloaded area", () => {
  const layers = mapLayers({ store: packStore(), areas: [AREA], port: 4000 });
  assert.equal((layers.attribution.match(/AWS Terrain Tiles/g) || []).length, 1);
  const about = mapAbout({ store: packStore(), areas: [AREA] });
  assert.equal(about.credit, layers.attribution);
  assert.equal((about.credit.match(/Elevation:/g) || []).length, 1);
  assert.equal((about.credit.match(/May be dated/g) || []).length, 1);
  assert.ok(about.lines.includes("Maine, North Woods. Land, water, trails, place names, and terrain. No roads."));
  const onlyArea = aboutThisMap({ packs: [], drawn: [AREA] });
  assert.match(onlyArea.credit, /^Elevation: AWS Terrain Tiles/);
  assert.equal(aboutThisMap({}).credit, "No map pack yet.");
});

test("under the map is one About this map link, not a credit paragraph", () => {
  for (const file of ["src/phone/OfflineMap.js", "src/phone/OfflineMap.native.js"]) {
    const src = fs.readFileSync(file, "utf8");
    assert.match(src, /onAbout \? <AboutMapLink/);
  }
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(app, /onAbout=\{/);
  assert.match(app, /About this map<\/Text>/);
  assert.match(fs.readFileSync("src/phone/hunt_map_ui.js", "utf8"), />About this map</);
});

test("Hunt state chips are one scrolling row, and the legal card does not crush the map", () => {
  const hud = fs.readFileSync("src/phone/HuntHud.js", "utf8");
  assert.match(hud, /<Chips scroll label="State"/);
  assert.doesNotMatch(hud, /maxHeight: 280/);
  assert.match(hud, /maxHeight: sheetMax/);
  const ui = fs.readFileSync("src/phone/hunt_ui.js", "utf8");
  assert.match(ui, /horizontal/);
  assert.match(ui, /flexWrap: "nowrap"/);
  assert.match(ui, /export function orderChips/);
});

// ---- drag to move, and sightings from a mark

import { moveMark, undoMove } from "./symbolic/hunt/marks.js";

test("a finger drag moves a mark to where it was let go, and Undo puts it back", () => {
  let marks = addMark([], { kind: "stand", ...HERE }).marks;
  const id = marks[0].id;
  const drop = { latitude: 44.5512, longitude: -69.6288 };
  const moved = moveMark(marks, id, drop);
  assert.equal(moved.ok, true);
  assert.equal(moved.mark.latitude, drop.latitude);
  assert.deepEqual(moved.from, { latitude: HERE.latitude, longitude: HERE.longitude });
  marks = undoMove(moved.marks, id, moved.from);
  assert.equal(marks[0].latitude, HERE.latitude);
  assert.equal(moveMark(marks, id, { latitude: NaN, longitude: 0 }).ok, false);
  assert.equal(moveMark(marks, "gone", drop).ok, false);
});

test("the native map drags the moving mark with a draggable PointAnnotation and keeps Move here", () => {
  const native = fs.readFileSync("src/phone/OfflineMap.native.js", "utf8");
  assert.match(native, /<PointAnnotation[\s\S]*draggable[\s\S]*onDragEnd=/);
  assert.match(native, /onMarkDragEnd\?\.\(mark\.id/);
  const web = fs.readFileSync("src/phone/OfflineMap.js", "utf8");
  assert.match(web, /draggable: dragging/);
  assert.match(web, /"dragend"/);
  const hunt = fs.readFileSync("src/phone/hunt_map.js", "utf8");
  assert.match(hunt, /label="Move here"/);
  assert.match(hunt, /onMarkDragEnd,/);
  assert.match(hunt, /undoMove\(list, mark\.id, result\.from\)/);
  assert.match(fs.readFileSync("src/phone/YehsaApp.js", "utf8"), /onMarkDragEnd=\{huntMap\.onMarkDragEnd\}/);
});

import { LOG_SIGHTING, loggedFromMark, sightingPrefill } from "./symbolic/hunt/marks.js";
import { addEntry, emptyLog, newEntry } from "./symbolic/hunt/sightings.js";

test("a new sighting mark offers Log in Sightings, prefilled with its spot and time, and is not drawn twice", () => {
  const tap = { latitude: 44.561, longitude: -69.641 };
  const made = addMark([], { kind: "sighting", ...tap, now: T });
  const prefill = sightingPrefill(made.mark);
  assert.deepEqual(prefill.spot, tap);
  assert.equal(prefill.t, T);
  assert.equal(prefill.markId, made.mark.id);
  assert.equal(sightingPrefill(addMark([], { kind: "stand", ...tap }).mark), null);
  const entry = newEntry({ species: "Deer", count: "2", spot: prefill.spot, markId: prefill.markId }, prefill.t);
  assert.equal(entry.t, T);
  assert.deepEqual(entry.spot, tap);
  const log = addEntry(emptyLog(), entry);
  assert.ok(loggedFromMark(log, made.mark.id));
  assert.equal(sightingMarks(log, [made.mark.id]).length, 0, "the mark is already the pin");
  assert.equal(sightingMarks(log, []).length, 1, "after the mark is deleted the logged sighting still shows");
  assert.equal(LOG_SIGHTING, "Log in Sightings");
  const hunt = fs.readFileSync("src/phone/hunt_map.js", "utf8");
  assert.match(hunt, /mark\.kind === "sighting" && onLogSighting/);
  const screen = fs.readFileSync("src/phone/SightingsScreen.js", "utf8");
  assert.match(screen, /prefill \? "new" : "list"/);
  assert.match(screen, /markId: from\?\.markId/);
  assert.match(fs.readFileSync("src/phone/FieldPane.js", "utf8"), /prefill=\{sightingPrefill\}/);
});

import { HUNT_FOCUS_M, huntFocus } from "./symbolic/hunt/marks.js";

test("Hunt starts tight on you, or on your first stand, not a whole-state frame", () => {
  const box = huntFocus(HERE, []);
  assert.ok(box.north > HERE.latitude && box.south < HERE.latitude);
  assert.ok((box.north - box.south) * 111 < 3, "under 3 km tall");
  const stand = addMark([], { kind: "stand", latitude: 44.7, longitude: -69.5 }).marks;
  const standBox = huntFocus(null, stand);
  assert.ok(standBox.north > 44.7 && standBox.south < 44.7);
  assert.equal(huntFocus(null, []), null);
  assert.equal(HUNT_FOCUS_M, 1200);
  assert.match(fs.readFileSync("src/phone/YehsaApp.js", "utf8"), /huntFocus\(held, huntMap\.marks\)/);
});
