// Landscape helpers for the phone screen. Same sphere as landscape_math.js.
// Typed coordinates are the input. A locked fix is used only when the caller passes it.

import {
  compassLabel,
  haversineKm,
  initialBearingDeg,
  magneticToTrue,
  reverseBearingDeg,
  summarizeTrack,
  sunriseSunset,
  SUN_LIMIT
} from "./landscape_math.js";
import { courseSentence } from "./nav_sentence.js";

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function parsePair(value) {
  const match = /^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/.exec(String(value || "").trim());
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function formatPair(point) {
  if (!point) return "";
  return `${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}`;
}

export function courseText(fromText, toText) {
  const from = parsePair(fromText);
  const to = parsePair(toText);
  if (!from || !to) {
    return {
      ok: false,
      text: "Enter each point as latitude, longitude. For example 45.10000, -69.20000."
    };
  }
  const distanceKm = haversineKm(from, to);
  const bearing = initialBearingDeg(from, to);
  return { ok: true, text: courseSentence(distanceKm, bearing, "between the coordinates you gave") };
}

export function declinationText(magneticText, declinationTextValue) {
  if (!String(magneticText ?? "").trim() || !String(declinationTextValue ?? "").trim()) {
    return {
      ok: false,
      text: "Enter the magnetic bearing and the declination printed on your map. East is positive. Nothing is looked up."
    };
  }
  const geographic = magneticToTrue(magneticText, declinationTextValue);
  if (geographic == null) {
    return {
      ok: false,
      text: "Enter the magnetic bearing and the declination printed on your map. East is positive. Nothing is looked up."
    };
  }
  const rose = compassLabel(geographic);
  return {
    ok: true,
    text: `With declination ${Number(declinationTextValue)}° (east positive), magnetic ${Number(magneticText)}° plots as true ${geographic.toFixed(0)}° (${rose.label}). This does not look up the local angle; use the value printed on your map.`
  };
}

export function sunText(coordText, dateText) {
  const point = parsePair(coordText);
  if (!point) {
    return { ok: false, text: "Enter latitude, longitude before asking for sunrise." };
  }
  const date = String(dateText || "").trim();
  const sun = sunriseSunset(point.latitude, point.longitude, date);
  if (!sun.ok) {
    return { ok: false, text: `${sun.reason}. ${SUN_LIMIT}` };
  }
  if (sun.polar === "day") {
    return {
      ok: true,
      text: `On ${sun.date} this approximation keeps the sun above the horizon all day. ${SUN_LIMIT}`
    };
  }
  if (sun.polar === "night") {
    return {
      ok: true,
      text: `On ${sun.date} this approximation keeps the sun below the horizon all day. ${SUN_LIMIT}`
    };
  }
  return {
    ok: true,
    text: `Approximate sunrise ${sun.sunriseUtc} UTC and sunset ${sun.sunsetUtc} UTC on ${sun.date}. Daylight is about ${Number(sun.daylightHours).toFixed(2)} hours. ${SUN_LIMIT}`
  };
}

export function waypointName(name) {
  const value = String(name || "").trim().toLowerCase();
  return NAME_RE.test(value) ? value : null;
}

export function saveSessionWaypoint(list, { consent, name, pointText, altitudeText }) {
  const current = Array.isArray(list) ? list : [];
  if (consent !== true) {
    return {
      ok: false,
      list: current,
      text: "Waypoints stay closed until you consent on the Position screen."
    };
  }
  const id = waypointName(name);
  if (!id) {
    return {
      ok: false,
      list: current,
      text: "Use a short name of letters, numbers, dashes, or underscores."
    };
  }
  const point = parsePair(pointText);
  if (!point) {
    return { ok: false, list: current, text: "Enter the waypoint as latitude, longitude." };
  }
  const waypoint = {
    name: id,
    latitude: point.latitude,
    longitude: point.longitude,
    savedAt: new Date().toISOString()
  };
  if (String(altitudeText || "").trim()) {
    const altitude = Number(altitudeText);
    if (!Number.isFinite(altitude) || altitude < -500 || altitude > 12000) {
      return { ok: false, list: current, text: "Altitude must be a height in meters between -500 and 12000, or left blank." };
    }
    waypoint.altitude = altitude;
  }
  const next = current.filter((entry) => entry.name !== id);
  next.push(waypoint);
  next.sort((a, b) => a.name.localeCompare(b.name));
  return {
    ok: true,
    list: next,
    text: `Saved ${id} for this Yehsa session. It is not written into the Termux owner files.`
  };
}

export function gotoSessionWaypoint(list, { consent, name, fromText, locked }) {
  const id = waypointName(name);
  const waypoint = (Array.isArray(list) ? list : []).find((entry) => entry.name === id);
  if (!waypoint) {
    return { ok: false, text: "That waypoint is not in the list on this screen." };
  }
  const typed = parsePair(fromText);
  let from = typed;
  if (!from) {
    if (consent !== true || !locked) {
      return {
        ok: false,
        text: "Enter a starting latitude, longitude, or consent and hold a position before using the locked one."
      };
    }
    from = { latitude: locked.latitude, longitude: locked.longitude };
  }
  const distanceKm = haversineKm(from, waypoint);
  const bearing = initialBearingDeg(from, waypoint);
  const where = typed ? `to waypoint ${waypoint.name}` : `to waypoint ${waypoint.name} from the consented position lock`;
  const back = reverseBearingDeg(bearing);
  const rose = compassLabel(bearing);
  return {
    ok: true,
    text: `On a spherical earth the great-circle distance ${where} is ${distanceKm.toFixed(2)} km, starting on ${bearing.toFixed(0)}° (${rose.label}). The reverse course is ${back.toFixed(0)}°. Radius 6371 km. Not a road route and not a city map.`
  };
}

export function addSessionTrack(points, { consent, pointText, altitudeText, timeText }) {
  const current = Array.isArray(points) ? points : [];
  if (consent !== true) {
    return { ok: false, points: current, text: "The track stays closed until you consent on the Position screen." };
  }
  const point = parsePair(pointText);
  if (!point) {
    return { ok: false, points: current, text: "Enter the track point as latitude, longitude." };
  }
  const nextPoint = { latitude: point.latitude, longitude: point.longitude };
  if (String(altitudeText || "").trim()) {
    const altitude = Number(altitudeText);
    if (!Number.isFinite(altitude) || altitude < -500 || altitude > 12000) {
      return { ok: false, points: current, text: "Altitude must be a height in meters between -500 and 12000, or left blank." };
    }
    nextPoint.altitude = altitude;
  }
  if (String(timeText || "").trim()) {
    const stamp = Date.parse(timeText);
    if (!Number.isFinite(stamp)) {
      return { ok: false, points: current, text: "Time should look like 2026-01-01T00:00:00Z, or be left blank." };
    }
    nextPoint.time = new Date(stamp).toISOString();
  }
  return {
    ok: true,
    points: [...current, nextPoint].slice(-2000),
    text: "Point added to this session's track. It is not shared."
  };
}

export function trackText(points) {
  const summary = summarizeTrack(points);
  if (!summary.points) {
    return { ok: true, text: "No track points yet. Add one after you consent, or leave the track empty." };
  }
  const time = summary.elapsedMs == null
    ? "No timestamps, so only distance is counted."
    : `Elapsed time is ${Math.round(summary.elapsedMs / 60000)} minutes.`;
  return {
    ok: true,
    text: `${summary.points} points on this session's track. Great-circle distance ${summary.distanceKm.toFixed(2)} km. ${time} This is your own line, not a road, and it is not sent.`
  };
}

export function lockedFill(position) {
  if (!position || position.consent !== true || position.status !== "locked" || !position.fix) {
    return {
      ok: false,
      text: "Locked position is available only after you consent and hold a fix on the Position screen."
    };
  }
  return { ok: true, text: formatPair(position.fix), fix: position.fix };
}
