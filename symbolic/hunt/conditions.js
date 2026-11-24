// Puts the hunting inputs together: wind, temperature, rain, pressure and place, each tagged
// with where it came from. The Hunt cards, the Wind screen, Sightings and the deer estimate all
// read this one place so they never disagree. Pure JavaScript.

import { trendOf } from "./baro.js";
import { degreesToCompass } from "./nws.js";
import { estimateDeer } from "./deer_estimate.js";
import { legalLight } from "./legal_light.js";
import { scentCone } from "./scent.js";
import { weatherRecord } from "../weather_service.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

export function localDateText(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The wind every screen uses. It comes from the one weather record (symbolic/weather_service.js):
// the wind you entered wins, else the saved forecast, else nothing. `tag` says where and how old.
export function windFrom(hunt, now = Date.now()) {
  return weatherRecord(hunt, { now }).wind;
}

export function conditionsFor(hunt, { position, now = Date.now(), offsetMinutes = 0, hasSensor = true } = {}) {
  const date = localDateText(now);
  const d = new Date(now);
  const nowMinutes = d.getHours() * 60 + d.getMinutes();
  const fix = position?.consent === true && position.status === "locked" ? position.fix : null;
  const stateInfo = hunt?.legal?.state || "";
  const record = weatherRecord(hunt, { now, hasSensor });
  const wind = record.wind;
  const temp = record.temp ? { f: record.temp.f, source: record.temp.source } : null;
  const precip = record.precip ? { kind: record.precip.kind, source: record.precip.source } : null;
  const trend = trendOf(hunt?.baro, now, { hasSensor });
  const pressure = trend.state === "trend" ? { band: trend.band, delta: trend.delta, source: "live" } : null;
  const place = fix ? { lat: fix.latitude, lon: fix.longitude } : null;
  const light = legalLight({ place, state: stateInfo, species: hunt?.legal?.species || "deer", date, offsetMinutes, nowMinutes });
  const haveWeather = Boolean(temp || pressure || wind.ok || precip);
  let estimate = null;
  if (place && haveWeather) {
    estimate = estimateDeer({
      date, lat: place.lat, lon: place.lon, offsetMinutes, nowMinutes,
      temp, pressure, wind: wind.ok ? { mph: wind.mph, source: wind.source } : null, precip,
      pressureOnHunt: hunt?.huntPressure === "high" ? "high" : "normal"
    });
  }
  return { date, nowMinutes, place, weather: record, wind, temp, precip, pressure, trend, light, estimate, cone: wind.ok ? scentCone({ fromDeg: wind.fromDeg, mph: wind.mph, swirling: wind.swirling, source: wind.source }) : null };
}

export function windLabel(wind) {
  if (!wind?.ok) return "";
  return `${degreesToCompass(wind.fromDeg)} · ${Math.round(wind.mph)} mph`;
}

// Short words for the HUD cards.
export function hudCards(cond) {
  const light = cond.light;
  const legal = !light?.ok
    ? { value: "Pick a state", sub: "Or turn on your location" }
    : light.status === "no-hunting-today"
      ? { value: "None today", sub: light.next }
      : light.status === "open"
        ? { value: `Until ${light.closesText}`, sub: light.verified ? "Verified rule" : "Common rule" }
        : light.status === "before"
          ? { value: `Opens ${light.opensText}`, sub: light.verified ? "Verified rule" : "Common rule" }
          : light.status === "after"
            ? { value: "Closed", sub: `Closed at ${light.closesText}` }
            : { value: `${light.opensText}`, sub: `to ${light.closesText}` };
  const wind = cond.wind?.ok
    ? { value: windLabel(cond.wind), sub: cond.wind.tag || `From ${cond.wind.source}` }
    : { value: "Add wind", sub: "Direction and speed" };
  const deer = cond.estimate
    ? { value: cond.estimate.level === "Medium" ? "Med" : cond.estimate.level, sub: "Tap for reasons" }
    : { value: "Not enough", sub: "Add weather or turn on location" };
  return { legal, wind, deer };
}
