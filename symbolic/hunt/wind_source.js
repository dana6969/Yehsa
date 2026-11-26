// ADAPTER. The scent cone and the Wind sheet read wind through this one file, and this file reads
// the one shared weather record (symbolic/weather_service.js). Ask, the Hunt cards, the cone and
// the Weather screen therefore always agree: the wind you entered wins, else the saved forecast.

import { agoText, weatherRecord } from "../weather_service.js";
import { degreesToCompass } from "./nws.js";

export const NO_SENSOR_TEXT = "This phone has no wind sensor.";

export function currentWind(hunt, now = Date.now()) {
  return weatherRecord(hunt, { now }).wind;
}

// "Saved forecast: W 5 mph · updated 12 min ago. This phone has no wind sensor."
export function savedForecastLine(hunt, now = Date.now()) {
  const record = weatherRecord(hunt, { now });
  const saved = record.forecastWind;
  if (!saved) return `No saved forecast wind. ${NO_SENSOR_TEXT}`;
  const age = agoText(hunt?.saved?.savedAt, now);
  const stale = saved.stale ? " That hour has passed." : "";
  const label = saved.kind === "observation" ? "Saved observation" : "Saved forecast";
  return `${label}: ${saved.point} ${Math.round(saved.mph)} mph${age ? ` · updated ${age}` : ""}.${stale} ${NO_SENSOR_TEXT}`;
}

export function hasSavedForecastWind(hunt, now = Date.now()) {
  return Boolean(weatherRecord(hunt, { now }).forecastWind);
}

export function isManualWind(hunt) {
  return Boolean(hunt?.wind?.fromPoint);
}

// Back to the saved forecast: drop what was entered by hand.
export function resetWindPatch() {
  return {
    wind: { fromPoint: "", speedClass: "light", swirling: false, source: "manual" },
    manualMph: ""
  };
}

export function entered(hunt) {
  const at = hunt?.wind?.enteredAt;
  return Number.isFinite(at) ? new Date(at) : null;
}

export { degreesToCompass };
