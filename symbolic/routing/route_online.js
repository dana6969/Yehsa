// Online routing through a public OSRM-compatible server. Default: the FOSSGIS servers at
// routing.openstreetmap.de (car and foot profiles), whose usage policy allows app use with a
// valid User-Agent, at most one request per second, no heavy use, and an OSM credit with a
// "fix the map" link. The endpoint is a setting, so it can be switched without an app update.
// Any failure falls back to the offline router. No traffic data is used or claimed.
import { stepText, tidyRoadName, compassWord } from "./steps.js";
import { distanceM } from "./geo.js";

export const USER_AGENT = "Yehsa/1.0 (offline survival app; +https://github.com/dana6969/Yehsa)";

export const ROUTE_ENDPOINTS = {
  drive: "https://routing.openstreetmap.de/routed-car",
  walk: "https://routing.openstreetmap.de/routed-foot"
};

export const ROUTE_CREDIT = {
  text: "Routes: OSRM on routing.openstreetmap.de (FOSSGIS). Map data © OpenStreetMap contributors, ODbL.",
  fixUrl: "https://www.openstreetmap.org/fixthemap",
  terms: "https://routing.openstreetmap.de/about.html"
};

export function routeUrl(from, to, { profile = "drive", endpoints = ROUTE_ENDPOINTS } = {}) {
  const base = (endpoints[profile] || endpoints.drive || ROUTE_ENDPOINTS.drive).replace(/\/+$/, "");
  const c = (p) => `${Number(p.longitude).toFixed(6)},${Number(p.latitude).toFixed(6)}`;
  return `${base}/route/v1/driving/${c(from)};${c(to)}?overview=full&geometries=geojson&steps=true&alternatives=false`;
}

const TYPE_MAP = {
  depart: "depart",
  arrive: "arrive",
  turn: "turn",
  "new name": "continue",
  continue: "continue",
  merge: "merge",
  "on ramp": "ramp",
  "off ramp": "ramp",
  fork: "fork",
  "end of road": "turn",
  roundabout: "roundabout",
  rotary: "roundabout",
  "roundabout turn": "turn",
  "exit roundabout": "roundabout",
  "exit rotary": "roundabout",
  notification: "continue"
};

/** Parse an OSRM /route response into Yehsa's route shape. Returns { ok, route?, reason? }. */
export function parseOsrmRoute(json, { profile = "drive", from = null, to = null } = {}) {
  if (!json || json.code !== "Ok" || !Array.isArray(json.routes) || !json.routes.length) {
    return { ok: false, reason: json?.message || "The online route service had no route." };
  }
  const r = json.routes[0];
  const coords = r.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return { ok: false, reason: "The online route had no line." };
  const coordinates = coords.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  // Each step's maneuver point, matched to the nearest coordinate index (searching forward).
  const steps = [];
  let cursor = 0;
  for (const leg of r.legs || []) {
    for (const s of leg.steps || []) {
      const loc = s.maneuver?.location;
      if (!loc) continue;
      const at = { latitude: loc[1], longitude: loc[0] };
      let best = cursor;
      let bestD = Infinity;
      for (let i = cursor; i < Math.min(coordinates.length, cursor + 5000); i++) {
        const d = distanceM(coordinates[i], at);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
        if (bestD < 1) break;
      }
      cursor = best;
      const osrmType = s.maneuver.type;
      const type = TYPE_MAP[osrmType] || "turn";
      let modifier = s.maneuver.modifier || null;
      if (type === "arrive" && modifier !== "left" && modifier !== "right") modifier = null;
      const rawName = s.name && s.ref ? `${s.name} (${s.ref})` : (s.name || s.ref || "");
      const step = {
        type,
        modifier,
        name: tidyRoadName(rawName),
        exitNumber: s.maneuver.exit || null,
        heading: type === "depart" && Number.isFinite(s.maneuver.bearing_after) ? compassWord(s.maneuver.bearing_after) : "",
        distanceM: s.distance || 0,
        durationS: s.duration || 0,
        index: best,
        location: at
      };
      // Drop OSRM's "continue onto the same unnamed path" noise for walks.
      const prev = steps[steps.length - 1];
      if (prev && type === "continue" && step.name === prev.name) {
        prev.distanceM += step.distanceM;
        prev.durationS += step.durationS;
        continue;
      }
      step.instruction = stepText(step);
      steps.push(step);
    }
  }
  return {
    ok: true,
    route: {
      source: "online",
      profile,
      coordinates,
      distanceM: r.distance,
      durationS: r.duration,
      steps,
      from,
      to,
      credit: ROUTE_CREDIT.text
    }
  };
}

let lastRequestAt = 0;
/** Fetch a route online, at most one request per second. fetchImpl is injectable for tests. */
export async function fetchOnlineRoute(from, to, { profile = "drive", endpoints, fetchImpl = globalThis.fetch, now = () => Date.now(), timeoutMs = 12000 } = {}) {
  if (typeof fetchImpl !== "function") return { ok: false, reason: "No network on this device." };
  const wait = lastRequestAt + 1100 - now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = now();
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(routeUrl(from, to, { profile, endpoints }), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller?.signal
    });
    if (!res.ok) return { ok: false, reason: `The online route service answered ${res.status}.` };
    return parseOsrmRoute(await res.json(), { profile, from, to });
  } catch {
    return { ok: false, reason: "Could not reach the online route service." };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function _resetRouteClock() {
  lastRequestAt = 0;
}
