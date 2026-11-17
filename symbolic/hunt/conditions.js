// Puts the hunting inputs together: wind, temperature, rain, pressure and place, each tagged
// with where it came from. The Hunt cards, the Wind screen, Sightings and the deer estimate all
// read this one place so they never disagree. Pure JavaScript.

import { trendOf } from "./baro.js";
import { forecastNow, compassToDegrees, degreesToCompass, rainText } from "./nws.js";
import { estimateDeer } from "./deer_estimate.js";
import { legalLight } from "./legal_light.js";
import { classFor, pointToDegrees, scentCone, SPEED_CLASSES } from "./scent.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

export function localDateText(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function windFrom(hunt, now = Date.now()) {
  const wind = hunt?.wind || {};
  if (wind.fromPoint) {
    const deg = pointToDegrees(wind.fromPoint);
    const typed = Number(hunt?.manual?.windMph);
    const cls = SPEED_CLASSES.find((item) => item.id === wind.speedClass) || SPEED_CLASSES[1];
    const mph = Number.isFinite(typed) && hunt?.manual?.windMph !== "" ? typed : cls.mph;
    return { ok: deg != null, fromDeg: deg, point: wind.fromPoint, mph, cls: Number.isFinite(typed) && hunt?.manual?.windMph !== "" ? classFor(typed).id : cls.id, swirling: wind.swirling === true, source: "manual", enteredAt: wind.enteredAt || null };
  }
  const hour = forecastNow(hunt?.saved, now);
  if (hour && hour.windFrom && hour.windMph != null) {
    const deg = compassToDegrees(hour.windFrom);
    if (deg != null) return { ok: true, fromDeg: deg, point: hour.windFrom, mph: hour.windMph, cls: classFor(hour.windMph).id, swirling: false, source: "saved forecast", stale: hour.stale === true };
  }
  return { ok: false, source: "none" };
}

export function conditionsFor(hunt, { position, now = Date.now(), offsetMinutes = 0, hasSensor = true } = {}) {
  const date = localDateText(now);
  const d = new Date(now);
  const nowMinutes = d.getHours() * 60 + d.getMinutes();
  const fix = position?.consent === true && position.status === "locked" ? position.fix : null;
  const stateInfo = hunt?.legal?.state || "";
  const wind = windFrom(hunt, now);
  const hour = forecastNow(hunt?.saved, now);
  const tempManual = hunt?.manual?.tempF;
  let temp = null;
  if (tempManual !== "" && tempManual != null && Number.isFinite(Number(tempManual))) temp = { f: Number(tempManual), source: "manual" };
  else if (hour && Number.isFinite(hour.tempF)) temp = { f: hour.tempF, source: "saved forecast" };
  let precip = null;
  if (hunt?.manual?.precip) precip = { kind: hunt.manual.precip, source: "manual" };
  else if (hour && hour.rainChance != null) precip = { kind: rainText(hour.rainChance), source: "saved forecast" };
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
  return { date, nowMinutes, place, wind, temp, precip, pressure, trend, light, estimate, cone: wind.ok ? scentCone({ fromDeg: wind.fromDeg, mph: wind.mph, swirling: wind.swirling, source: wind.source }) : null };
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
    ? { value: windLabel(cond.wind), sub: `From ${cond.wind.source}` }
    : { value: "Add wind", sub: "Direction and speed" };
  const deer = cond.estimate
    ? { value: cond.estimate.level === "Medium" ? "Med" : cond.estimate.level, sub: "Tap for reasons" }
    : { value: "Not enough", sub: "Add weather or turn on location" };
  return { legal, wind, deer };
}
