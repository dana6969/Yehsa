// R6 map: camera control (no automatic zoom-out or recenter), one location setting, full screen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  boxKey, followStop, isUserGesture, pinFix, recenterState, recenterStop, RECENTER_ZOOM,
  seedAppliedKey, shouldFitFocus, shouldFitRoute
} from "./symbolic/map_camera.js";
import { LOCATION_CONSENT, mapWatchesGps, requestLocation, turnLocationOff } from "./symbolic/location_setting.js";
import { grantGpsConsent, initialGpsMap, noteUserPan, recenterOnMe, applyGpsSample } from "./symbolic/gps_map.js";

const fix = { latitude: 44.55, longitude: -69.63, accuracy: 8 };
const app = readFileSync("./src/phone/YehsaApp.js", "utf8");
const nativeMap = readFileSync("./src/phone/OfflineMap.native.js", "utf8");

test("follow moves the center only and never sets a zoom", () => {
  const stop = followStop(fix, { headingDeg: 90 });
  assert.deepEqual(stop.centerCoordinate, [-69.63, 44.55]);
  assert.equal("zoomLevel" in stop, false);
  assert.equal("heading" in stop, false, "north stays up outside route Start");
  const course = followStop(fix, { headingDeg: 90, course: true });
  assert.equal(course.heading, 90);
  assert.equal("zoomLevel" in course, false, "route Start follow keeps the user's zoom too");
  assert.equal(followStop(null), null);
});

test("recenter keeps the user's zoom, and steps in only from a whole-state view", () => {
  assert.equal("zoomLevel" in recenterStop(fix, { zoom: 16.5 }), false);
  assert.equal("zoomLevel" in recenterStop(fix, { zoom: 11 }), false);
  assert.equal(recenterStop(fix, { zoom: 5 }).zoomLevel, RECENTER_ZOOM);
  assert.equal("zoomLevel" in recenterStop(fix, { zoom: null }), false);
});

test("a fit runs once per request, not when roads reload or layers rebuild", () => {
  // The R5 bug: layers.firstFocus is a new object each time roads reload after a zoom, and the
  // effect re-ran fitBounds to the Hunt box. The key of an equal box is the same.
  const a = { west: -70, south: 44, east: -69, north: 45 };
  assert.equal(boxKey(a), boxKey({ ...a }));
  assert.notEqual(boxKey(a), boxKey({ ...a, west: -71 }));
  assert.equal(boxKey(null), "");
  let last = 0;
  assert.equal(shouldFitFocus({ focus: a, focusKey: 1, lastKey: last }), true);
  last = 1;
  for (let i = 0; i < 5; i++) assert.equal(shouldFitFocus({ focus: a, focusKey: 1, lastKey: last }), false);
  assert.equal(shouldFitFocus({ focus: a, focusKey: 2, lastKey: last }), true, "Show on map again still works");
});

test("a rebuilt map view (back to the tab) does not re-fit an old request", () => {
  assert.equal(seedAppliedKey(3, true), 3);
  assert.equal(shouldFitFocus({ focus: { west: 0, south: 0, east: 1, north: 1 }, focusKey: 3, lastKey: seedAppliedKey(3, true) }), false);
  assert.equal(seedAppliedKey(3, false), 0);
});

test("a route is framed once and never during Start (reroutes do not zoom out)", () => {
  const box = { west: -70, south: 44, east: -69, north: 45 };
  assert.equal(shouldFitRoute({ box, fitKey: 4, lastKey: 0, navOn: false }), true);
  assert.equal(shouldFitRoute({ box, fitKey: 4, lastKey: 4, navOn: false }), false);
  assert.equal(shouldFitRoute({ box, fitKey: 5, lastKey: 4, navOn: true }), false);
});

test("any pan or pinch drops follow; Recenter turns it back on", () => {
  assert.equal(isUserGesture({ properties: { isUserInteraction: true } }), true);
  assert.equal(isUserGesture({ properties: { isUserInteraction: false } }), false);
  assert.equal(isUserGesture({ properties: { isUserInteraction: true, animated: true } }), false, "the app's own animation is not a gesture");
  assert.equal(isUserGesture(null), false);
  let gps = applyGpsSample(grantGpsConsent(initialGpsMap()), { latitude: 44.55, longitude: -69.63, accuracy: 8 });
  assert.equal(gps.follow, true);
  gps = noteUserPan(gps);
  assert.equal(gps.follow, false);
  gps = applyGpsSample(gps, { latitude: 44.551, longitude: -69.631, accuracy: 8 });
  assert.equal(gps.follow, false, "a new GPS sample does not turn follow back on");
  assert.equal(recenterOnMe(gps).follow, true);
});

test("the Recenter button says its state in words", () => {
  assert.equal(recenterState({ consent: false }).id, "off");
  assert.equal(recenterState({ consent: true, fix: null }).label, "Finding you");
  assert.equal(recenterState({ consent: true, fix, follow: false }).label, "Recenter");
  assert.equal(recenterState({ consent: true, fix, follow: true }).id, "following");
  assert.equal(recenterState({ consent: true, fix, pinned: true }).label, "Locked");
});

test("lock position pins the current fix", () => {
  const pin = pinFix(fix, 1000);
  assert.deepEqual([pin.latitude, pin.longitude, pin.accuracy, pin.pinnedAt], [44.55, -69.63, 8, 1000]);
  assert.equal(pinFix(null), null);
  assert.equal(mapWatchesGps({ consent: true, active: true, pinned: true }), false);
  assert.equal(mapWatchesGps({ consent: true, active: true, pinned: true, navOn: true }), true);
});

test("one location setting: the map never turns it on without the same consent", async () => {
  let calls = [];
  const onConsent = (value) => calls.push(value);
  assert.equal(await requestLocation({ position: { consent: false }, confirm: async () => false, onConsent }), false);
  assert.deepEqual(calls, [], "declining the prompt leaves Settings off");
  assert.equal(await requestLocation({ position: { consent: false }, confirm: async () => { throw new Error("x"); }, onConsent }), false);
  assert.equal(await requestLocation({ position: { consent: false }, onConsent }), false, "no prompt, no change");
  assert.deepEqual(calls, []);
  let asked = null;
  assert.equal(await requestLocation({ position: { consent: false }, confirm: async (text) => { asked = text; return true; }, onConsent }), true);
  assert.deepEqual(calls, [true]);
  assert.match(asked.body, /I consent to hold a position on this device/);
  assert.equal(await requestLocation({ position: { consent: true }, confirm: async () => { throw new Error("no prompt when on"); }, onConsent }), true);
  turnLocationOff({ onConsent });
  assert.deepEqual(calls, [true, false]);
  assert.equal(mapWatchesGps({ consent: false, active: true, navOn: true, background: true }), false, "Settings off means no GPS, whatever the map wants");
  assert.equal(mapWatchesGps({ consent: true, active: true }), true);
  assert.equal(mapWatchesGps({ consent: true, active: false }), false);
  // The words match the Settings switch.
  assert.match(app, /I consent to hold a position on this device/);
  assert.equal(LOCATION_CONSENT.yes, "Turn on");
});

test("the app wires one setting: no map-only GPS switch, no silent consent", () => {
  const land = app.slice(app.indexOf("function LandPane("), app.indexOf("function HelpersPane("));
  assert.doesNotMatch(land, /setGpsWanted/, "no map-only GPS switch beside Settings, Location");
  assert.doesNotMatch(land, /onConsent\(true\)/, "the map asks through requestLocation, never onConsent(true) directly");
  assert.match(land, /mapWatchesGps\(\{ consent: consented/);
  assert.match(land, /current\.consent \? current : grantGpsConsent/, "follow is not forced back on when the tab is shown again");
  const helpers = app.slice(app.indexOf("function HelpersPane("), app.indexOf("function HelpersPane(") + 900);
  assert.match(helpers, /requestLocation\(/);
});

test("native map: one uncontrolled camera, moves only through the controller", () => {
  assert.doesNotMatch(nativeMap, /<Camera[\s>]/, "no library <Camera>: its setNativeProps stop is replayed on Fabric");
  assert.match(nativeMap, /const NATIVE_CAMERA = "MLRNCamera"/);
  assert.match(nativeMap, /createCameraController\(/);
  assert.match(nativeMap, /setNativeProps\?\.\(\{ stop: null \}\)/, "the kept stop is cleared after each move");
  assert.doesNotMatch(nativeMap, /fitBounds\(|setCamera\(/, "no direct camera calls outside the controller");
  assert.match(nativeMap, /useMemo\(\(\) => React\.createElement\(NATIVE_CAMERA/, "the camera element is built once and never re-rendered");
  assert.match(nativeMap, /onTouchMove=/);
  assert.match(nativeMap, /isUserGesture\(event\)\) userMoved/);
});

test("full screen hides the tabs and keeps SOS; the rail has the map controls", () => {
  assert.match(app, /fullMap && styles\.hidden/);
  assert.match(app, /onSos=\{\(\) => go\(\{ type: "openSos" \}\)\}/);
  const rail = readFileSync("./src/phone/MapRail.js", "utf8");
  for (const word of ["Layers", "North", "Wind", "Marks", "Full", "Exit", "SOS", "Lock"]) assert.match(rail, new RegExp(`"${word}"|${word}`));
  assert.match(rail, /full && onSos/);
  assert.match(app, /<MapRail/);
});

// ---- R7: a simulated native camera with the New Architecture's kept-stop replay ----------------
import { createCameraController, nativeStop, touchIsGesture } from "./symbolic/map_camera.js";

function fakeNative() {
  // Models Fabric: setNativeProps({ stop }) is kept and sent again on every later clone of the
  // view (each GPS tick, road reload or mark changes the map's children, which clones the camera).
  const timers = [];
  const native = {
    kept: undefined,
    moves: [],
    send(stop) { native.kept = stop; native.moves.push(stop); },
    clear() { native.kept = null; },
    clone() { if (native.kept) native.moves.push(native.kept); },
    schedule(fn) { const t = { fn, done: false }; timers.push(t); return t; },
    cancel(t) { if (t) t.done = true; },
    flush() { for (const t of timers.splice(0)) if (!t.done) t.fn(); }
  };
  return native;
}

function rig(extra = {}) {
  const n = fakeNative();
  const ctl = createCameraController({ send: n.send, clear: n.clear, schedule: n.schedule, cancel: n.cancel });
  const base = { fix: null, follow: false, focus: null, focusKey: 0, firstFocus: { west: -71, south: 43, east: -67, north: 47 }, hasInitialCamera: false, route: null, navOn: false, recenterKey: 0, northKey: 0, ...extra };
  return { n, ctl, base };
}

function tick(i) {
  return { latitude: 44.55 + i * 0.0001, longitude: -69.63 - i * 0.0001, accuracy: 6 };
}

test("Map: after a pan, GPS ticks, layer rebuilds and view clones never move the camera", () => {
  const { n, ctl, base } = rig();
  let p = { ...base };
  ctl.update(p); // first frame
  p = { ...p, fix: tick(0), follow: true };
  ctl.update(p); // location on: follow starts
  n.flush();
  const before = n.moves.length;
  assert.ok(before >= 1);
  // The user pinches in and pans away.
  ctl.gesture();
  ctl.region({ properties: { zoomLevel: 16.4 } });
  p = { ...p, follow: false };
  for (let i = 1; i <= 30; i++) {
    p = { ...p, fix: tick(i), firstFocus: { ...p.firstFocus }, focus: p.focus, layersVersion: i };
    ctl.update(p); // GPS tick + layers rebuilt (new firstFocus object)
    n.clone(); // the native camera view is cloned (children changed)
    if (i % 5 === 0) n.flush();
  }
  assert.equal(n.moves.length, before, "no camera move after the user's pan or pinch");
});

test("the R6 bug, reproduced: without clearing, every clone replays the last move", () => {
  const n = fakeNative();
  const ctl = createCameraController({ send: n.send, clear: () => {}, schedule: n.schedule, cancel: n.cancel });
  ctl.update({ fix: tick(0), follow: true, focusKey: 0, recenterKey: 0, northKey: 0 });
  const before = n.moves.length;
  ctl.gesture();
  for (let i = 0; i < 5; i++) n.clone();
  assert.equal(n.moves.length, before + 5, "the kept stop jumps the map back on each clone");
});

test("a race: a GPS tick before the app drops follow does not move the map after a pan", () => {
  const { n, ctl, base } = rig();
  let p = { ...base, fix: tick(0), follow: true };
  ctl.update(p);
  n.flush();
  const before = n.moves.length;
  ctl.gesture(); // follow is still true in props for a moment
  ctl.update({ ...p, fix: tick(1) });
  ctl.update({ ...p, fix: tick(2) });
  assert.equal(n.moves.length, before);
});

test("Recenter: one move at the user's zoom, then follow resumes; a pan stops it again", () => {
  const { n, ctl, base } = rig();
  let p = { ...base, fix: tick(0), follow: false };
  ctl.update(p);
  ctl.region({ properties: { zoomLevel: 15.2 } });
  const before = n.moves.length;
  p = { ...p, follow: true, recenterKey: 1 };
  ctl.update(p);
  assert.equal(n.moves.length, before + 1);
  const re = n.moves.at(-1);
  assert.ok(re.centerCoordinate && !("zoomLevel" in re), "recenter keeps the zoom");
  p = { ...p, fix: tick(1) };
  ctl.update(p);
  assert.equal(n.moves.length, before + 2, "following: the next fix moves the center");
  assert.equal("zoomLevel" in n.moves.at(-1), false);
  n.flush(); // the kept stop is cleared a moment after each move
  ctl.gesture();
  p = { ...p, follow: false, fix: tick(2) };
  ctl.update(p);
  n.clone();
  n.flush();
  n.clone();
  assert.equal(n.moves.length, before + 2);
});

test("Hunt map: Hunt framing runs once; marks, parcels and wind updates never re-frame", () => {
  const { n, ctl, base } = rig({ fix: tick(0) });
  let p = { ...base };
  ctl.update(p);
  const huntBox = { west: -69.64, south: 44.54, east: -69.62, north: 44.56 };
  p = { ...p, focus: huntBox, focusKey: 1 };
  ctl.update(p);
  assert.equal(n.moves.at(-1).bounds.ne[0], -69.62);
  n.flush();
  const before = n.moves.length;
  ctl.gesture();
  for (let i = 0; i < 10; i++) {
    p = { ...p, focus: { ...huntBox }, firstFocus: { ...p.firstFocus }, fix: tick(i) };
    ctl.update(p);
    n.clone();
  }
  n.flush();
  assert.equal(n.moves.length, before);
  // A rebuilt view (back to the tab) at the remembered camera does not re-frame either.
  const again = rig({ fix: tick(3), focus: huntBox, focusKey: 1, hasInitialCamera: true, initialZoom: 15 });
  again.ctl.update(again.base);
  assert.equal(again.n.moves.length, 0);
});

test("Start mode: follow keeps the zoom, a pan pauses it, reroutes never zoom out, Recenter resumes", () => {
  const { n, ctl, base } = rig({ fix: tick(0) });
  const box = { west: -70, south: 44, east: -69, north: 45 };
  let p = { ...base, route: { box, fitKey: 1 } };
  ctl.update(p);
  assert.ok(n.moves.at(-1).bounds, "a new route is framed once");
  ctl.region({ properties: { zoomLevel: 16 } });
  p = { ...p, navOn: true, follow: true, followCourse: true, headingDeg: 90, recenterKey: 1 };
  ctl.update(p);
  for (let i = 1; i <= 3; i++) {
    p = { ...p, fix: tick(i), headingDeg: 90 + i };
    ctl.update(p);
  }
  const follows = n.moves.slice(-3);
  for (const m of follows) {
    assert.equal("zoomLevel" in m, false);
    assert.ok(Number.isFinite(m.heading));
  }
  n.flush();
  const before = n.moves.length;
  ctl.gesture();
  p = { ...p, follow: false };
  for (let i = 4; i <= 8; i++) {
    p = { ...p, fix: tick(i), route: { box: { ...box, west: -70.5 }, fitKey: 1 + i } }; // reroutes
    ctl.update(p);
    n.clone();
  }
  n.flush();
  assert.equal(n.moves.length, before, "paused: no move, and no route fit during Start");
  p = { ...p, follow: true, recenterKey: 2 };
  ctl.update(p);
  assert.equal(n.moves.length, before + 1);
});

test("nativeStop matches the maplibre camera's native shape", () => {
  const c = nativeStop({ centerCoordinate: [-69.6, 44.5], zoomLevel: 14, animationDuration: 500, heading: 0 });
  assert.equal(c.zoom, 14);
  assert.equal(c.duration, 500);
  assert.equal(JSON.parse(c.centerCoordinate).geometry.coordinates[0], -69.6);
  const b = nativeStop({ bounds: { ne: [-69, 45], sw: [-70, 44] }, padding: 40, animationDuration: 700 });
  assert.equal(JSON.parse(b.bounds).features.length, 2);
  assert.equal(b.paddingLeft, 40);
  assert.equal(nativeStop(null), null);
});

test("touch: a tap is not a gesture; a drag or two fingers is", () => {
  const start = { x: 100, y: 100 };
  assert.equal(touchIsGesture(start, { nativeEvent: { pageX: 103, pageY: 102, touches: [{}] } }), false);
  assert.equal(touchIsGesture(start, { nativeEvent: { pageX: 130, pageY: 100, touches: [{}] } }), true);
  assert.equal(touchIsGesture(start, { nativeEvent: { pageX: 100, pageY: 100, touches: [{}, {}] } }), true);
});
