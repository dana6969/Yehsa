// Offline barometer trend. The phone's pressure sensor logs one reading every 15 minutes
// while the Weather card is on, and 48 hours are kept. The trend is the change over the
// last 3 hours in the standard WMO / Met Office tendency bands. A climb or a drop in
// elevation moves pressure by about 1 hPa per 8 m, so the trend pauses when the person
// changes elevation and restarts from fresh readings. Pure JavaScript, no sensor access.

export const LOG_EVERY_MS = 15 * 60 * 1000;
export const KEEP_MS = 48 * 60 * 60 * 1000;
export const TREND_WINDOW_MS = 3 * 60 * 60 * 1000;
export const METERS_PER_HPA = 8;
// A GPS altitude that moves this far between readings counts as a change of elevation.
export const ELEVATION_PAUSE_M = 8;

// Edges as published: steady under 0.1, slowly 0.1 to 1.5, plain 1.6 to 3.5, quickly 3.6 to 6.0,
// very rapidly over 6.0. A change is rounded to 0.1 hPa first.
export const BANDS = [
  { id: "steady", max: 0.1, inclusive: false },
  { id: "slowly", max: 1.5, inclusive: true },
  { id: "plain", max: 3.5, inclusive: true },
  { id: "quickly", max: 6.0, inclusive: true },
  { id: "very-rapidly", max: Infinity, inclusive: true }
];

export const PAUSED_TEXT = "Trend paused, you changed elevation.";
export const NO_SENSOR_TEXT = "This phone has no barometer.";

export function emptyLog() {
  return { readings: [], elevationChangedAt: null };
}

function valid(hpa) {
  return Number.isFinite(hpa) && hpa > 300 && hpa < 1100;
}

// Add a reading. Skips one that lands inside the 15 minute spacing, drops anything older
// than 48 hours, and marks an elevation change when a GPS altitude jumps.
export function addReading(log, { t, hpa, altitudeM = null }) {
  const current = log || emptyLog();
  if (!Number.isFinite(t) || !valid(hpa)) return current;
  const last = current.readings[current.readings.length - 1];
  if (last && t - last.t < LOG_EVERY_MS - 30 * 1000) return current;
  let elevationChangedAt = current.elevationChangedAt;
  if (last && Number.isFinite(altitudeM) && Number.isFinite(last.altitudeM) && Math.abs(altitudeM - last.altitudeM) >= ELEVATION_PAUSE_M) {
    elevationChangedAt = t;
  }
  const entry = { t, hpa: Math.round(hpa * 100) / 100 };
  if (Number.isFinite(altitudeM)) entry.altitudeM = Math.round(altitudeM);
  const readings = [...current.readings, entry].filter((reading) => t - reading.t <= KEEP_MS);
  return { readings, elevationChangedAt };
}

// The person says they climbed or dropped. Readings before this moment never feed the trend.
export function markElevationChange(log, t) {
  const current = log || emptyLog();
  return { ...current, elevationChangedAt: Number.isFinite(t) ? t : Date.now() };
}

export function bandFor(delta) {
  const raw = Math.abs(delta);
  if (raw < 0.1) return "steady";
  const size = Math.max(0.1, Math.round(raw * 10) / 10);
  return BANDS.find((band) => (band.inclusive ? size <= band.max : size < band.max))?.id || "steady";
}

const WORDS = {
  steady: "Steady",
  slowly: "slowly",
  plain: "",
  quickly: "quickly",
  "very-rapidly": "very rapidly"
};

function labelFor(band, delta) {
  if (band === "steady") return "Steady";
  const direction = delta > 0 ? "Rising" : "Falling";
  return `${direction}${WORDS[band] ? ` ${WORDS[band]}` : ""}`;
}

function adviceFor(band, delta) {
  if (band === "steady") return "Pressure steady. No change signaled.";
  if (delta < 0) {
    if (band === "quickly" || band === "very-rapidly") return "Pressure dropping fast. Weather often turns worse within 12–24 h. Plan shelter and check the saved forecast.";
    return "Pressure falling. Unsettled weather is possible.";
  }
  return "Pressure rising. Conditions often improve.";
}

// The trend over the last 3 hours. Returns a state the screen can show as it is.
export function trendOf(log, now = Date.now(), { hasSensor = true } = {}) {
  if (!hasSensor) {
    return { state: "no-sensor", label: "No barometer", text: NO_SENSOR_TEXT, source: "none", delta: null };
  }
  const current = log || emptyLog();
  const fresh = current.readings.filter((reading) => !current.elevationChangedAt || reading.t >= current.elevationChangedAt);
  const paused = current.elevationChangedAt != null;
  if (fresh.length === 0) {
    return paused
      ? { state: "paused", label: "Paused", text: PAUSED_TEXT, source: "live sensor", delta: null }
      : { state: "collecting", label: "Collecting", text: "Reading the pressure. A trend needs about 3 hours of readings.", source: "live sensor", delta: null };
  }
  const latest = fresh[fresh.length - 1];
  const target = latest.t - TREND_WINDOW_MS;
  const base = fresh.reduce((best, reading) => (Math.abs(reading.t - target) < Math.abs(best.t - target) ? reading : best), fresh[0]);
  const span = latest.t - base.t;
  if (span < TREND_WINDOW_MS - 20 * 60 * 1000) {
    if (paused) return { state: "paused", label: "Paused", text: PAUSED_TEXT, source: "live sensor", delta: null, latest: latest.hpa };
    const minutes = Math.max(0, Math.round((TREND_WINDOW_MS - span) / 60000));
    return { state: "collecting", label: "Collecting", text: `Reading the pressure. About ${minutes} more minutes of readings for a trend.`, source: "live sensor", delta: null, latest: latest.hpa };
  }
  const rawDelta = latest.hpa - base.hpa;
  const delta = Math.round(rawDelta * 10) / 10;
  const band = bandFor(rawDelta);
  return {
    state: "trend",
    band,
    delta,
    latest: latest.hpa,
    label: labelFor(band, delta),
    text: adviceFor(band, delta),
    source: "live sensor",
    hours: Math.round((span / 3600000) * 10) / 10
  };
}

// Plain explanation of the elevation rule, for the screen.
export function elevationNote() {
  return `Climbing or dropping about ${METERS_PER_HPA} m changes the reading by about 1 hPa, so a trend across a climb would mislead. Tap "I changed elevation" after a climb and the trend restarts.`;
}

// Chart points for the last N hours, oldest first.
export function seriesFor(log, now = Date.now(), hours = 24) {
  const from = now - hours * 3600000;
  return (log?.readings || []).filter((reading) => reading.t >= from).map((reading) => ({ t: reading.t, hpa: reading.hpa }));
}

export function ageText(savedAt, now = Date.now()) {
  if (!Number.isFinite(savedAt)) return "";
  const minutes = Math.max(0, Math.round((now - savedAt) / 60000));
  if (minutes < 2) return "Saved just now";
  if (minutes < 90) return `Saved ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Saved ${hours} h ago`;
  return `Saved ${Math.round(hours / 24)} days ago`;
}
