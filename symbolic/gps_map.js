// GPS framing for the landscape canvas. No sensor reads and no network.
// Consent off drops every sample. Sharing is never set here.

import { compassLabel, haversineKm, initialBearingDeg } from "./landscape_math.js";
import { EXPO_LOCK_ACCURACY_M, normalizeFix } from "./position_fix.js";

const LOST_MS = 15000;
const CRUMB_M = 8;

export function initialGpsMap() {
  return {
    consent: false,
    status: "off",
    follow: false,
    fix: null,
    accuracyM: null,
    headingDeg: null,
    track: [],
    target: null,
    nav: null,
    seenAt: null,
    shared: false,
    background: false,
    note: "GPS is off until you turn it on."
  };
}

export function gpsWatchPlan({ consent, background = false } = {}) {
  if (consent !== true) {
    return {
      watch: false,
      foreground: false,
      background: false,
      reason: "Position lock is off. GPS is not read."
    };
  }
  return {
    watch: true,
    foreground: true,
    background: background === true,
    reason: null
  };
}

export function grantGpsConsent(session) {
  const current = session || initialGpsMap();
  return {
    ...current,
    consent: true,
    status: current.fix ? current.status : "searching",
    follow: true,
    shared: false,
    note: "Searching for satellites. Nothing is shared."
  };
}

export function revokeGpsConsent() {
  return initialGpsMap();
}

function headingOf(sample) {
  const heading = Number(sample?.heading);
  return Number.isFinite(heading) && heading >= 0 && heading <= 360 ? heading : null;
}

export function courseTo(from, to) {
  if (!from || !to) return null;
  const distanceKm = haversineKm(from, to);
  const bearingDeg = initialBearingDeg(from, to);
  if (!Number.isFinite(distanceKm) || !Number.isFinite(bearingDeg)) return null;
  const rose = compassLabel(bearingDeg);
  return {
    distanceKm,
    distanceM: distanceKm * 1000,
    bearingDeg,
    label: rose?.label || ""
  };
}

export function appendCrumb(track, fix) {
  const list = Array.isArray(track) ? track : [];
  const last = list[list.length - 1];
  if (last && haversineKm(last, fix) * 1000 < CRUMB_M) return list;
  return [...list, { latitude: fix.latitude, longitude: fix.longitude }].slice(-200);
}

export function applyGpsSample(session, sample, now = Date.now()) {
  const current = session || initialGpsMap();
  if (current.consent !== true) {
    return { ...initialGpsMap(), note: "GPS was not read. Consent is off." };
  }
  const point = normalizeFix(sample, "expo-location");
  if (!point || point.accuracy == null) {
    if (current.fix) {
      return {
        ...current,
        status: "lost",
        shared: false,
        note: "GPS signal lost. The last fix stays on the canvas and is not shared."
      };
    }
    return {
      ...current,
      status: "searching",
      shared: false,
      note: "Searching for satellites. Nothing is stored yet."
    };
  }
  const locked = point.accuracy <= EXPO_LOCK_ACCURACY_M;
  const heading = headingOf(sample);
  const track = appendCrumb(current.track, point);
  const nav = current.target ? courseTo(point, current.target) : null;
  return {
    ...current,
    status: locked ? "locked" : "searching",
    fix: point,
    accuracyM: point.accuracy,
    headingDeg: heading == null ? current.headingDeg : heading,
    track,
    nav,
    seenAt: now,
    shared: false,
    note: locked
      ? `GPS locked. Accuracy about ${Math.round(point.accuracy)} m. Not shared.`
      : `Searching. Accuracy about ${Math.round(point.accuracy)} m. Not shared.`
  };
}

export function markSignalLost(session, now = Date.now()) {
  const current = session || initialGpsMap();
  if (current.consent !== true || !current.fix || current.seenAt == null) return current;
  if (now - current.seenAt < LOST_MS) return current;
  return {
    ...current,
    status: "lost",
    shared: false,
    note: "GPS signal lost. The last fix stays on the canvas and is not shared."
  };
}

export function noteUserPan(session) {
  const current = session || initialGpsMap();
  return { ...current, follow: false };
}

export function recenterOnMe(session) {
  const current = session || initialGpsMap();
  if (current.consent !== true || !current.fix) return { ...current, follow: false };
  return { ...current, follow: true };
}

export function startNavigation(session, waypoint) {
  const current = session || initialGpsMap();
  if (!waypoint || !Number.isFinite(Number(waypoint.latitude))) {
    return { ...current, target: null, nav: null };
  }
  const target = {
    name: waypoint.name || "waypoint",
    latitude: Number(waypoint.latitude),
    longitude: Number(waypoint.longitude)
  };
  return {
    ...current,
    target,
    nav: current.fix ? courseTo(current.fix, target) : null
  };
}

export function mapRotationDeg(session) {
  const current = session || initialGpsMap();
  if (current.follow !== true || !Number.isFinite(current.headingDeg)) return 0;
  return -current.headingDeg;
}

export function gpsStatusLabel(session) {
  const current = session || initialGpsMap();
  if (current.consent !== true || current.status === "off") return "GPS is off";
  if (current.status === "locked") return `GPS locked. Accuracy ${Math.round(current.accuracyM)} m.`;
  if (current.status === "lost") return "GPS signal lost";
  if (current.accuracyM != null) return `Searching. Accuracy ${Math.round(current.accuracyM)} m.`;
  return "Searching for satellites";
}
