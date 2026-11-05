// Device-local landscape tools. Opt-in position, exterior deny.
// Stays off the symbol map hot path: getMappedAction does not import this module.

import fs from "fs";
import path from "path";
import { ensureLocalOwner } from "./device_owner.js";
import {
  compassLabel,
  destinationPoint,
  haversineKm,
  initialBearingDeg,
  reverseBearingDeg,
  sunriseSunset
} from "./landscape_math.js";

export const WAYPOINT_FILE = "symbolic_memory/waypoints.json";
export const TRACK_FILE = "symbolic_memory/track_log.json";
const POSITION_FILE = "symbolic_memory/position_lock.json";
const MAX_TRACK_POINTS = 2000;
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function emptyCoords(reason, ok = false) {
  return {
    ok,
    reason,
    fix: null,
    altitude: null,
    waypoints: [],
    points: null,
    distanceKm: null,
    bearingDeg: null
  };
}

function gate(options = {}) {
  if (options.ingress && options.ingress !== "local") {
    return emptyCoords("exterior denied");
  }
  const owner = ensureLocalOwner({ ownerPath: options.ownerPath, phoneId: options.phoneId });
  if (!owner.recognized) {
    return emptyCoords(owner.reason || "device ownership denied");
  }
  if (options.consent !== true) {
    return emptyCoords("position is opt-in; local consent is required");
  }
  return { ok: true, reason: null, owner };
}

function readJson(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeJson(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Some platforms ignore mode bits.
  }
}

export function normalizePoint(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const latitude = Number(raw.latitude ?? raw.lat);
  const longitude = Number(raw.longitude ?? raw.lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  const point = { latitude, longitude };
  if (raw.altitude != null && raw.altitude !== "") {
    const altitude = Number(raw.altitude);
    if (Number.isFinite(altitude) && altitude >= -500 && altitude <= 12000) point.altitude = altitude;
  }
  if (typeof raw.time === "string" && Number.isFinite(Date.parse(raw.time))) {
    point.time = new Date(Date.parse(raw.time)).toISOString();
  }
  return point;
}

function waypointName(name) {
  const value = String(name || "").trim().toLowerCase();
  return NAME_RE.test(value) ? value : null;
}

export function readLockedPosition(options = {}) {
  const gated = gate(options);
  if (!gated.ok) return gated;
  const file = options.positionPath || POSITION_FILE;
  const record = readJson(file);
  if (!record || record.locked !== true || record.consent !== "local" || record.exterior !== "deny" || record.owner !== true) {
    return {
      ok: true,
      locked: false,
      reason: "no consented position lock",
      fix: null,
      altitude: null
    };
  }
  const fix = normalizePoint(record);
  if (!fix) {
    return { ok: true, locked: false, reason: "consented fix is unreadable", fix: null, altitude: null };
  }
  return {
    ok: true,
    locked: true,
    reason: null,
    fix,
    altitude: fix.altitude ?? null
  };
}

export function elevationFromLock(options = {}) {
  const position = readLockedPosition(options);
  if (!position.ok || !position.fix) {
    return {
      ok: position.ok,
      altitude: null,
      unit: "m",
      reason: position.reason,
      fix: null
    };
  }
  if (position.altitude == null) {
    return {
      ok: true,
      altitude: null,
      unit: "m",
      reason: "consented fix has no altitude",
      fix: null
    };
  }
  return {
    ok: true,
    altitude: position.altitude,
    unit: "m",
    reason: null,
    fix: null
  };
}

function loadWaypoints(file, installId) {
  const record = readJson(file);
  if (!record) return { ok: true, waypoints: {}, installId };
  if (record.installId && record.installId !== installId) {
    return { ok: false, reason: "waypoint file is not this phone", waypoints: {} };
  }
  const waypoints = record.waypoints && typeof record.waypoints === "object" ? record.waypoints : {};
  return { ok: true, waypoints, installId: record.installId || installId };
}

export function saveWaypoint(name, point, options = {}) {
  const gated = gate(options);
  if (!gated.ok) return { ok: false, reason: gated.reason, waypoint: null };
  const id = waypointName(name);
  const normalized = normalizePoint(point);
  if (!id) return { ok: false, reason: "waypoint name must be letters, numbers, dash, or underscore", waypoint: null };
  if (!normalized) return { ok: false, reason: "waypoint coordinates are invalid", waypoint: null };
  const file = options.waypointPath || WAYPOINT_FILE;
  const loaded = loadWaypoints(file, gated.owner.installId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, waypoint: null };
  const waypoint = {
    name: id,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    savedAt: new Date().toISOString()
  };
  if (normalized.altitude != null) waypoint.altitude = normalized.altitude;
  loaded.waypoints[id] = waypoint;
  writeJson(file, {
    ownership: "local-device",
    exterior: "deny",
    installId: gated.owner.installId,
    waypoints: loaded.waypoints
  });
  return { ok: true, reason: null, waypoint };
}

export function listWaypoints(options = {}) {
  const gated = gate(options);
  if (!gated.ok) return { ok: false, reason: gated.reason, waypoints: [] };
  const file = options.waypointPath || WAYPOINT_FILE;
  const loaded = loadWaypoints(file, gated.owner.installId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, waypoints: [] };
  const waypoints = Object.values(loaded.waypoints)
    .map((entry) => normalizePoint(entry) && {
      name: waypointName(entry.name),
      latitude: Number(entry.latitude),
      longitude: Number(entry.longitude),
      altitude: entry.altitude == null ? null : Number(entry.altitude),
      savedAt: entry.savedAt || null
    })
    .filter((entry) => entry && entry.name);
  waypoints.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, reason: null, waypoints };
}

function courseBetween(from, to) {
  const distanceKm = haversineKm(from, to);
  const bearingDeg = initialBearingDeg(from, to);
  const reverseDeg = reverseBearingDeg(bearingDeg);
  const rose = compassLabel(bearingDeg);
  return { distanceKm, bearingDeg, reverseDeg, cardinal: rose?.label || null };
}

export function tripToWaypoint(name, options = {}) {
  const listed = listWaypoints(options);
  if (!listed.ok) {
    return { ok: false, reason: listed.reason, distanceKm: null, bearingDeg: null, waypoint: null };
  }
  const id = waypointName(name);
  const waypoint = listed.waypoints.find((entry) => entry.name === id);
  if (!waypoint) return { ok: false, reason: "waypoint not found", distanceKm: null, bearingDeg: null, waypoint: null };
  let from = normalizePoint(options.from);
  if (!from) {
    const position = readLockedPosition(options);
    if (!position.fix) {
      return {
        ok: false,
        reason: position.reason || "no consented position lock",
        distanceKm: null,
        bearingDeg: null,
        waypoint: null
      };
    }
    from = position.fix;
  }
  const course = courseBetween(from, waypoint);
  return { ok: true, reason: null, ...course, waypoint: { name: waypoint.name }, altitude: waypoint.altitude };
}

function loadTrack(file, installId) {
  const record = readJson(file);
  if (!record) return { ok: true, points: [] };
  if (record.installId && record.installId !== installId) {
    return { ok: false, reason: "track file is not this phone", points: [] };
  }
  const points = Array.isArray(record.points) ? record.points.map(normalizePoint).filter(Boolean) : [];
  return { ok: true, points };
}

export function appendTrackPoint(point, options = {}) {
  const gated = gate(options);
  if (!gated.ok) return { ok: false, reason: gated.reason, points: null };
  const normalized = normalizePoint(point);
  if (!normalized) return { ok: false, reason: "track point is invalid", points: null };
  const file = options.trackPath || TRACK_FILE;
  const loaded = loadTrack(file, gated.owner.installId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, points: null };
  loaded.points.push(normalized);
  const points = loaded.points.slice(-MAX_TRACK_POINTS);
  writeJson(file, {
    ownership: "local-device",
    exterior: "deny",
    installId: gated.owner.installId,
    points
  });
  return { ok: true, reason: null, count: points.length };
}

export function trackSummary(options = {}) {
  const gated = gate(options);
  if (!gated.ok) return { ok: false, reason: gated.reason, points: null, distanceKm: null, elapsedMs: null };
  const file = options.trackPath || TRACK_FILE;
  const loaded = loadTrack(file, gated.owner.installId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, points: null, distanceKm: null, elapsedMs: null };
  let distanceKm = 0;
  for (let i = 1; i < loaded.points.length; i += 1) {
    distanceKm += haversineKm(loaded.points[i - 1], loaded.points[i]);
  }
  const times = loaded.points.map((point) => Date.parse(point.time)).filter((stamp) => Number.isFinite(stamp));
  const elapsedMs = times.length >= 2 ? times[times.length - 1] - times[0] : null;
  return {
    ok: true,
    reason: elapsedMs == null && loaded.points.length >= 2 ? "no timestamps; distance only" : null,
    points: loaded.points.length,
    distanceKm,
    elapsedMs
  };
}

export function parseLatLonPairs(text) {
  const pairs = [];
  const re = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
  for (const match of String(text || "").matchAll(re)) {
    const point = normalizePoint({ latitude: match[1], longitude: match[2] });
    if (point) pairs.push(point);
  }
  return pairs;
}

function roundTo(value, places) {
  if (!Number.isFinite(value)) return null;
  return value.toFixed(places);
}

function wantsHere(text) {
  return /\b(from here|my position|locked position|current position|where i am)\b/i.test(text);
}

export function navigationSentence(raw, options = {}) {
  if (options.ingress && options.ingress !== "local") return null;
  const text = String(raw || "");
  const tool = /\b(distance|how far|bearing|course|heading|waypoint|goto|go to|sunrise|sunset|great[- ]circle|destination|declination|altitude|elevation)\b/i.test(text);
  if (!tool) return null;
  const pairs = parseLatLonPairs(text);
  const here = wantsHere(text);
  const sunAsked = /\b(sunrise|sunset)\b/i.test(text);
  const destAsked = /\bdestination\b/i.test(text);
  const elevAsked = /\b(my elevation|my altitude|altitude here|elevation here)\b/i.test(text);
  const waypointMatch = text.match(/\b(?:waypoint|goto|go to)\s+([a-z0-9_-]+)/i);

  if (sunAsked && (pairs[0] || here)) {
    let point = pairs[0] || null;
    if (!point && here) {
      const position = readLockedPosition({ ...options, consent: options.consent === true });
      if (!position.fix) {
        return { sentence: "Position lock is opt-in, so sunrise is not taken from stored coordinates." };
      }
      point = position.fix;
    }
    const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    const date = dateMatch ? dateMatch[1] : new Date();
    const sun = sunriseSunset(point.latitude, point.longitude, date);
    if (!sun.ok) return { sentence: "Those coordinates did not produce a sunrise estimate." };
    if (sun.polar === "day") {
      return { sentence: `On ${sun.date} this approximation keeps the sun above the horizon all day. It ignores terrain and can be off by minutes. Not a city forecast.` };
    }
    if (sun.polar === "night") {
      return { sentence: `On ${sun.date} this approximation keeps the sun below the horizon all day. It ignores terrain and can be off by minutes. Not a city forecast.` };
    }
    return { sentence: `Approximate sunrise ${sun.sunriseUtc} UTC and sunset ${sun.sunsetUtc} UTC on ${sun.date}. Terrain and height are ignored, and the clock can be off by a few minutes.` };
  }

  if (destAsked && pairs[0]) {
    const bearingMatch = text.match(/\bbearing\s+(-?\d+(?:\.\d+)?)/i);
    const distanceMatch = text.match(/\b(?:distance|for)\s+(\d+(?:\.\d+)?)\s*(km|kilometers|m|meters)?\b/i);
    if (bearingMatch && distanceMatch) {
      let distanceKm = Number(distanceMatch[1]);
      if (distanceMatch[2] && distanceMatch[2].startsWith("m") && distanceMatch[2] !== "km" && !distanceMatch[2].startsWith("kilometer")) {
        distanceKm /= 1000;
      }
      const point = destinationPoint(pairs[0], Number(bearingMatch[1]), distanceKm);
      if (!point) return null;
      const rose = compassLabel(Number(bearingMatch[1]));
      return { sentence: `The spherical destination is ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}, ${roundTo(distanceKm, 2)} km on ${roundTo(normalizeBearing(bearingMatch[1]), 0)}° (${rose.label}). Not a road route.` };
    }
  }

  if (waypointMatch && (pairs[0] || here || /\b(how far|distance|bearing|course|goto|go to)\b/i.test(text))) {
    const trip = tripToWaypoint(waypointMatch[1], {
      ...options,
      consent: options.consent === true,
      from: pairs[0] || null
    });
    if (!trip.ok) {
      if (trip.reason === "exterior denied") return null;
      if (/opt-in|consent|ownership|phone identity|not this phone/i.test(trip.reason || "")) {
        return { sentence: "Position lock is opt-in, so no stored coordinates are used for that course." };
      }
      return { sentence: "That waypoint is not in the local list, so no course was drawn." };
    }
    return { sentence: courseSentence(trip.distanceKm, trip.bearingDeg, `to waypoint ${trip.waypoint.name}`) };
  }

  if (elevAsked) {
    const elevation = elevationFromLock({ ...options, consent: options.consent === true });
    if (!elevation.ok || elevation.altitude == null) {
      if (/no altitude/i.test(elevation.reason || "")) {
        return { sentence: "The consented fix has no altitude, so height is left unknown. Contours on a map you carry still show shape." };
      }
      if (/exterior/i.test(elevation.reason || "")) return null;
      return { sentence: "Position lock is opt-in, so no stored altitude is used." };
    }
    return { sentence: `The consented fix includes an altitude of ${elevation.altitude} m. Treat it as a rough height, weaker than the horizontal fix.` };
  }

  if (pairs.length >= 2 && /\b(distance|how far|bearing|course|heading|great[- ]circle)\b/i.test(text)) {
    const course = courseBetween(pairs[0], pairs[1]);
    return { sentence: courseSentence(course.distanceKm, course.bearingDeg, "between the coordinates you gave") };
  }

  if (here && pairs.length === 1 && /\b(distance|how far|bearing|course|heading)\b/i.test(text)) {
    const position = readLockedPosition({ ...options, consent: options.consent === true });
    if (!position.fix) {
      return { sentence: "Position lock is opt-in, so no stored coordinates are used for that course." };
    }
    const course = courseBetween(position.fix, pairs[0]);
    return { sentence: courseSentence(course.distanceKm, course.bearingDeg, "from the consented position lock") };
  }

  if (/\bdeclination\b/i.test(text)) {
    const numbers = [...text.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:°|degrees)/gi)].map((item) => Number(item[1]));
    const decl = text.match(/\bdeclination\s+(-?\d+(?:\.\d+)?)/i);
    if (decl && numbers.length) {
      const magnetic = numbers.find((value) => value !== Number(decl[1]));
      if (magnetic != null) {
        const trueDeg = ((magnetic + Number(decl[1])) % 360 + 360) % 360;
        return { sentence: `With declination ${Number(decl[1])}° (east positive), magnetic ${magnetic}° plots as true ${trueDeg.toFixed(0)}°. This does not look up the local angle; use the value printed on your map.` };
      }
    }
  }

  return null;
}

function normalizeBearing(value) {
  const number = Number(value);
  return ((number % 360) + 360) % 360;
}

function courseSentence(distanceKm, bearingDeg, where) {
  const rose = compassLabel(bearingDeg);
  const back = reverseBearingDeg(bearingDeg);
  return `On a spherical earth the great-circle distance ${where} is ${roundTo(distanceKm, 2)} km, starting on ${roundTo(bearingDeg, 0)}° (${rose.label}). The reverse course is ${roundTo(back, 0)}°. Radius 6371 km. Not a road route and not a city map.`;
}
