// Saved weather: the last National Weather Service alerts and hourly forecast, kept with the
// time they were saved. Downloading needs signal and your approval, once, for one place.
// Nothing here runs on its own. An alert past its expiry shows greyed out. Pure parsing.

import { ageText } from "./baro.js";

export const NWS_HEADERS = { Accept: "application/geo+json", "User-Agent": "Yehsa offline survival app (no account)" };

export function alertsUrl(lat, lon) {
  return `https://api.weather.gov/alerts/active?point=${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

export function pointsUrl(lat, lon) {
  return `https://api.weather.gov/points/${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

function time(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseAlerts(geojson) {
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  return features.map((feature) => {
    const p = feature?.properties || {};
    return {
      id: String(p.id || feature.id || p.event || ""),
      event: String(p.event || "Weather alert"),
      headline: String(p.headline || p.event || ""),
      severity: String(p.severity || "Unknown"),
      starts: time(p.onset || p.effective),
      expires: time(p.ends || p.expires),
      instruction: p.instruction ? String(p.instruction).slice(0, 600) : ""
    };
  }).filter((alert) => alert.event);
}

function mph(text) {
  const match = /(\d+)(?:\s*to\s*(\d+))?\s*mph/i.exec(String(text || ""));
  if (!match) return null;
  return match[2] ? Math.round((Number(match[1]) + Number(match[2])) / 2) : Number(match[1]);
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function compassToDegrees(label) {
  const index = COMPASS.indexOf(String(label || "").toUpperCase());
  return index < 0 ? null : index * 22.5;
}

export function degreesToCompass(deg) {
  const value = ((Number(deg) % 360) + 360) % 360;
  return COMPASS[Math.round(value / 22.5) % 16];
}

export function parseHourly(json) {
  const periods = Array.isArray(json?.properties?.periods) ? json.properties.periods : [];
  return periods.slice(0, 48).map((period) => ({
    start: time(period.startTime),
    end: time(period.endTime),
    tempF: period.temperatureUnit === "C" ? Math.round(period.temperature * 9 / 5 + 32) : Number(period.temperature),
    windMph: mph(period.windSpeed),
    windFrom: String(period.windDirection || ""),
    rainChance: Number.isFinite(period.probabilityOfPrecipitation?.value) ? period.probabilityOfPrecipitation.value : null,
    short: String(period.shortForecast || "")
  })).filter((period) => period.start != null);
}

export function emptySaved() {
  return null;
}

export function makeSaved({ alerts, hourly, savedAt, place }) {
  return { savedAt, place: place || null, alerts: alerts || [], hourly: hourly || [] };
}

// What the Weather card shows for a saved download.
export function describeSaved(saved, now = Date.now()) {
  if (!saved) return { has: false, age: "", alerts: [], forecast: null, note: "Nothing saved yet. When you have signal, save the forecast and alerts for your area." };
  const alerts = (saved.alerts || []).map((alert) => ({
    ...alert,
    expired: alert.expires != null && alert.expires <= now,
    until: alert.expires != null ? new Date(alert.expires).toISOString() : null
  }));
  return { has: true, age: ageText(saved.savedAt, now), alerts, forecast: forecastNow(saved, now), note: "" };
}

// The forecast hour that covers `now`, or the next one. Null when the saved hours have passed.
export function forecastNow(saved, now = Date.now()) {
  const hourly = saved?.hourly || [];
  const hour = hourly.find((period) => period.start <= now && (period.end == null || period.end > now))
    || hourly.find((period) => period.start > now);
  if (!hour) return null;
  const stale = hour.end != null && hour.end <= now;
  return { ...hour, stale };
}

export function rainText(chance) {
  if (chance == null) return "unknown";
  if (chance >= 60) return "heavy";
  if (chance >= 30) return "light";
  return "none";
}
