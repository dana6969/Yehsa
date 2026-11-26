// One landscape sentence for a question. File access stays in landscape_nav.js.
// Pass readLockedPosition, tripToWaypoint, and elevationFromLock when a store exists.
// The phone shell passes a session store. There is no network and no city lookup.

import {
  compassLabel,
  destinationPoint,
  contourClimbM,
  declinationAdjust,
  haversineKm,
  initialBearingDeg,
  mapScaleMeters,
  naismithHours,
  paceCount,
  reverseBearingDeg,
  slopePercent,
  sunFingerMinutes,
  sunriseSunset
} from "./landscape_math.js";

function pointOf(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const latitude = Number(raw.latitude ?? raw.lat);
  const longitude = Number(raw.longitude ?? raw.lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function parseLatLonPairs(text) {
  const pairs = [];
  const re = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
  for (const match of String(text || "").matchAll(re)) {
    const point = pointOf({ latitude: match[1], longitude: match[2] });
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

function normalizeBearing(value) {
  const number = Number(value);
  return ((number % 360) + 360) % 360;
}

function courseBetween(from, to) {
  const distanceKm = haversineKm(from, to);
  const bearingDeg = initialBearingDeg(from, to);
  const reverseDeg = reverseBearingDeg(bearingDeg);
  const rose = compassLabel(bearingDeg);
  return { distanceKm, bearingDeg, reverseDeg, cardinal: rose?.label || null };
}

export function courseSentence(distanceKm, bearingDeg, where) {
  const rose = compassLabel(bearingDeg);
  const back = reverseBearingDeg(bearingDeg);
  return `On a spherical earth the great-circle distance ${where} is ${roundTo(distanceKm, 2)} km, starting on ${roundTo(bearingDeg, 0)}° (${rose.label}). The reverse course is ${roundTo(back, 0)}°. Radius 6371 km. Not a road route and not a city map.`;
}

function missing(name) {
  return () => {
    throw new Error(`navigationSentence needs ${name}`);
  };
}

/**
 * @param {string} raw
 * @param {object} options
 * @param {object} io readLockedPosition, tripToWaypoint, elevationFromLock
 */
export function navigationSentence(raw, options = {}, io = {}) {
  if (options.ingress && options.ingress !== "local") return null;
  const readLockedPosition = io.readLockedPosition || missing("readLockedPosition");
  const tripToWaypoint = io.tripToWaypoint || missing("tripToWaypoint");
  const elevationFromLock = io.elevationFromLock || missing("elevationFromLock");
  const text = String(raw || "");
  const tool = /\b(distance|how far|bearing|course|heading|waypoint|goto|go to|sunrise|sunset|great[- ]circle|destination|declination|altitude|elevation|pace|map scale|scale\s+1|contour|slope|grade|naismith|finger widths?|back bearing|climb|walking time|straight[- ]line|grid)\b/i.test(text);
  if (!tool) return null;
  const grids = [...text.matchAll(/\bgrid\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/gi)];
  if (grids.length >= 2) {
    const x1 = Number(grids[0][1]);
    const y1 = Number(grids[0][2]);
    const x2 = Number(grids[1][1]);
    const y2 = Number(grids[1][2]);
    const meters = Math.hypot(x2 - x1, y2 - y1);
    return { sentence: `The straight-line distance between those grid points is ${roundTo(meters, 1)} in the same units as the grid. This is not a road route.` };
  }
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

  const back = text.match(/\bback bearing(?: of| is| for)?\s+(-?\d+(?:\.\d+)?)/i);
  if (back) {
    const reverse = reverseBearingDeg(Number(back[1]));
    return { sentence: `The back bearing of ${back[1]}° is ${roundTo(reverse, 0)}°.` };
  }
  const pace = text.match(/(\d+(?:\.\d+)?)\s+meters?.{0,40}pace(?: length)?(?: of| is)?\s+(\d+(?:\.\d+)?)\s+meters?/i);
  if (pace) {
    const count = paceCount(Number(pace[1]), Number(pace[2]));
    return { sentence: `${pace[1]} meters at a ${pace[2]} m pace is about ${roundTo(count, 0)} paces.` };
  }
  const paceRate = text.match(/(\d+(?:\.\d+)?)\s+paces?\s+per\s+(\d+(?:\.\d+)?)\s+meters?/);
  const paceAsked = text.match(/(\d+(?:\.\d+)?)\s+paces?\b(?!\s+per)/);
  if (paceRate && paceAsked) {
    const paces = Number(paceAsked[1]);
    const per = Number(paceRate[1]);
    const meters = Number(paceRate[2]);
    if (per > 0) {
      const distance = paces / per * meters;
      return { sentence: `${paceAsked[1]} paces, at ${paceRate[1]} paces per ${paceRate[2]} m, is about ${roundTo(distance, 1)} m.` };
    }
  }
  const scale = text.match(/scale\s+1\s*(?:to|:)\s*(\d+(?:\.\d+)?).{0,80}(\d+(?:\.\d+)?)\s+centimeters?/i);
  if (scale) {
    const meters = mapScaleMeters(Number(scale[2]), Number(scale[1]));
    return { sentence: `At 1:${scale[1]}, ${scale[2]} cm on the map is ${roundTo(meters, 1)} m on the ground.` };
  }
  const contours = text.match(/(\d+)\s+contours?.{0,40}interval(?:\s+of)?\s+(\d+(?:\.\d+)?)\s+meters?/i);
  if (contours) {
    const climb = contourClimbM(Number(contours[1]), Number(contours[2]));
    return { sentence: `Crossing ${contours[1]} contours at a ${contours[2]} m interval is ${roundTo(climb, 0)} m of climb.` };
  }
  const slope = text.match(/rise(?:\s+of)?\s+(\d+(?:\.\d+)?).{0,40}run(?:\s+of)?\s+(\d+(?:\.\d+)?)/i);
  if (slope) {
    const percent = slopePercent(Number(slope[1]), Number(slope[2]));
    return { sentence: `A rise of ${slope[1]} over a run of ${slope[2]} is a ${roundTo(percent, 1)} percent grade.` };
  }
  const walk = text.match(/(\d+(?:\.\d+)?)\s+km\b.{0,80}?(\d+(?:\.\d+)?)\s+meters?\s+of\s+climb/i);
  if (walk) {
    const hours = naismithHours(Number(walk[1]), Number(walk[2]));
    return { sentence: `Naismith's rule gives about ${roundTo(hours, 2)} hours for ${walk[1]} km and ${walk[2]} m of climb. That is a walking estimate, not a trail promise.` };
  }
  const fingers = text.match(/(\d+(?:\.\d+)?)\s+finger widths?/i);
  if (fingers && /\b(sun|horizon)\b/i.test(text)) {
    const minutes = sunFingerMinutes(Number(fingers[1]));
    return { sentence: `${fingers[1]} finger widths from the sun to the horizon is about ${roundTo(minutes, 0)} minutes. This is a rough field estimate.` };
  }

  if (/\bdeclination\b/i.test(text)) {
    const numbers = [...text.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:°|degrees)/gi)].map((item) => Number(item[1]));
    const decl = text.match(/\bdeclination\s+(?:of\s+)?(-?\d+(?:\.\d+)?)(?:\s*(east|west))?/i);
    const west = /\bwest\b/i.test(text) && !/\beast\b/i.test(text);
    if (decl && numbers.length) {
      const magnetic = numbers.find((value) => value !== Number(decl[1]));
      if (magnetic != null) {
        const signed = west || decl[2] === "west" ? -Math.abs(Number(decl[1])) : Number(decl[1]);
        const trueDeg = declinationAdjust(magnetic, Math.abs(signed), signed >= 0);
        const side = signed < 0 ? "west" : "east";
        return { sentence: `With declination ${Math.abs(signed)}° ${side}, magnetic ${magnetic}° plots as true ${trueDeg.toFixed(0)}°. East is added and west is subtracted. This does not look up the local angle; use the value printed on your map.` };
      }
    }
  }

  return null;
}
