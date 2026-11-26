// Compass math for the Field > Compass tool. Pure JavaScript, no sensors and no
// screen code, so node tests can check it. Android sensor conventions:
//   accelerometer vector points up when the phone rests (reaction to gravity),
//   device axes are x right, y toward the top edge, z out of the screen,
//   magnetometer is in microtesla.

const RAD = Math.PI / 180;

export function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

// Smallest signed turn from a to b, -180..180 (positive = clockwise / turn right).
export function angleDiff(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// Pick which phone direction counts as "forward". Lying flat the top edge points at the
// target; held upright the back of the phone does. Hysteresis stops flicker near 45 degrees.
export function chooseAxis(accel, previous = "flat") {
  const l = len(accel) || 1;
  const flatness = Math.abs(accel[2]) / l;
  if (previous === "flat") return flatness < 0.55 ? "upright" : "flat";
  return flatness > 0.68 ? "flat" : "upright";
}

// Tilt-compensated magnetic heading (degrees clockwise from magnetic north) of the chosen
// phone direction, or null when the two vectors are too small or parallel to trust.
export function tiltHeading(accel, mag, axis = "flat") {
  const la = len(accel);
  const lm = len(mag);
  if (!(la > 0.3) || !(lm > 1)) return null;
  const east = cross(mag, accel);
  const le = len(east);
  if (le < 0.05 * la * lm) return null; // field nearly parallel to gravity
  const e = scale(east, 1 / le);
  const n = cross(scale(accel, 1 / la), e);
  const v = axis === "upright" ? [0, 0, -1] : [0, 1, 0];
  return norm360(Math.atan2(dot(e, v), dot(n, v)) / RAD);
}

// Dip angle seen by the phone (degrees, positive when the field points down).
export function measuredDip(accel, mag) {
  const la = len(accel);
  const lm = len(mag);
  if (!la || !lm) return null;
  return Math.asin(Math.max(-1, Math.min(1, -dot(accel, mag) / (la * lm)))) / RAD;
}

// Low-pass filter for vectors and a circular smoother for the final heading.
export function lowPassVector(previous, next, alpha) {
  if (!previous) return next.slice();
  return [previous[0] + alpha * (next[0] - previous[0]), previous[1] + alpha * (next[1] - previous[1]), previous[2] + alpha * (next[2] - previous[2])];
}

export function smoothHeading(previous, next, { minAlpha = 0.12, maxAlpha = 0.6 } = {}) {
  if (previous == null) return next;
  const diff = angleDiff(previous, next);
  // Small wobble is damped hard; a real turn is followed quickly.
  const alpha = Math.min(maxAlpha, minAlpha + Math.abs(diff) / 70);
  return norm360(previous + alpha * diff);
}

// A small tracker that owns the filters. Feed it sensor readings; read heading and quality.
export function createCompassFilter({ vectorAlpha = 0.22 } = {}) {
  let accel = null;
  let mag = null;
  let heading = null;
  let axis = "flat";
  const recent = [];
  return {
    pushAccel(v) {
      accel = lowPassVector(accel, v, vectorAlpha);
    },
    pushMag(v) {
      mag = lowPassVector(mag, v, vectorAlpha);
    },
    update(now = Date.now()) {
      if (!accel || !mag) return null;
      axis = chooseAxis(accel, axis);
      const raw = tiltHeading(accel, mag, axis);
      if (raw == null) return null;
      heading = smoothHeading(heading, raw);
      recent.push({ t: now, h: raw });
      while (recent.length && now - recent[0].t > 2000) recent.shift();
      return heading;
    },
    state() {
      return { accel, mag, heading, axis, jitter: circularSpread(recent.map((r) => r.h)) };
    },
    reset() {
      accel = null;
      mag = null;
      heading = null;
      recent.length = 0;
    }
  };
}

// Circular standard deviation in degrees.
export function circularSpread(headings) {
  if (!headings || headings.length < 4) return null;
  let s = 0;
  let c = 0;
  for (const h of headings) {
    s += Math.sin(h * RAD);
    c += Math.cos(h * RAD);
  }
  const r = Math.hypot(s, c) / headings.length;
  if (r >= 1) return 0;
  return Math.sqrt(-2 * Math.log(Math.max(r, 1e-9))) / RAD;
}

// Accuracy indicator. `expected` comes from the offline WMM at the user's place when a
// position is known: { totalUt, inclination }. Words, not colour alone.
export function accuracyLevel({ mag, accel, jitter, expected }) {
  const reasons = [];
  let bad = 0;
  let warn = 0;
  const strength = mag ? len(mag) : 0;
  if (!mag || !accel) return { level: "unknown", label: "Waiting for sensors", reasons: ["No sensor readings yet."], advice: "" };
  if (strength < 8 || strength > 120) {
    bad += 2;
    reasons.push(`Field strength ${strength.toFixed(0)} µT is not a normal reading for the Earth.`);
  } else if (expected?.totalUt) {
    const ratio = strength / expected.totalUt;
    if (ratio < 0.6 || ratio > 1.5) {
      bad += 1;
      reasons.push(`Field strength ${strength.toFixed(0)} µT, expected about ${expected.totalUt.toFixed(0)} µT here. Metal or a magnet may be close.`);
    } else if (ratio < 0.75 || ratio > 1.3) {
      warn += 1;
      reasons.push(`Field strength ${strength.toFixed(0)} µT is a little off the expected ${expected.totalUt.toFixed(0)} µT.`);
    }
  }
  const dip = measuredDip(accel, mag);
  if (expected && Number.isFinite(expected.inclination) && dip != null) {
    const d = Math.abs(dip - expected.inclination);
    if (d > 20) {
      bad += 1;
      reasons.push(`Field angle is ${d.toFixed(0)}° off the expected dip. Calibrate and move away from metal.`);
    } else if (d > 10) {
      warn += 1;
      reasons.push(`Field angle is ${d.toFixed(0)}° off the expected dip.`);
    }
  }
  if (jitter != null) {
    if (jitter > 5) {
      warn += 1;
      reasons.push("The reading is jumping. Hold the phone steady.");
    }
    if (jitter > 12) bad += 1;
  }
  let level = "high";
  if (bad >= 2) level = "unreliable";
  else if (bad === 1 || warn >= 2) level = "low";
  else if (warn === 1) level = "medium";
  const label = { high: "High", medium: "Medium", low: "Low", unreliable: "Unreliable" }[level];
  const advice = level === "high" ? "" : level === "medium" ? "Fine for a rough heading." : "Do a figure-8 calibration away from metal, cars and electronics, then check again.";
  return { level, label, reasons, advice };
}

// ---------- Figure-8 calibration ----------

function solve4(A, b) {
  // Gaussian elimination with partial pivoting for a 4 by 4 system.
  const n = 4;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-9) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r += 1) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j += 1) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

// Least-squares sphere fit: |m - c|^2 = r^2. Returns the centre (hard-iron offset), radius and rms error.
export function fitSphere(samples) {
  if (!samples || samples.length < 20) return null;
  const AtA = Array.from({ length: 4 }, () => new Array(4).fill(0));
  const Atb = new Array(4).fill(0);
  for (const m of samples) {
    const row = [2 * m[0], 2 * m[1], 2 * m[2], 1];
    const y = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) AtA[i][j] += row[i] * row[j];
      Atb[i] += row[i] * y;
    }
  }
  const x = solve4(AtA, Atb);
  if (!x) return null;
  const centre = [x[0], x[1], x[2]];
  const r2 = x[3] + centre[0] ** 2 + centre[1] ** 2 + centre[2] ** 2;
  if (!(r2 > 0)) return null;
  const radius = Math.sqrt(r2);
  let err = 0;
  for (const m of samples) {
    const d = Math.hypot(m[0] - centre[0], m[1] - centre[1], m[2] - centre[2]);
    err += (d - radius) ** 2;
  }
  return { centre, radius, rms: Math.sqrt(err / samples.length), relative: Math.sqrt(err / samples.length) / radius };
}

export function createCalibration({ expectedUt = null } = {}) {
  const samples = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  return {
    add(m) {
      if (!m || !Number.isFinite(m[0] + m[1] + m[2])) return;
      const last = samples[samples.length - 1];
      if (last && Math.hypot(m[0] - last[0], m[1] - last[1], m[2] - last[2]) < 0.4) return; // skip repeats
      samples.push(m.slice());
      if (samples.length > 600) samples.shift();
      for (let i = 0; i < 3; i += 1) {
        min[i] = Math.min(min[i], m[i]);
        max[i] = Math.max(max[i], m[i]);
      }
    },
    count: () => samples.length,
    // 0..1: how much of the sphere of directions has been swept. Full when every axis has swung
    // through 1.5 times the field strength (a full sphere swings through 2 times).
    progress() {
      if (samples.length < 5) return 0;
      const r = expectedUt || medianMagnitude(samples) || 45;
      let p = 0;
      for (let i = 0; i < 3; i += 1) p += Math.min(1, (max[i] - min[i]) / (1.5 * r));
      return Math.min(1, p / 3);
    },
    finish() {
      if (this.progress() < 0.95) return { ok: false, reason: "Keep turning the phone through the figure-8 until the bar is full." };
      const fit = fitSphere(samples);
      if (!fit) return { ok: false, reason: "The readings were too flat to fit. Try the figure-8 again." };
      if (fit.relative > 0.12 || fit.radius < 10 || fit.radius > 100) {
        return { ok: false, reason: "The readings are noisy. Move away from metal, cars and electronics and try again.", fit };
      }
      const offset = Math.hypot(...fit.centre);
      return { ok: true, offset: fit.centre, offsetUt: offset, radius: fit.radius, relative: fit.relative };
    }
  };
}

function medianMagnitude(samples) {
  const v = samples.map((m) => len(m)).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

export function applyOffset(mag, offset) {
  if (!offset) return mag;
  return [mag[0] - offset[0], mag[1] - offset[1], mag[2] - offset[2]];
}

export function openCalibration(raw) {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || !Array.isArray(value.offset) || value.offset.length !== 3 || !value.offset.every(Number.isFinite)) return null;
    return { offset: value.offset, savedAt: String(value.savedAt || ""), offsetUt: Number(value.offsetUt) || 0, relative: Number(value.relative) || 0 };
  } catch {
    return null;
  }
}

// ---------- Bearings ----------

// Convert between true and magnetic using declination (east positive).
export const trueFromMagnetic = (magnetic, declination) => norm360(magnetic + declination);
export const magneticFromTrue = (trueDeg, declination) => norm360(trueDeg - declination);

export function backBearing(deg) {
  return norm360(deg + 180);
}

// How to steer: positive delta means turn right.
export function steerText(current, target, tolerance = 5) {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= tolerance) return { onTarget: true, delta: d, text: "On the bearing" };
  return { onTarget: false, delta: d, text: `Turn ${d > 0 ? "right" : "left"} ${Math.round(Math.abs(d))}°` };
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export function pointName(deg) {
  return POINTS[Math.round(norm360(deg) / 22.5) % 16];
}

export function formatDistance(km) {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? km.toFixed(2) : km.toFixed(1)} km`;
}

export function declinationWords(decl) {
  if (!Number.isFinite(decl)) return "";
  const a = Math.abs(decl);
  return `${a.toFixed(1)}° ${decl >= 0 ? "east" : "west"}`;
}
