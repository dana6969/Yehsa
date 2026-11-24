// R7: the one place that decides when the map camera moves. Pure, no React, no native calls.
//
// OfflineMap.native.js feeds it every render's inputs (sync) and every touch and camera event,
// and runs the commands it returns on the MapLibre Camera ref (setCamera / fitBounds). The
// Camera component itself gets no controlled props (no centerCoordinate, zoomLevel, bounds,
// followUserLocation), so a re-render, a layer rebuild, a road reload or a GPS sample can never
// re-apply a camera by itself.
//
// The camera moves only for:
//   - Recenter (the button, route Start): one move to the fix at the user's zoom; then follow.
//   - Follow, and only while follow is on. Follow is on after Recenter or the first fix after
//     location is turned on, and goes off on the first touch-drag, pinch or fling.
//   - Show on map / Hunt framing / a new route: once per request key.
//   - The first view of a brand-new map (no remembered camera, no fix): frame the packs once.
//
// Why R6 still moved on the phone: MapLibre Android reports its own animations as
// isUserInteraction (CameraChangeTracker counts REASON_DEVELOPER_ANIMATION as user), so the app's
// own follow moves looked like pans, and real gestures were not told apart from them. Here a
// gesture is a real finger on the map (touch move), or an isUserInteraction event outside the
// window of a move the app made itself.

import { boxKey, followStop, recenterStop } from "./map_camera.js";

export const SELF_MOVE_GRACE_MS = 700;
export const DRAG_PX = 8;
// Follow only re-centers when the fix moved this far (meters). GPS jitter while standing still
// does not nudge the map.
export const FOLLOW_MIN_MOVE_M = 3;

function metersBetween(a, b) {
  if (!a || !b) return Infinity;
  const k = 111320;
  const dy = (a.latitude - b.latitude) * k;
  const dx = (a.longitude - b.longitude) * k * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

export function createCameraDriver({ remembered = null, focusKey = 0, routeKey = 0, recenterKey = 0, northKey = 0, now = () => Date.now() } = {}) {
  const state = {
    initialized: false,
    remembered: Boolean(remembered),
    zoom: Number.isFinite(remembered?.zoom) ? remembered.zoom : null,
    // Keys already applied. A rebuilt view at a remembered camera does not replay old requests.
    focusKey: remembered ? focusKey || 0 : 0,
    routeKey: remembered ? routeKey || 0 : 0,
    recenterKey: recenterKey || 0,
    northKey: northKey || 0,
    selfUntil: 0,
    touch: null,
    userMoved: false,
    followedAt: null,
    following: false,
    stopped: false,
    lastFollow: false,
    followedHeading: null,
    moves: 0
  };

  function self(cmd) {
    const ms = Number(cmd?.stop?.animationDuration ?? cmd?.duration ?? 0) || 0;
    state.selfUntil = now() + ms + SELF_MOVE_GRACE_MS;
    state.moves += 1;
    return cmd;
  }

  // Inputs: { fix, follow, headingDeg, followCourse, focus, focusKey, route: {box, fitKey},
  // navOn, recenterKey, northKey, firstFocus }. Returns camera commands, in order.
  function sync(p = {}) {
    const out = [];
    const fix = p.fix && Number.isFinite(p.fix.latitude) && Number.isFinite(p.fix.longitude) ? p.fix : null;
    if (!state.initialized) {
      state.initialized = true;
      const box = p.focus || p.firstFocus;
      if (!state.remembered && !fix && box && !(p.focusKey && p.focusKey !== state.focusKey)) {
        out.push(self({ type: "fit", box, padding: 40, duration: 0 }));
      }
    }
    // Recenter tap / route Start: one move, then follow takes over from this fix.
    const rk = p.recenterKey || 0;
    if (rk !== state.recenterKey) {
      state.recenterKey = rk;
      if (rk && fix) {
        const stop = recenterStop(fix, { zoom: state.zoom });
        if (stop) out.push(self({ type: "set", stop }));
        state.followedAt = fix;
        state.following = true;
        state.stopped = false;
        state.userMoved = false;
      }
    }
    const nk = p.northKey || 0;
    if (nk !== state.northKey) {
      state.northKey = nk;
      if (nk) out.push(self({ type: "set", stop: { heading: 0, animationDuration: 300 } }));
    }
    const fk = p.focusKey || 0;
    if (p.focus && fk && fk !== state.focusKey) {
      state.focusKey = fk;
      out.push(self({ type: "fit", box: p.focus, padding: 40, duration: 700 }));
    }
    const route = p.route;
    const rKey = route?.fitKey || 0;
    if (rKey && rKey !== state.routeKey) {
      // While Start is on, follow owns the camera: a reroute is marked as seen, never framed.
      state.routeKey = rKey;
      if (route.box && !p.navOn) out.push(self({ type: "fit", box: route.box, padding: 60, duration: 700 }));
    }
    // Follow: center only (heading too during route Start with course up). Never a zoom.
    // After the user's own pan or pinch, follow stays off even if the follow prop is still true
    // for a render or two (the parent's state update is async); only Recenter or follow being
    // turned on again (off, then on) starts it.
    const followProp = Boolean(p.follow);
    if (followProp && !state.lastFollow) state.stopped = false;
    state.lastFollow = followProp;
    if (!followProp) {
      state.following = false;
      state.followedAt = null;
      state.stopped = false;
    } else if (fix && !state.stopped) {
      const first = !state.following;
      state.following = true;
      const moved = metersBetween(fix, state.followedAt) >= FOLLOW_MIN_MOVE_M;
      const courseTurn = Boolean(p.followCourse) && Number.isFinite(p.headingDeg) && p.headingDeg !== state.followedHeading;
      const centeredNow = out.some((c) => c.type === "set" && c.stop?.centerCoordinate);
      if ((first || moved || courseTurn) && !centeredNow) {
        const stop = followStop(fix, { headingDeg: p.headingDeg, course: Boolean(p.followCourse) });
        if (stop) {
          out.push(self({ type: "set", stop }));
          state.followedAt = fix;
          state.followedHeading = p.headingDeg;
        }
      }
    }
    return out;
  }

  // Touch handlers (a View around the map; touches reach it on Android while the GL view
  // handles them). Returns true when this touch is a pan or pinch: the caller drops follow.
  function touchStart(event) {
    const touches = event?.nativeEvent?.touches || [];
    const t = touches[0] || event?.nativeEvent || {};
    state.touch = { x: Number(t.pageX) || 0, y: Number(t.pageY) || 0, fingers: touches.length || 1, moved: false };
    if ((touches.length || 1) > 1) return gesture();
    return false;
  }
  function touchMove(event) {
    const touches = event?.nativeEvent?.touches || [];
    const t = touches[0] || event?.nativeEvent || {};
    if (!state.touch) state.touch = { x: Number(t.pageX) || 0, y: Number(t.pageY) || 0, fingers: 1, moved: false };
    if (touches.length > 1) return gesture();
    const dx = (Number(t.pageX) || 0) - state.touch.x;
    const dy = (Number(t.pageY) || 0) - state.touch.y;
    if (Math.hypot(dx, dy) > DRAG_PX) return gesture();
    return false;
  }
  function touchEnd() {
    state.touch = null;
  }
  function gesture() {
    const was = state.touch?.moved;
    if (state.touch) state.touch.moved = true;
    state.userMoved = true;
    state.following = false;
    state.followedAt = null;
    state.stopped = true;
    return !was;
  }

  // A camera event (onRegionWillChange / onRegionDidChange). True when it is the user's move.
  function regionEvent(event) {
    const z = event?.properties?.zoomLevel;
    if (Number.isFinite(z)) state.zoom = z;
    if (state.touch?.moved) return true;
    if (event?.properties?.isUserInteraction !== true) return false;
    // MapLibre Android flags the app's own animations as user interaction; ignore those.
    if (now() < state.selfUntil) return false;
    state.userMoved = true;
    state.following = false;
    state.followedAt = null;
    state.stopped = true;
    return true;
  }

  return {
    sync,
    touchStart,
    touchMove,
    touchEnd,
    regionEvent,
    get zoom() { return state.zoom; },
    get moves() { return state.moves; },
    get userMoved() { return state.userMoved; }
  };
}

// Camera memory for the whole app session, outside any component, so a rebuilt map view, a
// rebuilt Map screen, or a map that recovered from an error opens where the user left it
// (before R7 a rebuilt screen opened at the GPS fix, zoom 11: "it zoomed back out").
let memory = null;
export function rememberMapCamera(next) {
  if (next && Array.isArray(next.center) && Number.isFinite(next.zoom)) memory = { center: [...next.center], zoom: next.zoom };
  return memory;
}
export function lastMapCamera() {
  return memory;
}
export function forgetMapCamera() {
  memory = null;
}
export { boxKey };
