// Wind and the scent cone. The phone has no wind sensor, so wind comes from the saved forecast
// (tagged) or from what you enter: a compass direction the wind blows FROM, and calm, light,
// moderate or strong. The cone is about 30 degrees wide and points downwind. It widens to about
// 60 degrees when the wind is under 3 mph and swirling. Its length scales with speed and is
// illustrative, not a measured distance. Pure geometry, no map code.

import { destinationPoint, initialBearingDeg, haversineKm, normalizeDegrees } from "../landscape_math.js";

export const SPEED_CLASSES = [
  { id: "calm", label: "Calm", mph: 1, lengthM: 60 },
  { id: "light", label: "Light", mph: 5, lengthM: 120 },
  { id: "moderate", label: "Moderate", mph: 11, lengthM: 200 },
  { id: "strong", label: "Strong", mph: 20, lengthM: 300 }
];

export const NO_SENSOR = "This phone has no wind sensor. Enter the wind or use the saved forecast.";
export const DEER_TEXT = "Deer downwind (shaded) are likely to smell you.";
export const THERMALS_TIP = "Thermals: air drifts downhill in the evening and uphill after the morning sun.";
export const LENGTH_NOTE = "The length is illustrative, not a measured distance.";

export const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function classFor(mph) {
  if (!Number.isFinite(mph)) return SPEED_CLASSES[1];
  if (mph < 3) return SPEED_CLASSES[0];
  if (mph < 8) return SPEED_CLASSES[1];
  if (mph < 15) return SPEED_CLASSES[2];
  return SPEED_CLASSES[3];
}

export function pointToDegrees(point) {
  const index = COMPASS_POINTS.indexOf(String(point || "").toUpperCase());
  return index < 0 ? null : index * 45;
}

/**
 * fromDeg: the direction the wind blows from, in degrees. speed: { mph } or { cls }.
 * swirling: the person sees it swirl. Returns the cone's direction, width and length.
 */
export function scentCone({ fromDeg, mph, cls, swirling = false, source = "manual" }) {
  if (!Number.isFinite(fromDeg)) return { ok: false, text: "Pick the direction the wind is coming from." };
  const speed = cls ? SPEED_CLASSES.find((item) => item.id === cls) || classFor(mph) : classFor(mph);
  const effectiveMph = Number.isFinite(mph) ? mph : speed.mph;
  const downwindDeg = normalizeDegrees(fromDeg + 180);
  const wide = effectiveMph < 3 && swirling;
  const widthDeg = wide ? 60 : 30;
  return {
    ok: true,
    fromDeg: normalizeDegrees(fromDeg),
    downwindDeg,
    widthDeg,
    lengthM: speed.lengthM,
    speedClass: speed.id,
    swirling: wide,
    source,
    text: DEER_TEXT,
    notes: [LENGTH_NOTE, THERMALS_TIP, wide ? "Light, swirling air spreads your scent in every direction near you, so the cone is wider." : null].filter(Boolean)
  };
}

// The cone as map points around a stand: apex plus an arc, as latitude and longitude.
export function conePolygon(stand, cone, steps = 6) {
  if (!cone?.ok || !stand) return [];
  const points = [{ latitude: stand.latitude, longitude: stand.longitude }];
  const start = cone.downwindDeg - cone.widthDeg / 2;
  for (let i = 0; i <= steps; i += 1) {
    const bearing = start + (cone.widthDeg * i) / steps;
    const end = destinationPoint({ latitude: stand.latitude, longitude: stand.longitude }, bearing, cone.lengthM / 1000);
    points.push({ latitude: end.latitude, longitude: end.longitude });
  }
  points.push(points[0]);
  return points;
}

function inside(stand, point, cone) {
  const km = haversineKm(stand, point);
  if (km * 1000 > cone.lengthM) return false;
  if (km === 0) return true;
  const bearing = initialBearingDeg(stand, point);
  const off = Math.abs(((bearing - cone.downwindDeg + 540) % 360) - 180);
  return off <= cone.widthDeg / 2;
}

/**
 * stands: [{ name, latitude, longitude }]. avoid: [{ name, latitude, longitude, kind }]
 * (marked trails or bedding). A stand is good for this wind when the cone points away from all of them.
 */
export function bestStands(stands, avoid, cone) {
  if (!cone?.ok) return [];
  return (stands || []).map((stand) => {
    const hit = (avoid || []).filter((spot) => inside(stand, spot, cone));
    return {
      name: stand.name,
      good: hit.length === 0,
      reason: hit.length === 0
        ? "Your scent blows away from your marked trails and bedding."
        : `Your scent blows toward ${hit.map((spot) => spot.name || spot.kind || "a marked spot").join(", ")}.`,
      blocked: hit.map((spot) => spot.name || spot.kind)
    };
  }).sort((a, b) => Number(b.good) - Number(a.good));
}
