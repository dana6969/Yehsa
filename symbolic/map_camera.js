// Camera rules for the Map and the Hunt map, Google-Maps style. Pure functions, no sensors.
//
// - The camera never zooms or moves by itself after the user pans or zooms.
// - Follow starts only from the Recenter button (or Start on a route, or the first fix after
//   location is turned on). Any pan or pinch by the user drops follow.
// - Follow moves the center only. It never sets a zoom, so the user's zoom is kept.
// - A "fit" (Show on map, Hunt framing, a new route) runs once per request key, never again on a
//   re-render, a road reload, a GPS sample, or when the map view is rebuilt on returning to the tab.

// Stable key for a box, so a new object with the same edges is not a new request.
export function boxKey(box) {
  if (!box) return "";
  const edges = [box.west, box.south, box.east, box.north];
  if (!edges.every(Number.isFinite)) return "";
  return edges.map((value) => value.toFixed(5)).join(",");
}

// The key a freshly built map view should treat as "already applied". When the view is rebuilt
// at a remembered camera, the old request was already shown, so it must not fit again.
export function seedAppliedKey(key, hasRememberedCamera) {
  return hasRememberedCamera ? key || 0 : 0;
}

// Should a focus fit (Show on map, Hunt framing) run now?
export function shouldFitFocus({ focus, focusKey, lastKey }) {
  return Boolean(focus && focusKey && focusKey !== lastKey);
}

// Should a route be framed now? Never while Start is on: then follow owns the camera, and a
// reroute must not zoom the map out to the whole new route.
export function shouldFitRoute({ box, fitKey, lastKey, navOn }) {
  return Boolean(box && fitKey && fitKey !== lastKey && !navOn);
}

// The camera move for one follow step. Center only (and heading when following the course).
// No zoomLevel, ever: the user's zoom is kept.
export function followStop(fix, { headingDeg = null, course = false, duration = 600 } = {}) {
  if (!fix || !Number.isFinite(fix.longitude) || !Number.isFinite(fix.latitude)) return null;
  const stop = { centerCoordinate: [fix.longitude, fix.latitude], animationDuration: duration };
  if (course && Number.isFinite(headingDeg)) stop.heading = headingDeg;
  return stop;
}

// The one move made when the user taps Recenter: center on the fix at the user's zoom. Only when
// the map is zoomed out to a whole-state view does it step in, so the dot is useful.
export const RECENTER_MIN_ZOOM = 9;
export const RECENTER_ZOOM = 14;
export function recenterStop(fix, { zoom = null, duration = 500 } = {}) {
  const stop = followStop(fix, { duration });
  if (!stop) return null;
  if (Number.isFinite(zoom) && zoom < RECENTER_MIN_ZOOM) stop.zoomLevel = RECENTER_ZOOM;
  return stop;
}

// A camera event from the map: did the user move it (pan, pinch, rotate)?
export function isUserGesture(event) {
  return event?.properties?.isUserInteraction === true;
}

// The state of the Recenter button, in words (never color alone).
export function recenterState({ consent, fix, follow, pinned, navOn }) {
  if (consent !== true) return { id: "off", label: "Location off", hint: "Asks before turning location on. Same setting as Settings, Location." };
  if (pinned) return { id: "pinned", label: "Locked", hint: "Your position is locked here. Tap Recenter to look at it." };
  if (!fix) return { id: "finding", label: "Finding you", hint: "Waiting for a GPS fix." };
  if (follow) return { id: "following", label: navOn ? "Following" : "On you", hint: "The map follows you. Pan or pinch to look around." };
  return { id: "free", label: "Recenter", hint: "Centers the map on you at this zoom and follows you." };
}

// Lock position: hold the current fix as your place. GPS stops moving the dot until you unlock.
export function pinFix(fix, now = Date.now()) {
  if (!fix || !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return null;
  const pin = { latitude: fix.latitude, longitude: fix.longitude, pinnedAt: now };
  if (Number.isFinite(fix.accuracy)) pin.accuracy = fix.accuracy;
  if (Number.isFinite(fix.altitude)) pin.altitude = fix.altitude;
  return pin;
}
