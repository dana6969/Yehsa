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

test("native map: one camera driver, no controlled Camera props, touch drops follow", () => {
  assert.match(nativeMap, /createCameraDriver\(/);
  assert.match(nativeMap, /onRegionWillChange/);
  assert.match(nativeMap, /driver\.current\.regionEvent\(event\)\) onUserPan/);
  assert.match(nativeMap, /onTouchMove=\{\(event\) => \{ if \(driver\.current\.touchMove\(event\)\) onUserPan/);
  assert.match(nativeMap, /defaultSettings=\{start\.current\}/, "the start camera is only the default, never a bound prop");
  assert.doesNotMatch(nativeMap, /<Camera[^>]*(zoomLevel|centerCoordinate|bounds|followUserLocation|followUserMode)=/);
  assert.doesNotMatch(nativeMap, /<UserLocation/);
  // Every camera call goes through the driver's commands.
  const calls = nativeMap.match(/\.(setCamera|fitBounds|flyTo|moveTo|zoomTo)\(/g) || [];
  assert.equal(calls.length, 2, "only runCameraCommand calls the Camera ref");
});

test("full screen hides the tabs and keeps SOS; the rail has the map controls", () => {
  assert.match(app, /fullMap && styles\.hidden/);
  assert.match(app, /onSos=\{\(\) => go\(\{ type: "openSos" \}\)\}/);
  const rail = readFileSync("./src/phone/MapRail.js", "utf8");
  for (const word of ["Layers", "North", "Wind", "Marks", "Full", "Exit", "SOS", "Lock"]) assert.match(rail, new RegExp(`"${word}"|${word}`));
  assert.match(rail, /full && onSos/);
  assert.match(app, /<MapRail/);
});
