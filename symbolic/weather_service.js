// ONE weather service. Ask, the Hunt cards, the scent cone and the Weather screen all read the
// same record from here, so they never disagree.
//
// Pure JavaScript. Network and clock are passed in, nothing runs by itself, and nothing here is
// imported by the Ask hot path (getMappedAction). Only the phone shell (src/phone/weather_ask.js)
// and the screens load it.
//
// API (all pure unless it says `fetchImpl`):
//   fetchWeather({ lat, lon, fetchImpl, now, timeoutMs })  -> { ok, snapshot, source, errors }
//        NWS api.weather.gov first (US, no key, User-Agent set), Open-Meteo as the fallback.
//   snapshot: { v:2, source, savedAt, place, lat, lon, current, hourly, daily, alerts, notes }
//        `savedAt`, `hourly` and `alerts` keep the shape symbolic/hunt/nws.js already reads, so the
//        saved copy in the hunt store (`hunt.saved`) IS the weather record.
//   weatherRecord(hunt, { now, hasSensor })  -> the merged record every screen reads:
//        { wind, temp, precip, pressure, trend, freshness, forecast, agree, ... }
//        Manual entries win. Else the saved forecast hour. The barometer is never a wind source.
//   answerWeather(question, record, { now })  -> an Ask result { answered, text, kind:"weather", ... }
//   weatherIntent(text) -> null | { aspect, when }   (cheap regex, no network)
//   freshnessText(snapshot, now, { offline })  -> "Updated 12 min ago" / "Cached · no signal. Updated 3 h ago."
//   asOfText(ms) -> "2:10 PM"

import { ageText, trendOf } from "./hunt/baro.js";
import { NWS_HEADERS, compassToDegrees, degreesToCompass, forecastNow, parseAlerts, parseHourly, rainText } from "./hunt/nws.js";
import { classFor, pointToDegrees } from "./hunt/scent.js";

export const USER_AGENT = NWS_HEADERS["User-Agent"];
export const FRESH_MS = 90 * 60 * 1000;
export const STALE_MS = 6 * 60 * 60 * 1000;
export const SNAPSHOT_VERSION = 2;
const TIMEOUT_MS = 8000;

const round = (value, places = 0) => (Number.isFinite(value) ? Math.round(value * 10 ** places) / 10 ** places : null);
const cToF = (c) => (Number.isFinite(c) ? c * 9 / 5 + 32 : null);
const kmhToMph = (v) => (Number.isFinite(v) ? v * 0.621371 : null);
const msToMph = (v) => (Number.isFinite(v) ? v * 2.236936 : null);
const paToHpa = (v) => (Number.isFinite(v) ? v / 100 : null);

// ---------- time words ----------

export function asOfText(ms) {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const pm = h >= 12;
  h = h % 12 || 12;
  return `${h}:${m} ${pm ? "PM" : "AM"}`;
}

export function agoText(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return "";
  const minutes = Math.max(0, Math.round((now - ms) / 60000));
  if (minutes < 2) return "just now";
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function freshnessText(snapshot, now = Date.now(), { offline = false } = {}) {
  if (!snapshot || !Number.isFinite(snapshot.savedAt)) return "No saved weather yet.";
  const ago = agoText(snapshot.savedAt, now);
  const age = now - snapshot.savedAt;
  if (offline) return `Cached · no signal. Updated ${ago}. This copy stays until you update it.`;
  if (age > STALE_MS) return `Old copy. Updated ${ago}. Treat it as a rough guide and update it when you have signal.`;
  return `Updated ${ago}`;
}

// ---------- network ----------

function withTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  return fetchImpl(url, { ...init, signal: controller?.signal }).then((response) => {
    if (timer) clearTimeout(timer);
    if (!response || response.ok === false) throw new Error(`HTTP ${response?.status ?? "?"}`);
    return response.json();
  }, (err) => {
    if (timer) clearTimeout(timer);
    throw err;
  });
}

// Coordinates are rounded to 3 decimals (about 100 m). That is enough for a forecast grid.
const coord = (v) => Number(v).toFixed(3);

export function parseDaily(json) {
  const periods = Array.isArray(json?.properties?.periods) ? json.properties.periods : [];
  return periods.slice(0, 14).map((p) => ({
    name: String(p.name || ""),
    day: p.isDaytime !== false,
    start: Date.parse(p.startTime || "") || null,
    end: Date.parse(p.endTime || "") || null,
    tempF: p.temperatureUnit === "C" ? Math.round(cToF(p.temperature)) : Number(p.temperature),
    windText: [p.windDirection, p.windSpeed].filter(Boolean).join(" "),
    rainChance: Number.isFinite(p.probabilityOfPrecipitation?.value) ? p.probabilityOfPrecipitation.value : null,
    short: String(p.shortForecast || ""),
    detail: String(p.detailedForecast || "").slice(0, 400)
  })).filter((p) => p.name);
}

export function parseObservation(json) {
  const p = json?.properties;
  if (!p) return null;
  const tempF = Number.isFinite(p.temperature?.value) ? cToF(p.temperature.value) : null;
  if (tempF == null) return null;
  const speed = p.windSpeed?.value;
  const mph = /km_h|km\/h/i.test(p.windSpeed?.unitCode || "km_h") ? kmhToMph(speed) : msToMph(speed);
  const gust = Number.isFinite(p.windGust?.value) ? kmhToMph(p.windGust.value) : null;
  const dir = Number.isFinite(p.windDirection?.value) ? p.windDirection.value : null;
  const feels = Number.isFinite(p.windChill?.value) ? cToF(p.windChill.value) : Number.isFinite(p.heatIndex?.value) ? cToF(p.heatIndex.value) : null;
  return {
    observedAt: Date.parse(p.timestamp || "") || null,
    tempF: round(tempF),
    feelsF: round(feels),
    windMph: round(mph),
    gustMph: round(gust),
    windFromDeg: dir,
    windFrom: dir == null ? "" : degreesToCompass(dir),
    humidity: round(p.relativeHumidity?.value),
    pressureHpa: round(paToHpa(p.seaLevelPressure?.value ?? p.barometricPressure?.value), 1),
    summary: String(p.textDescription || ""),
    station: String(p.station || "").split("/").pop() || null
  };
}

export async function fetchNws({ lat, lon, fetchImpl, now = Date.now(), timeoutMs = TIMEOUT_MS }) {
  const get = (url) => withTimeout(fetchImpl, url, { headers: NWS_HEADERS }, timeoutMs);
  const point = await get(`https://api.weather.gov/points/${coord(lat)},${coord(lon)}`);
  const props = point?.properties || {};
  if (!props.forecastHourly && !props.forecast) throw new Error("NWS has no forecast for this point");
  const [hourlyJson, dailyJson, alertsJson, stationsJson] = await Promise.allSettled([
    props.forecastHourly ? get(props.forecastHourly) : Promise.reject(new Error("no hourly")),
    props.forecast ? get(props.forecast) : Promise.reject(new Error("no daily")),
    get(`https://api.weather.gov/alerts/active?point=${coord(lat)},${coord(lon)}`),
    props.observationStations ? get(`${props.observationStations}?limit=3`) : Promise.reject(new Error("no stations"))
  ]);
  const value = (r) => (r.status === "fulfilled" ? r.value : null);
  const hourly = value(hourlyJson) ? parseHourly(value(hourlyJson)) : [];
  const daily = value(dailyJson) ? parseDaily(value(dailyJson)) : [];
  if (!hourly.length && !daily.length) throw new Error("NWS returned no periods");
  let current = null;
  const stations = value(stationsJson)?.features || [];
  for (const feature of stations.slice(0, 3)) {
    const id = feature?.properties?.stationIdentifier;
    if (!id) continue;
    try {
      current = parseObservation(await get(`https://api.weather.gov/stations/${id}/observations/latest`));
    } catch { current = null; }
    if (current && now - (current.observedAt || 0) < 4 * 3600000) break;
    current = null;
  }
  const place = props.relativeLocation?.properties;
  return {
    v: SNAPSHOT_VERSION,
    source: "nws",
    sourceName: "National Weather Service",
    savedAt: now,
    lat: Number(coord(lat)),
    lon: Number(coord(lon)),
    place: place?.city ? `${place.city}, ${place.state}` : null,
    current,
    hourly,
    daily,
    alerts: value(alertsJson) ? parseAlerts(value(alertsJson)) : [],
    notes: []
  };
}

const WMO = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "freezing fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains", 80: "rain showers", 81: "rain showers", 82: "heavy rain showers",
  85: "snow showers", 86: "heavy snow showers", 95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail"
};

export function openMeteoUrl(lat, lon) {
  const q = new URLSearchParams({
    latitude: coord(lat), longitude: coord(lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    temperature_unit: "fahrenheit", wind_speed_unit: "mph", timeformat: "unixtime", timezone: "auto", forecast_days: "4"
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}

export function parseOpenMeteo(json, { lat, lon, now = Date.now() } = {}) {
  const c = json?.current;
  const h = json?.hourly;
  if (!c && !h?.time) throw new Error("Open-Meteo returned nothing");
  const current = c && Number.isFinite(c.temperature_2m) ? {
    observedAt: Number.isFinite(c.time) ? c.time * 1000 : now,
    tempF: round(c.temperature_2m),
    feelsF: round(c.apparent_temperature),
    windMph: round(c.wind_speed_10m),
    gustMph: round(c.wind_gusts_10m),
    windFromDeg: Number.isFinite(c.wind_direction_10m) ? c.wind_direction_10m : null,
    windFrom: Number.isFinite(c.wind_direction_10m) ? degreesToCompass(c.wind_direction_10m) : "",
    humidity: round(c.relative_humidity_2m),
    pressureHpa: round(c.pressure_msl, 1),
    summary: WMO[c.weather_code] || "",
    station: null
  } : null;
  const times = h?.time || [];
  const hourly = times.slice(0, 72).map((t, i) => ({
    start: t * 1000,
    end: (t + 3600) * 1000,
    tempF: round(h.temperature_2m?.[i]),
    windMph: round(h.wind_speed_10m?.[i]),
    windFrom: Number.isFinite(h.wind_direction_10m?.[i]) ? degreesToCompass(h.wind_direction_10m[i]) : "",
    rainChance: Number.isFinite(h.precipitation_probability?.[i]) ? h.precipitation_probability[i] : null,
    short: WMO[h.weather_code?.[i]] || ""
  })).filter((p) => Number.isFinite(p.start) && now < p.end + 3600000 * 2);
  const d = json?.daily;
  const daily = (d?.time || []).map((t, i) => ({
    name: i === 0 ? "Today" : new Date(t * 1000).toLocaleDateString("en-US", { weekday: "long" }),
    day: true,
    start: t * 1000,
    end: (t + 86400) * 1000,
    hiF: round(d.temperature_2m_max?.[i]),
    loF: round(d.temperature_2m_min?.[i]),
    tempF: round(d.temperature_2m_max?.[i]),
    windText: "",
    rainChance: Number.isFinite(d.precipitation_probability_max?.[i]) ? d.precipitation_probability_max[i] : null,
    short: WMO[d.weather_code?.[i]] || "",
    detail: ""
  }));
  if (!current && !hourly.length) throw new Error("Open-Meteo returned no usable data");
  return {
    v: SNAPSHOT_VERSION,
    source: "open-meteo",
    sourceName: "Open-Meteo",
    savedAt: now,
    lat: Number(coord(lat)),
    lon: Number(coord(lon)),
    place: null,
    current,
    hourly,
    daily,
    alerts: [],
    notes: ["Open-Meteo has no weather alerts. Check the National Weather Service for warnings."]
  };
}

export async function fetchOpenMeteo({ lat, lon, fetchImpl, now = Date.now(), timeoutMs = TIMEOUT_MS }) {
  const json = await withTimeout(fetchImpl, openMeteoUrl(lat, lon), { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }, timeoutMs);
  return parseOpenMeteo(json, { lat, lon, now });
}

export async function fetchWeather({ lat, lon, fetchImpl = globalThis.fetch, now = Date.now(), timeoutMs = TIMEOUT_MS } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, snapshot: null, source: null, errors: ["no location"] };
  if (typeof fetchImpl !== "function") return { ok: false, snapshot: null, source: null, errors: ["no network"] };
  const errors = [];
  try {
    const snapshot = await fetchNws({ lat, lon, fetchImpl, now, timeoutMs });
    return { ok: true, snapshot, source: "nws", errors };
  } catch (err) {
    errors.push(`nws: ${err?.message || err}`);
  }
  try {
    const snapshot = await fetchOpenMeteo({ lat, lon, fetchImpl, now, timeoutMs });
    return { ok: true, snapshot, source: "open-meteo", errors };
  } catch (err) {
    errors.push(`open-meteo: ${err?.message || err}`);
  }
  return { ok: false, snapshot: null, source: null, errors };
}

// ---------- the one record ----------

function hourNow(snapshot, now) {
  return forecastNow(snapshot, now);
}

function manualWind(hunt) {
  const wind = hunt?.wind || {};
  if (!wind.fromPoint) return null;
  const deg = pointToDegrees(wind.fromPoint);
  if (deg == null) return null;
  const typed = hunt?.manual?.windMph;
  const hasTyped = typed !== "" && typed != null && Number.isFinite(Number(typed));
  const cls = ["calm", "light", "moderate", "strong"].includes(wind.speedClass) ? wind.speedClass : "light";
  const mph = hasTyped ? Number(typed) : { calm: 1, light: 5, moderate: 11, strong: 20 }[cls];
  return { fromDeg: deg, point: wind.fromPoint, mph, swirling: wind.swirling === true, enteredAt: wind.enteredAt || null };
}

/**
 * The merged record. `hunt` is the hunt store ({ saved, wind, manual, baro }).
 * Policy per field: 1 manual entry, 2 the saved copy (this hour), 3 nothing. The barometer is
 * never a wind source. When manual and forecast disagree the record says so and uses manual.
 */
export function weatherRecord(hunt, { now = Date.now(), hasSensor = true, offline = false } = {}) {
  const saved = hunt?.saved && Array.isArray(hunt.saved.hourly) ? hunt.saved : null;
  const hour = hourNow(saved, now);
  const manual = manualWind(hunt);
  const cur = saved?.current && Number.isFinite(saved.current.observedAt) && now - saved.current.observedAt < FRESH_MS * 2 ? saved.current : null;
  const sourceName = saved ? (saved.sourceName || (saved.source === "open-meteo" ? "Open-Meteo" : "National Weather Service")) : null;
  const savedTag = saved ? freshnessText(saved, now, { offline }) : "";

  // Wind from the saved copy: the forecast hour, else a fresh observation.
  let forecastWind = null;
  if (hour && hour.windFrom && hour.windMph != null && compassToDegrees(hour.windFrom) != null) {
    forecastWind = { fromDeg: compassToDegrees(hour.windFrom), point: hour.windFrom, mph: hour.windMph, stale: hour.stale === true, kind: "forecast hour" };
  } else if (cur && cur.windFromDeg != null && cur.windMph != null) {
    forecastWind = { fromDeg: cur.windFromDeg, point: cur.windFrom, mph: cur.windMph, stale: false, kind: "observation" };
  }

  let wind = { ok: false, source: "none", tag: "" };
  let windAgree = null;
  if (manual) {
    wind = {
      ok: true, fromDeg: manual.fromDeg, point: manual.point, mph: manual.mph, cls: classFor(manual.mph).id,
      swirling: manual.swirling, source: "manual", enteredAt: manual.enteredAt,
      tag: `You entered this${manual.enteredAt ? ` · ${asOfText(manual.enteredAt)}` : ""}`
    };
    if (forecastWind) {
      const diff = Math.abs(((manual.fromDeg - forecastWind.fromDeg + 540) % 360) - 180);
      windAgree = diff <= 45 && Math.abs(manual.mph - forecastWind.mph) <= 6;
    }
  } else if (forecastWind) {
    wind = {
      ok: true, fromDeg: forecastWind.fromDeg, point: forecastWind.point, mph: forecastWind.mph, cls: classFor(forecastWind.mph).id,
      swirling: false, source: "saved forecast", stale: forecastWind.stale, tag: savedTag
    };
  }

  let temp = null;
  const typedTemp = hunt?.manual?.tempF;
  if (typedTemp !== "" && typedTemp != null && Number.isFinite(Number(typedTemp))) temp = { f: Number(typedTemp), source: "manual", tag: "You entered this" };
  else if (cur && Number.isFinite(cur.tempF)) temp = { f: cur.tempF, source: "saved forecast", tag: savedTag, feelsF: cur.feelsF };
  else if (hour && Number.isFinite(hour.tempF)) temp = { f: hour.tempF, source: "saved forecast", tag: savedTag };

  let precip = null;
  if (hunt?.manual?.precip) precip = { kind: hunt.manual.precip, source: "manual", tag: "You entered this" };
  else if (hour && hour.rainChance != null) precip = { kind: rainText(hour.rainChance), chance: hour.rainChance, source: "saved forecast", tag: savedTag };

  const trend = trendOf(hunt?.baro, now, { hasSensor });
  const pressure = trend.state === "trend" ? { band: trend.band, delta: trend.delta, source: "live" } : null;

  return {
    now,
    saved,
    sourceName,
    place: saved?.place || null,
    freshness: savedTag,
    offline,
    ageMs: saved ? now - saved.savedAt : null,
    stale: saved ? now - saved.savedAt > STALE_MS : false,
    current: cur,
    hour,
    wind,
    windAgree,
    forecastWind,
    temp,
    precip,
    pressure,
    trend,
    alerts: (saved?.alerts || []).filter((a) => a.expires == null || a.expires > now),
    daily: saved?.daily || []
  };
}

// ---------- Ask ----------

const T = "(?:weather|forecast|temperature|temp)";
const PATTERNS = [
  [/\b(?:what(?:'s|s| is| will)?|how(?:'s|s| is))\b[^.?!]{0,25}\b(?:weather|forecast|temperature|temp)\b/i, "now"],
  [new RegExp(`\\b${T}\\b[^.?!]{0,20}\\b(?:today|tonight|tomorrow|now|trend|here|outside|report|like|this (?:week|weekend|morning|afternoon|evening)|right now)\\b`, "i"), "now"],
  [/\b(?:check|get|give me|tell me|show me|read)\b[^.?!]{0,20}\b(?:the )?(?:weather|forecast)\b/i, "now"],
  [/^(?:the )?(?:weather|forecast)[\s?!.]*$/i, "now"],
  [/\b(?:will|is|does|do|gonna|going to)\b[^.?!]{0,25}\b(?:rain|raining|snow|snowing|storm|storming|freeze|freezing|frost|sunny|clear up|thunder)\b/i, "rain"],
  [/\bhow (?:cold|hot|warm|cool|windy|humid)\b[^.?!]{0,20}\b(?:is it|will it|does it)\b/i, "temp"],
  [/\b(?:is it|will it be|gonna be|going to be)\b[^.?!]{0,10}\b(?:cold|hot|warm|windy|freezing)\b/i, "temp"],
  [/\b(?:what(?:'s|s| is) the )?(?:wind|winds)\b[^.?!]{0,20}\b(?:today|now|tonight|doing|like|direction|speed|forecast|outside)\b/i, "wind"],
  [/\b(?:barometer|barometric|air pressure|pressure)\b[^.?!]{0,20}\b(?:trend|now|doing|reading|falling|rising)\b/i, "trend"],
  [/\b(?:any|are there)\b[^.?!]{0,15}\b(?:weather )?(?:alerts?|warnings?|watches)\b/i, "alerts"],
  [/\bdo i need\b[^.?!]{0,20}\b(?:jacket|coat|layers?|umbrella|rain gear)\b/i, "now"]
];
// Survival-knowledge questions about weather still go to the notes.
const KNOWLEDGE = /\b(?:how (?:do|to|can|should)|what (?:do|does|are|should)|signs?|predict(?:ing)?|read(?:ing)? (?:the )?(?:clouds?|sky)|without|clouds? mean|survive|protect|prepare for|stay (?:warm|dry)|lightning safety|during a|in a (?:storm|thunderstorm|blizzard))\b/i;

export function weatherIntent(text) {
  const raw = String(text || "").trim();
  if (!raw || raw.length > 160) return null;
  const asksNow = /\b(?:right now|today|tonight|tomorrow|here|outside|this (?:morning|afternoon|evening|week|weekend)|trend|report)\b|^(?:what|how)(?:'s|s| is)\b/i.test(raw);
  if (KNOWLEDGE.test(raw) && !asksNow) return null;
  if (/\b(?:how (?:do|to|can|should) i|what (?:do|should) i do)\b/i.test(raw)) return null;
  for (const [pattern, aspect] of PATTERNS) {
    if (pattern.test(raw)) {
      const when = /\btomorrow\b/i.test(raw) ? "tomorrow" : /\btonight\b/i.test(raw) ? "tonight" : /\b(?:this week|weekend|week)\b/i.test(raw) ? "week" : /\btoday|this (?:morning|afternoon|evening)\b/i.test(raw) ? "today" : "now";
      const finer = /\btrend\b|\bbarometer|barometric|pressure\b/i.test(raw) ? "trend" : /\b(?:rain|snow|storm|thunder|freez|frost)\w*/i.test(raw) ? "rain" : /\bwind/i.test(raw) ? "wind" : /\balerts?|warnings?\b/i.test(raw) ? "alerts" : aspect;
      return { aspect: finer, when };
    }
  }
  return null;
}

const f = (n) => `${Math.round(n)}°F`;
const windWords = (point, mph, gust) => {
  if (mph == null) return "wind not reported";
  if (mph < 1) return "calm";
  return `wind ${point || "variable"} ${Math.round(mph)} mph${gust && gust > mph + 4 ? `, gusting ${Math.round(gust)}` : ""}`;
};

function trendSentence(trend) {
  if (!trend) return "";
  if (trend.state === "trend") return `Pressure on this phone is ${trend.label.toLowerCase()} (${trend.delta > 0 ? "+" : ""}${trend.delta} hPa over ${trend.hours} h). ${trend.text}`;
  if (trend.state === "collecting") return "This phone's barometer is still collecting readings. A trend needs about 3 hours.";
  if (trend.state === "paused") return trend.text;
  return "";
}

function coming(record, now) {
  const hours = (record.saved?.hourly || []).filter((h) => h.end > now).slice(0, 12);
  if (!hours.length) return null;
  const temps = hours.map((h) => h.tempF).filter(Number.isFinite);
  const rain = Math.max(...hours.map((h) => (Number.isFinite(h.rainChance) ? h.rainChance : 0)));
  const lastTemp = temps[temps.length - 1];
  const firstTemp = temps[0];
  const worst = hours.find((h) => h.rainChance === rain && rain >= 30);
  return { hours, hi: Math.max(...temps), lo: Math.min(...temps), rain, worst, change: Number.isFinite(lastTemp) && Number.isFinite(firstTemp) ? lastTemp - firstTemp : null };
}

function dailyLine(record, when, now) {
  const periods = record.daily.filter((p) => !p.end || p.end > now);
  if (!periods.length) return "";
  const pick = (name) => periods.find((p) => new RegExp(name, "i").test(p.name));
  let p = null;
  if (when === "tonight") p = pick("tonight|night") || periods.find((x) => !x.day);
  else if (when === "tomorrow") {
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    p = periods.find((x) => x.day && x.start && new Date(x.start).getDate() === tomorrow.getDate());
  } else p = periods[0];
  if (!p) return "";
  const hiLo = p.hiF != null ? `high ${f(p.hiF)}, low ${f(p.loF)}` : f(p.tempF);
  return `${p.name}: ${p.short ? `${p.short.toLowerCase()}, ` : ""}${hiLo}${p.rainChance != null ? `, ${p.rainChance}% chance of rain or snow` : ""}.`;
}

/**
 * Answer a weather question from the one record. Never invents: says plainly when the copy is
 * old, when the hours have passed, and when there is no copy at all. `fetched` says whether this
 * turn just updated it. `fetchNote` explains why it could not ("no signal", "no location").
 */
export function answerWeather(question, record, { now = Date.now(), fetched = false, fetchNote = "" } = {}) {
  const intent = weatherIntent(question) || { aspect: "now", when: "now" };
  const sections = [];
  const sources = [];
  const place = record.place ? ` for ${record.place}` : "";
  const offlineBit = !fetched && record.saved ? " I could not reach the weather service, so this is from the copy saved on this phone." : "";

  if (!record.saved) {
    const reason = fetchNote || "I have no saved forecast on this phone yet.";
    const lines = [`${reason} I will not guess at the weather.`];
    const trend = trendSentence(record.trend);
    if (trend) { lines.push(trend); sources.push("Barometer on this phone"); }
    else lines.push("Turn on your location in Map and ask again when you have signal. The Weather card also saves a copy you can read offline.");
    if (record.wind.ok) lines.push(`Wind you entered: ${windWords(record.wind.point, record.wind.mph)}.`);
    return result(lines.join(" "), sections, sources, { missing: true });
  }

  sources.push(`${fetched ? "Updated" : "Saved copy"} · ${record.sourceName}`);
  const head = [];
  const cur = record.current;
  const hour = record.hour;
  if (intent.aspect === "trend") {
    const trend = trendSentence(record.trend);
    if (trend) { head.push(trend); sources.push("Barometer on this phone"); }
    else head.push("This phone has no barometer trend yet.");
  }
  if (cur && now - (cur.observedAt || 0) < STALE_MS) {
    const feels = cur.feelsF != null && Math.abs(cur.feelsF - cur.tempF) >= 3 ? ` (feels like ${f(cur.feelsF)})` : "";
    head.push(`Right now${place}: ${f(cur.tempF)}${feels}${cur.summary ? `, ${cur.summary.toLowerCase()}` : ""}, ${windWords(cur.windFrom, cur.windMph, cur.gustMph)}${cur.humidity != null ? `, humidity ${cur.humidity}%` : ""}.`);
  } else if (hour) {
    head.push(`The copy on this phone says${place}: ${Number.isFinite(hour.tempF) ? f(hour.tempF) : "temperature unknown"}${hour.short ? `, ${hour.short.toLowerCase()}` : ""}, ${windWords(hour.windFrom, hour.windMph)}${hour.rainChance != null ? `, rain ${hour.rainChance}%` : ""}.`);
  } else {
    head.push("The saved forecast hours have passed, so I have no number for right now.");
  }
  if (record.wind.source === "manual") {
    head.push(`You entered ${windWords(record.wind.point, record.wind.mph)} for the cone, and I use that for wind${record.windAgree === true ? ", which matches the forecast" : record.windAgree === false ? `, but the forecast says ${windWords(record.forecastWind.point, record.forecastWind.mph)}` : ""}.`);
  }
  if (intent.aspect !== "trend") {
    const t = trendSentence(record.trend);
    if (t && record.trend.state === "trend") { head.push(t); sources.push("Barometer on this phone"); }
  }
  sections.push({ title: null, text: head.join(" ") });

  if (["now", "rain", "temp", "wind", "trend"].includes(intent.aspect) || intent.when !== "now") {
    const ahead = coming(record, now);
    const line = intent.when === "tonight" || intent.when === "tomorrow" || intent.when === "week" ? dailyLine(record, intent.when, now) : "";
    const next = [];
    if (line) next.push(line);
    if (ahead) {
      if (intent.aspect === "rain" || ahead.rain >= 30) {
        next.push(ahead.rain >= 30
          ? `Rain or snow chance peaks at ${ahead.rain}% around ${asOfText(ahead.worst?.start)} in the next 12 hours.`
          : `Little chance of rain or snow in the next 12 hours (up to ${ahead.rain}%).`);
      }
      if (intent.aspect !== "rain") next.push(`Next 12 hours: ${f(ahead.lo)} to ${f(ahead.hi)}${ahead.change != null && Math.abs(ahead.change) >= 5 ? `, getting ${ahead.change > 0 ? "warmer" : "colder"}` : ""}.`);
    } else if (!line) next.push("The saved forecast hours have passed. Update the copy when you have signal.");
    if (next.length) sections.push({ title: null, text: next.join(" ") });
  }
  if (record.alerts.length) {
    sections.push({ title: null, text: `Active alert${record.alerts.length === 1 ? "" : "s"}: ${record.alerts.slice(0, 3).map((a) => a.event).join(", ")}. Open Weather for the details.` });
  } else if (intent.aspect === "alerts") {
    sections.push({ title: null, text: record.saved.source === "open-meteo" ? "The backup service does not carry alerts. I cannot tell you there are none." : "No active alerts in the saved copy." });
  }
  const fresh = fetched ? `Updated just now from ${record.sourceName}.` : `As of ${asOfText(record.saved.savedAt)} (${agoText(record.saved.savedAt, now)}) from ${record.sourceName}.`;
  const caveat = record.stale ? " That is old. Treat it as a rough guide." : "";
  sections.push({ title: null, text: `${fresh}${offlineBit}${caveat}${fetchNote && !fetched ? ` ${fetchNote}` : ""}` });
  for (const note of record.saved.notes || []) sections.push({ title: null, text: note });
  return result(sections.map((s) => s.text).join("\n\n"), sections, sources, { stale: record.stale });
}

function result(text, sections, sources, extra = {}) {
  return {
    answered: true,
    text,
    kind: "weather",
    symbol: "weather_now",
    source: sources.join(" · "),
    voiced: true,
    opener: "",
    sections: sections.length ? sections : [{ title: null, text }],
    offerDomain: "weather",
    weather: true,
    chips: sources.map((x) => x.replace(/^(Updated|Saved copy) · /, "")).slice(0, 3),
    ...extra
  };
}
