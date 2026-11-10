// Offline spherical navigation. Mean earth radius, not a WGS84 survey ellipsoid.
// No network, no tiles, no city gazetteer. Not used by getMappedAction.

export const EARTH_RADIUS_KM = 6371;

export const SUN_LIMIT = "Approximate sunrise and sunset from NOAA low-accuracy solar equations with a standard 90.833° zenith. Often within a few minutes in mid-latitudes. Ignores terrain horizon, observer height, and weather. Polar day and polar night are reported instead of a clock time.";

const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function normalizeDegrees(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

export function normalizeLongitude(longitude) {
  const value = Number(longitude);
  if (!Number.isFinite(value)) return null;
  let wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  if (wrapped === -180) wrapped = 180;
  return wrapped;
}

export function compassLabel(degrees) {
  const normalized = normalizeDegrees(degrees);
  if (normalized == null) return null;
  const index = Math.round(normalized / 45) % 8;
  return { degrees: normalized, label: COMPASS_8[index] };
}

function pointOf(point) {
  if (!point || typeof point !== "object") return null;
  const latitude = Number(point.latitude ?? point.lat);
  const longitude = Number(point.longitude ?? point.lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function toRad(degrees) {
  return degrees * Math.PI / 180;
}

function toDeg(radians) {
  return radians * 180 / Math.PI;
}

export function haversineKm(from, to) {
  const start = pointOf(from);
  const end = pointOf(to);
  if (!start || !end) return null;
  const lat1 = toRad(start.latitude);
  const lat2 = toRad(end.latitude);
  const dLat = toRad(end.latitude - start.latitude);
  const dLon = toRad(end.longitude - start.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function initialBearingDeg(from, to) {
  const start = pointOf(from);
  const end = pointOf(to);
  if (!start || !end) return null;
  const lat1 = toRad(start.latitude);
  const lat2 = toRad(end.latitude);
  const dLon = toRad(end.longitude - start.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeDegrees(toDeg(Math.atan2(y, x)));
}

export function reverseBearingDeg(bearing) {
  const normalized = normalizeDegrees(bearing);
  if (normalized == null) return null;
  return normalizeDegrees(normalized + 180);
}

export function destinationPoint(from, bearingDeg, distanceKm) {
  const start = pointOf(from);
  const bearing = normalizeDegrees(bearingDeg);
  const distance = Number(distanceKm);
  if (!start || bearing == null || !Number.isFinite(distance) || distance < 0) return null;
  const angular = distance / EARTH_RADIUS_KM;
  const theta = toRad(bearing);
  const lat1 = toRad(start.latitude);
  const lon1 = toRad(start.longitude);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(theta)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(theta) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
  );
  return {
    latitude: toDeg(lat2),
    longitude: normalizeLongitude(toDeg(lon2))
  };
}

// East declination is positive: true bearing = magnetic bearing + declination.
export function magneticToTrue(magneticDeg, declinationDeg) {
  const magnetic = normalizeDegrees(magneticDeg);
  const declination = Number(declinationDeg);
  if (magnetic == null || !Number.isFinite(declination)) return null;
  return normalizeDegrees(magnetic + declination);
}

export function paceCount(distanceM, paceM) {
  const distance = Number(distanceM);
  const pace = Number(paceM);
  if (!Number.isFinite(distance) || !Number.isFinite(pace) || pace <= 0) return null;
  return distance / pace;
}

export function mapScaleMeters(mapCm, denominator) {
  const cm = Number(mapCm);
  const scale = Number(denominator);
  if (!Number.isFinite(cm) || !Number.isFinite(scale) || scale <= 0) return null;
  return cm * scale / 100;
}

export function contourClimbM(crossed, intervalM) {
  const lines = Number(crossed);
  const interval = Number(intervalM);
  if (!Number.isFinite(lines) || !Number.isFinite(interval)) return null;
  return lines * interval;
}

export function slopePercent(rise, run) {
  const up = Number(rise);
  const across = Number(run);
  if (!Number.isFinite(up) || !Number.isFinite(across) || across === 0) return null;
  return (up / across) * 100;
}

export function declinationAdjust(bearingDeg, declinationDeg, east) {
  const sign = east === false ? -1 : 1;
  return magneticToTrue(bearingDeg, sign * Number(declinationDeg));
}

export function naismithHours(distanceKm, ascentM) {
  const distance = Number(distanceKm);
  const ascent = Number(ascentM) || 0;
  if (!Number.isFinite(distance) || distance < 0) return null;
  return distance / 5 + Math.max(0, ascent) / 600;
}

export function sunFingerMinutes(fingers) {
  const count = Number(fingers);
  if (!Number.isFinite(count) || count < 0) return null;
  return count * 15;
}

export function trueToMagnetic(trueDeg, declinationDeg) {
  const geographic = normalizeDegrees(trueDeg);
  const declination = Number(declinationDeg);
  if (geographic == null || !Number.isFinite(declination)) return null;
  return normalizeDegrees(geographic - declination);
}

export function summarizeTrack(points) {
  const list = Array.isArray(points) ? points.map(pointOf).filter(Boolean) : [];
  let distanceKm = 0;
  for (let i = 1; i < list.length; i += 1) {
    distanceKm += haversineKm(list[i - 1], list[i]);
  }
  const times = (Array.isArray(points) ? points : [])
    .map((point) => Date.parse(point?.time))
    .filter((stamp) => Number.isFinite(stamp));
  const elapsedMs = times.length >= 2 ? times[times.length - 1] - times[0] : null;
  return {
    points: list.length,
    distanceKm,
    elapsedMs,
    timed: elapsedMs != null
  };
}

function wrapDegrees(value) {
  let next = value % 360;
  if (next < 0) next += 360;
  return next;
}

function julianDay(year, month, day) {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const century = Math.floor(y / 100);
  const gregorian = 2 - century + Math.floor(century / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + gregorian - 1524.5;
}

function geomMeanLongSun(t) {
  return wrapDegrees(280.46646 + t * (36000.76983 + 0.0003032 * t));
}

function geomMeanAnomalySun(t) {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t);
}

function eccentricityEarth(t) {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
}

function sunEqOfCenter(t) {
  const m = toRad(geomMeanAnomalySun(t));
  return Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * m) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * m) * 0.000289;
}

function sunApparentLong(t) {
  const omega = toRad(125.04 - 1934.136 * t);
  return geomMeanLongSun(t) + sunEqOfCenter(t) - 0.00569 - 0.00478 * Math.sin(omega);
}

function meanObliquity(t) {
  const seconds = 21.448 - t * (46.8150 + t * (0.00059 - t * 0.001813));
  return 23 + (26 + seconds / 60) / 60;
}

function obliquityCorrection(t) {
  const omega = toRad(125.04 - 1934.136 * t);
  return meanObliquity(t) + 0.00256 * Math.cos(omega);
}

function sunDeclination(t) {
  const epsilon = toRad(obliquityCorrection(t));
  const lambda = toRad(sunApparentLong(t));
  return toDeg(Math.asin(Math.sin(epsilon) * Math.sin(lambda)));
}

function equationOfTime(t) {
  const epsilon = toRad(obliquityCorrection(t));
  const l0 = toRad(geomMeanLongSun(t));
  const e = eccentricityEarth(t);
  const m = toRad(geomMeanAnomalySun(t));
  let y = Math.tan(epsilon / 2);
  y *= y;
  return toDeg(
    y * Math.sin(2 * l0)
    - 2 * e * Math.sin(m)
    + 4 * e * y * Math.sin(m) * Math.cos(2 * l0)
    - 0.5 * y * y * Math.sin(4 * l0)
    - 1.25 * e * e * Math.sin(2 * m)
  ) * 4;
}

function hourAngleSunrise(latitude, declination) {
  const latRad = toRad(latitude);
  const decRad = toRad(declination);
  const cosLat = Math.cos(latRad);
  if (Math.abs(cosLat) < 1e-6) {
    return { polar: latitude * declination >= 0 ? "day" : "night" };
  }
  const arg = Math.cos(toRad(90.833)) / (cosLat * Math.cos(decRad)) - Math.tan(latRad) * Math.tan(decRad);
  if (!Number.isFinite(arg) || arg < -1) return { polar: "day" };
  if (arg > 1) return { polar: "night" };
  return { ha: toDeg(Math.acos(arg)) };
}

function eventMinutes(rise, jd, latitude, longitude) {
  const t = (jd - 2451545.0) / 36525.0;
  const eqTime = equationOfTime(t);
  const declination = sunDeclination(t);
  const hour = hourAngleSunrise(latitude, declination);
  if (hour.polar) return hour;
  const signed = rise ? hour.ha : -hour.ha;
  return { minutes: 720 - 4 * (longitude + signed) - eqTime };
}

function formatClock(minutes) {
  let wrapped = ((minutes % 1440) + 1440) % 1440;
  let hh = Math.floor(wrapped / 60);
  let mm = Math.round(wrapped - hh * 60);
  if (mm === 60) {
    hh += 1;
    mm = 0;
  }
  if (hh === 24) hh = 0;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function calendarDate(input) {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return {
      year: input.getUTCFullYear(),
      month: input.getUTCMonth() + 1,
      day: input.getUTCDate()
    };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function sunriseSunset(latitude, longitude, date) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const calendar = calendarDate(date);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return { ok: false, reason: "latitude or longitude is out of range", note: SUN_LIMIT };
  }
  if (!calendar) return { ok: false, reason: "date must be YYYY-MM-DD", note: SUN_LIMIT };
  const jd = julianDay(calendar.year, calendar.month, calendar.day);
  let rise = eventMinutes(true, jd, lat, lon);
  let set = eventMinutes(false, jd, lat, lon);
  if (rise.polar || set.polar) {
    const polar = rise.polar || set.polar;
    return {
      ok: true,
      polar,
      sunriseUtc: null,
      sunsetUtc: null,
      daylightHours: polar === "day" ? 24 : 0,
      date: `${calendar.year}-${String(calendar.month).padStart(2, "0")}-${String(calendar.day).padStart(2, "0")}`,
      note: SUN_LIMIT
    };
  }
  rise = eventMinutes(true, jd + rise.minutes / 1440, lat, lon);
  set = eventMinutes(false, jd + set.minutes / 1440, lat, lon);
  if (rise.polar || set.polar || !Number.isFinite(rise.minutes) || !Number.isFinite(set.minutes)) {
    const polar = rise.polar || set.polar || "night";
    return {
      ok: true,
      polar,
      sunriseUtc: null,
      sunsetUtc: null,
      daylightHours: polar === "day" ? 24 : 0,
      date: `${calendar.year}-${String(calendar.month).padStart(2, "0")}-${String(calendar.day).padStart(2, "0")}`,
      note: SUN_LIMIT
    };
  }
  let span = set.minutes - rise.minutes;
  if (span < 0) span += 1440;
  return {
    ok: true,
    polar: null,
    sunriseUtc: formatClock(rise.minutes),
    sunsetUtc: formatClock(set.minutes),
    daylightHours: span / 60,
    date: `${calendar.year}-${String(calendar.month).padStart(2, "0")}-${String(calendar.day).padStart(2, "0")}`,
    note: SUN_LIMIT
  };
}
