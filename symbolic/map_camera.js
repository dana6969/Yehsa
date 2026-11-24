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
// MapLibre Android sets isUserInteraction for the app's own camera animations too
// (CameraChangeTracker counts DEVELOPER_ANIMATION as interaction), so an animated move is not a
// gesture. A finger pan or pinch arrives with animated false.
export function isUserGesture(event) {
  const p = event?.properties;
  return p?.isUserInteraction === true && p?.animated !== true;
}

// A finger moved far enough (or two fingers are down) to count as a pan or pinch, not a tap.
export const GESTURE_SLOP_PX = 10;
export function touchIsGesture(start, event) {
  const touches = event?.nativeEvent?.touches;
  if (Array.isArray(touches) && touches.length >= 2) return true;
  const x = event?.nativeEvent?.pageX;
  const y = event?.nativeEvent?.pageY;
  if (!start || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.hypot(x - start.x, y - start.y) >= GESTURE_SLOP_PX;
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

// ---- The one camera controller for the native map (R7) ----------------------------------------
//
// Root cause of R6's "still recenters": on Android with the New Architecture (Fabric), a prop set
// with setNativeProps is kept by React Native (ShadowNodeFamily.nativeProps_DEPRECATED) and merged
// into every later clone of that view, and Android sends the full props on each update. The
// maplibre Camera does every move with setNativeProps({ stop }). So the last move (a follow step on
// an old fix, the Hunt framing, a route fit) was sent again each time the camera view was cloned,
// which happens whenever the map's children change: every GPS tick (the dot), every road reload,
// every mark. The map jumped back seconds after each pan or pinch.
//
// The controller below makes the camera uncontrolled: it sends a move only for an explicit request
// (first frame, Recenter, North up, Show on map / Hunt framing, a new route, a follow step while
// following), and clears the kept stop right after, so a later clone sends stop: null (a no-op).

export function nativeStop(stop) {
  if (!stop) return null;
  const out = {};
  if (Number.isFinite(stop.animationDuration)) out.duration = stop.animationDuration;
  if (Array.isArray(stop.centerCoordinate)) {
    out.centerCoordinate = JSON.stringify({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: stop.centerCoordinate } });
  }
  if (Number.isFinite(stop.heading)) out.heading = stop.heading;
  if (Number.isFinite(stop.pitch)) out.pitch = stop.pitch;
  if (Number.isFinite(stop.zoomLevel)) out.zoom = stop.zoomLevel;
  if (stop.bounds) {
    const { ne, sw } = stop.bounds;
    out.bounds = JSON.stringify({
      type: "FeatureCollection",
      features: [ne, sw].map((c) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } }))
    });
    const pad = Number.isFinite(stop.padding) ? stop.padding : 0;
    out.paddingTop = pad;
    out.paddingRight = pad;
    out.paddingBottom = pad;
    out.paddingLeft = pad;
  }
  return out;
}

export function fitStop(box, padding = 40, duration = 700) {
  if (!box || ![box.west, box.south, box.east, box.north].every(Number.isFinite)) return null;
  return { bounds: { ne: [box.east, box.north], sw: [box.west, box.south] }, padding, animationDuration: duration };
}

export const CLEAR_AFTER_MS = 250;

// send(stop): give one move to the native camera. clear(): drop the kept stop (stop: null).
export function createCameraController({ send, clear, schedule = setTimeout, cancel = clearTimeout, clearAfterMs = CLEAR_AFTER_MS } = {}) {
  let started = false;
  let appliedFocus = 0;
  let appliedRoute = 0;
  let lastRecenter = 0;
  let lastNorth = 0;
  let lastFollowKey = null;
  let skipFollowOnce = false;
  let gestureHold = false;
  let zoom = null;
  let timer = null;
  const moves = [];

  function move(stop, why) {
    if (!stop) return;
    moves.push({ why, stop });
    send?.(stop, why);
    if (timer) cancel(timer);
    timer = schedule(() => {
      timer = null;
      clear?.();
    }, clearAfterMs);
  }

  function update(p = {}) {
    const fix = p.fix && Number.isFinite(p.fix.latitude) && Number.isFinite(p.fix.longitude) ? p.fix : null;
    if (!started) {
      started = true;
      appliedFocus = seedAppliedKey(p.focusKey, p.hasInitialCamera);
      appliedRoute = seedAppliedKey(p.route?.fitKey, p.hasInitialCamera);
      lastRecenter = p.recenterKey || 0;
      lastNorth = p.northKey || 0;
      if (p.hasInitialCamera) zoom = p.initialZoom ?? null;
      const box = p.focus || p.firstFocus;
      if (!p.hasInitialCamera && !fix && box && !(p.focus && p.focusKey)) move(fitStop(box, 40, 0), "first-frame");
      // A rebuilt view that was following keeps following from where it is, without a jump.
      if (p.follow && fix && p.hasInitialCamera) lastFollowKey = followKey(fix, p);
    }
    if (shouldFitFocus({ focus: p.focus, focusKey: p.focusKey, lastKey: appliedFocus })) {
      appliedFocus = p.focusKey;
      move(fitStop(p.focus, 40, 700), "focus");
    }
    const route = p.route;
    if (route?.fitKey && route.fitKey !== appliedRoute) {
      const fit = shouldFitRoute({ box: route.box, fitKey: route.fitKey, lastKey: appliedRoute, navOn: p.navOn });
      appliedRoute = route.fitKey;
      if (fit) move(fitStop(route.box, 60, 700), "route");
    }
    if ((p.recenterKey || 0) !== lastRecenter) {
      lastRecenter = p.recenterKey || 0;
      gestureHold = false;
      if (fix) {
        move(recenterStop(fix, { zoom }), "recenter");
        skipFollowOnce = true;
      }
    }
    if ((p.northKey || 0) !== lastNorth) {
      lastNorth = p.northKey || 0;
      move({ heading: 0, animationDuration: 300 }, "north");
    }
    if (!p.follow) {
      lastFollowKey = null;
      gestureHold = false;
      skipFollowOnce = false;
    } else if (fix && !gestureHold) {
      const key = followKey(fix, p);
      if (key !== lastFollowKey) {
        const first = lastFollowKey === null;
        lastFollowKey = key;
        if (skipFollowOnce) skipFollowOnce = false;
        // The first step of a follow that no Recenter tap started (location just turned on) steps
        // in from a whole-state view, like Recenter; every later step moves the center only.
        else if (first) move(recenterStop(fix, { zoom }), "follow-start");
        else move(followStop(fix, { headingDeg: p.headingDeg, course: p.followCourse }), "follow");
      }
    }
  }

  // The user panned or pinched. Nothing moves until they ask again (Recenter, Show, Start).
  function gesture() {
    gestureHold = true;
    skipFollowOnce = false;
  }

  function region(event) {
    const z = event?.properties?.zoomLevel;
    if (Number.isFinite(z)) zoom = z;
  }

  function dispose() {
    if (timer) cancel(timer);
    timer = null;
  }

  return { update, gesture, region, dispose, moves, get zoom() { return zoom; } };
}

function followKey(fix, p) {
  const heading = p.followCourse && Number.isFinite(p.headingDeg) ? Math.round(p.headingDeg) : "";
  return `${fix.latitude.toFixed(6)},${fix.longitude.toFixed(6)},${heading}`;
}
