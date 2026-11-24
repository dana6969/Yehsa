// Small geometry helpers shared by the router, the place search and the follow-along mode.
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export function distanceM(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a, b) {
  const y = Math.sin(rad(b.longitude - a.longitude)) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) - Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Signed turn from heading a to heading b, -180..180 (negative = left). */
export function turnAngle(a, b) {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** Closest point on segment ab to p, in a local flat frame. Returns { t, point, distM }. */
export function projectOnSegment(p, a, b) {
  const kx = 111320 * Math.cos(rad(p.latitude));
  const ky = 110540;
  const ax = (a.longitude - p.longitude) * kx;
  const ay = (a.latitude - p.latitude) * ky;
  const bx = (b.longitude - p.longitude) * kx;
  const by = (b.latitude - p.latitude) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return {
    t,
    point: { latitude: a.latitude + t * (b.latitude - a.latitude), longitude: a.longitude + t * (b.longitude - a.longitude) },
    distM: Math.sqrt(x * x + y * y)
  };
}

export function pathLengthM(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
  return total;
}

export function formatDistance(m, { units = "imperial" } = {}) {
  if (!Number.isFinite(m)) return "";
  if (units === "metric") {
    if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
    return `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`;
  }
  const feet = m * 3.28084;
  if (feet < 1000) return `${Math.max(50, Math.round(feet / 50) * 50)} ft`;
  const miles = m / 1609.344;
  return `${miles.toFixed(miles < 9.5 ? 1 : 0)} mi`;
}

export function formatDuration(s) {
  if (!Number.isFinite(s)) return "";
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function boundsOf(points) {
  let south = 90, north = -90, west = 180, east = -180;
  for (const p of points) {
    if (p.latitude < south) south = p.latitude;
    if (p.latitude > north) north = p.latitude;
    if (p.longitude < west) west = p.longitude;
    if (p.longitude > east) east = p.longitude;
  }
  return { south, north, west, east };
}
