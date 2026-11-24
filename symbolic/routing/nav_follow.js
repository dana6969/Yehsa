// Follow-along ("Start") mode: where you are on the route, the next turn and its distance,
// what to say and when, off-route detection (so the caller can reroute), and arrival.
import { distanceM, projectOnSegment } from "./geo.js";
import { spokenStep } from "./steps.js";

export function prepareRoute(route) {
  const pts = route.coordinates;
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + distanceM(pts[i - 1], pts[i]);
  const total = cum[pts.length - 1] || 0;
  const stepAt = route.steps.map((s) => cum[Math.min(pts.length - 1, Math.max(0, s.index || 0))]);
  return { ...route, cum, total, stepAt };
}

export function initialFollow() {
  return { seg: 0, offCount: 0, spoken: {}, arrived: false, lastProgress: 0 };
}

const THRESHOLDS = {
  drive: [2000, 600, 150],
  walk: [150, 30]
};

/**
 * One position sample. Returns { state, progressM, remainingM, remainingS, offRouteM, offRoute,
 * nextIndex, nextStep, toNextM, say, arrived, snapped }.
 */
export function followStep(prepared, state, fix, { profile = prepared.profile || "drive", units = "imperial" } = {}) {
  const pts = prepared.coordinates;
  const here = { latitude: fix.latitude, longitude: fix.longitude };
  const accuracy = Number.isFinite(fix.accuracy) ? fix.accuracy : 15;
  // Look near where we were first, then everywhere if that fails.
  const search = (lo, hi) => {
    let best = null;
    for (let i = Math.max(0, lo); i < Math.min(pts.length - 1, hi); i++) {
      const hit = projectOnSegment(here, pts[i], pts[i + 1]);
      if (!best || hit.distM < best.distM - 0.01) best = { ...hit, i };
    }
    return best;
  };
  let best = search(state.seg - 3, state.seg + 80);
  if (!best || best.distM > 60) {
    const wide = search(0, pts.length - 1);
    if (wide && (!best || wide.distM < best.distM)) best = wide;
  }
  if (!best) return { state, progressM: 0, remainingM: prepared.total, offRoute: false };
  const segLen = prepared.cum[best.i + 1] - prepared.cum[best.i];
  const progressM = prepared.cum[best.i] + best.t * segLen;
  const remainingM = Math.max(0, prepared.total - progressM);
  const offLimit = Math.max(profile === "walk" ? 30 : 45, accuracy * 1.5);
  const isOff = best.distM > offLimit;
  const offCount = isOff ? state.offCount + 1 : 0;
  let nextIndex = prepared.steps.length - 1;
  for (let k = 1; k < prepared.steps.length; k++) {
    if (prepared.stepAt[k] > progressM + 3) {
      nextIndex = k;
      break;
    }
  }
  const nextStep = prepared.steps[nextIndex];
  const toNextM = Math.max(0, prepared.stepAt[nextIndex] - progressM);
  const arrived = state.arrived || (remainingM < (profile === "walk" ? 15 : 30) && distanceM(here, pts[pts.length - 1]) < 60);
  const spoken = { ...state.spoken };
  let say = null;
  if (arrived && !state.arrived) {
    say = "You have arrived.";
  } else if (!arrived && offCount === 2) {
    say = "Off route. Finding a new way.";
  } else if (!arrived && !isOff && nextStep) {
    const marks = THRESHOLDS[profile] || THRESHOLDS.drive;
    const done = spoken[nextIndex] || 0;
    // Speak once per threshold crossed (far notice, near notice, now).
    for (let m = 0; m < marks.length; m++) {
      const level = m + 1;
      if (done < level && toNextM <= marks[m] && (m === marks.length - 1 || toNextM > marks[m + 1])) {
        say = spokenStep(nextStep, m === marks.length - 1 ? 0 : toNextM, { units });
        spoken[nextIndex] = level;
        break;
      }
      if (done < level && toNextM <= marks[m]) spoken[nextIndex] = level;
    }
  }
  const avgSpeed = prepared.total > 0 ? prepared.total / Math.max(1, prepared.durationS) : 1;
  return {
    state: { seg: best.i, offCount, spoken, arrived, lastProgress: progressM },
    progressM,
    remainingM,
    remainingS: remainingM / avgSpeed,
    offRouteM: best.distM,
    offRoute: offCount >= 2,
    nextIndex,
    nextStep,
    toNextM,
    say,
    arrived,
    snapped: best.point
  };
}
