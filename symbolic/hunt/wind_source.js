// ADAPTER. The scent cone and the Wind sheet read wind through this one file.
// Today it wraps the Hunt store's own wind (what you entered, else the saved forecast).
// When the shared weather record from the Round 4 bugs work lands, swap the body of
// currentWind() and savedForecastLine() to read it; nothing else in the cone code changes.

import { windFrom } from "./conditions.js";
import { degreesToCompass, compassToDegrees, forecastNow } from "./nws.js";

export const NO_SENSOR_TEXT = "This phone has no wind sensor.";

export function currentWind(hunt, now = Date.now()) {
  return windFrom(hunt, now);
}

function agoText(at, now) {
  if (!Number.isFinite(at)) return "";
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 2) return "just now";
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// "Saved forecast: W 5 mph · updated 12 min ago. This phone has no wind sensor."
export function savedForecastLine(hunt, now = Date.now()) {
  const hour = forecastNow(hunt?.saved, now);
  if (!hour || !hour.windFrom || hour.windMph == null || compassToDegrees(hour.windFrom) == null) {
    return `No saved forecast wind. ${NO_SENSOR_TEXT}`;
  }
  const age = agoText(hunt.saved?.savedAt, now);
  const stale = hour.stale ? " That hour has passed." : "";
  return `Saved forecast: ${hour.windFrom} ${Math.round(hour.windMph)} mph${age ? ` · updated ${age}` : ""}.${stale} ${NO_SENSOR_TEXT}`;
}

export function hasSavedForecastWind(hunt, now = Date.now()) {
  const hour = forecastNow(hunt?.saved, now);
  return Boolean(hour && hour.windFrom && hour.windMph != null && compassToDegrees(hour.windFrom) != null);
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
