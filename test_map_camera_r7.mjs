// R7: after the user pans or pinches, nothing moves the camera on its own: no GPS sample, no
// layer rebuild, no road reload, no route recompute, no rebuilt map view. Only Recenter,
// Show on map, a new route, or route Start.
import test from "node:test";
import assert from "node:assert/strict";
import { createCameraDriver, lastMapCamera, rememberMapCamera, forgetMapCamera, SELF_MOVE_GRACE_MS } from "./symbolic/map_camera_driver.js";

const box = { west: -70, south: 44, east: -69, north: 45 };
function fixAt(i) { return { latitude: 44.55 + i * 0.0003, longitude: -69.63 + i * 0.0002, accuracy: 6 }; }

function harness(opts = {}) {
  let t = 1_000_000;
  const calls = [];
  const d = createCameraDriver({ now: () => t, ...opts });
  const props = { fix: null, follow: false, focus: null, focusKey: 0, route: null, navOn: false, recenterKey: 0, northKey: 0, firstFocus: box };
  const render = (patch = {}) => {
    Object.assign(props, patch);
    const cmds = d.sync({ ...props });
    calls.push(...cmds);
    return cmds;
  };
  return { d, props, render, calls, tick: (ms) => { t += ms; }, now: () => t };
}

function pan(h) {
  // A real finger drag on the map: touch start, a few moves, release, then the camera events.
  const start = h.d.touchStart({ nativeEvent: { touches: [{ pageX: 100, pageY: 100 }] } });
  const moved = h.d.touchMove({ nativeEvent: { touches: [{ pageX: 140, pageY: 120 }] } });
  h.d.touchMove({ nativeEvent: { touches: [{ pageX: 180, pageY: 160 }] } });
  h.d.regionEvent({ properties: { isUserInteraction: true, zoomLevel: 15.5 } });
  h.d.touchEnd();
  return start || moved;
}

test("after a pan: GPS samples, layer rebuilds and road reloads make zero camera calls", () => {
  const h = harness();
  h.render({ fix: fixAt(0), follow: true });
  assert.ok(h.calls.length >= 1, "the first fix after turning location on centers once");
  assert.equal(pan(h), true, "the drag is a user gesture (the caller drops follow)");
  const before = h.calls.length;
  // The parent's follow=false arrives a few renders late: still no move.
  for (let i = 1; i <= 3; i++) { h.tick(1000); h.render({ fix: fixAt(i) }); }
  h.render({ follow: false });
  for (let i = 4; i <= 40; i++) {
    h.tick(1000);
    h.render({ fix: fixAt(i) });                                  // GPS sample
    h.render({ firstFocus: { ...box, west: box.west - i * 0.01 } }); // layers rebuilt (new firstFocus)
    h.render({});                                                // road lines reloaded / re-render
    h.d.regionEvent({ properties: { isUserInteraction: false, zoomLevel: 15.5 } });
  }
  assert.equal(h.calls.length - before, 0, `camera calls after the pan: ${JSON.stringify(h.calls.slice(before))}`);
});

test("a pinch (two fingers) drops follow at once", () => {
  const h = harness();
  h.render({ fix: fixAt(0), follow: true });
  const before = h.calls.length;
  assert.equal(h.d.touchStart({ nativeEvent: { touches: [{ pageX: 1, pageY: 1 }, { pageX: 50, pageY: 50 }] } }), true);
  h.d.touchEnd();
  for (let i = 1; i < 10; i++) h.render({ fix: fixAt(i) });
  assert.equal(h.calls.length, before);
});

test("the app's own moves are not mistaken for the user's (MapLibre Android flags them)", () => {
  const h = harness();
  h.render({ fix: fixAt(0), follow: true });
  // MapLibre reports our animation as isUserInteraction: true. Inside the window it is ignored.
  assert.equal(h.d.regionEvent({ properties: { isUserInteraction: true, zoomLevel: 14 } }), false);
  h.tick(2000);
  h.render({ fix: fixAt(5) });
  assert.equal(h.calls.length, 2, "follow keeps following until a real gesture");
  h.tick(600 + SELF_MOVE_GRACE_MS + 10);
  assert.equal(h.d.regionEvent({ properties: { isUserInteraction: true } }), true, "a fling after the window is the user's");
});

test("a tap is not a pan", () => {
  const h = harness();
  h.render({ fix: fixAt(0), follow: true });
  assert.equal(h.d.touchStart({ nativeEvent: { touches: [{ pageX: 100, pageY: 100 }] } }), false);
  assert.equal(h.d.touchMove({ nativeEvent: { touches: [{ pageX: 103, pageY: 102 }] } }), false);
  h.d.touchEnd();
  h.tick(2000);
  h.render({ fix: fixAt(3) });
  assert.equal(h.calls.length, 2);
});

test("Recenter moves once, keeps the zoom, then follows; a pan stops it again", () => {
  const h = harness();
  h.render({ fix: fixAt(0), follow: true });
  pan(h);
  h.render({ follow: false });
  const n = h.calls.length;
  h.render({ recenterKey: 1, follow: true });
  assert.equal(h.calls.length, n + 1);
  assert.equal("zoomLevel" in h.calls[n].stop, false, "the user's zoom is kept");
  h.tick(2000);
  h.render({ fix: fixAt(4) });
  assert.equal(h.calls.length, n + 2, "following after Recenter");
  h.tick(2000);
  pan(h);
  for (let i = 5; i < 15; i++) h.render({ fix: fixAt(i) });
  assert.equal(h.calls.length, n + 2);
});

test("GPS jitter while following does not nudge the map", () => {
  const h = harness();
  h.render({ fix: fixAt(0), follow: true });
  for (let i = 0; i < 10; i++) h.render({ fix: { latitude: 44.55 + 0.0000025 * i, longitude: -69.63, accuracy: 5 } });
  assert.equal(h.calls.length, 1);
});

test("Show on map and a new route fit once; reroutes during Start and re-renders do not", () => {
  const h = harness();
  h.render({ fix: fixAt(0), follow: false });
  h.render({ focus: box, focusKey: 1 });
  assert.equal(h.calls.at(-1).type, "fit");
  const n = h.calls.length;
  for (let i = 0; i < 5; i++) h.render({ focus: { ...box } });
  h.render({ route: { box, fitKey: 7 } });
  assert.equal(h.calls.length, n + 1);
  h.render({ navOn: true, route: { box, fitKey: 8 } });
  h.render({ navOn: false });
  assert.equal(h.calls.length, n + 1, "a reroute made during Start is not framed later");
});

test("a rebuilt map view at a remembered camera replays nothing", () => {
  forgetMapCamera();
  rememberMapCamera({ center: [-69.6, 44.5], zoom: 15.2 });
  assert.deepEqual(lastMapCamera(), { center: [-69.6, 44.5], zoom: 15.2 });
  const h = harness({ remembered: lastMapCamera(), focusKey: 3, routeKey: 9, recenterKey: 2, northKey: 1 });
  h.render({ fix: fixAt(0), follow: false, focus: box, focusKey: 3, route: { box, fitKey: 9 }, recenterKey: 2, northKey: 1 });
  for (let i = 1; i < 10; i++) h.render({ fix: fixAt(i), firstFocus: { ...box } });
  assert.equal(h.calls.length, 0);
  forgetMapCamera();
});

test("a brand-new map with no fix frames the packs once, never again", () => {
  const h = harness();
  h.render({});
  assert.equal(h.calls.length, 1);
  for (let i = 0; i < 5; i++) h.render({ firstFocus: { ...box, north: 46 + i } });
  assert.equal(h.calls.length, 1);
});
