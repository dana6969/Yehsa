// Online place and address search, used only when the phone is online and only when you press
// Search (never per keystroke). Primary: Photon by Komoot (photon.komoot.io; terms: fair use,
// heavy use is throttled). Fallback: OSM Nominatim (nominatim.openstreetmap.org), within its usage
// policy: a real User-Agent, at most 1 request per second, no autocomplete, results cached here,
// and the endpoint is a setting so it can be switched without an app update.
// Both return OpenStreetMap data: © OpenStreetMap contributors, ODbL.
import { USER_AGENT } from "./route_online.js";

export const GEOCODERS = {
  photon: { id: "photon", label: "Photon (Komoot)", base: "https://photon.komoot.io", terms: "https://photon.komoot.io/" },
  nominatim: { id: "nominatim", label: "Nominatim (OSM)", base: "https://nominatim.openstreetmap.org", terms: "https://operations.osmfoundation.org/policies/nominatim/" }
};
export const GEOCODE_CREDIT = "Search: Photon by Komoot and OSM Nominatim. Data © OpenStreetMap contributors, ODbL.";

export function photonUrl(query, { near = null, limit = 6, base = GEOCODERS.photon.base } = {}) {
  const q = encodeURIComponent(String(query || "").trim());
  let url = `${base.replace(/\/+$/, "")}/api/?q=${q}&limit=${limit}&lang=en`;
  if (near && Number.isFinite(near.latitude) && Number.isFinite(near.longitude)) {
    url += `&lat=${near.latitude.toFixed(4)}&lon=${near.longitude.toFixed(4)}&location_bias_scale=0.3`;
  }
  return url;
}

export function nominatimUrl(query, { near = null, limit = 6, base = GEOCODERS.nominatim.base } = {}) {
  const q = encodeURIComponent(String(query || "").trim());
  let url = `${base.replace(/\/+$/, "")}/search?q=${q}&format=jsonv2&addressdetails=1&limit=${limit}`;
  if (near && Number.isFinite(near.latitude) && Number.isFinite(near.longitude)) {
    const d = 1.5;
    url += `&viewbox=${(near.longitude - d).toFixed(3)},${(near.latitude + d).toFixed(3)},${(near.longitude + d).toFixed(3)},${(near.latitude - d).toFixed(3)}`;
  }
  return url;
}

const join = (parts) => parts.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");

export function parsePhoton(json) {
  const out = [];
  for (const f of json?.features || []) {
    const c = f?.geometry?.coordinates;
    const p = f?.properties || {};
    if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const street = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street;
    const name = p.name || street || p.city || "";
    if (!name) continue;
    out.push({
      name,
      detail: join([p.name && street ? street : "", p.city || p.town || p.village || p.county, p.state, p.countrycode === "US" ? "" : p.country]),
      kind: p.osm_value || p.type || "",
      latitude: c[1],
      longitude: c[0],
      source: "online"
    });
  }
  return out;
}

export function parseNominatim(json) {
  const out = [];
  for (const r of Array.isArray(json) ? json : []) {
    const lat = Number(r?.lat);
    const lon = Number(r?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const a = r.address || {};
    const street = a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road;
    const name = r.name || street || String(r.display_name || "").split(",")[0];
    if (!name) continue;
    out.push({
      name,
      detail: join([r.name && street ? street : "", a.city || a.town || a.village || a.hamlet || a.county, a.state]),
      kind: r.type || r.category || "",
      latitude: lat,
      longitude: lon,
      source: "online"
    });
  }
  return out;
}

const cache = new Map();
const lastByHost = new Map();
const CACHE_MAX = 100;

async function politeFetch(url, fetchImpl, now) {
  const host = url.split("/")[2];
  const wait = (lastByHost.get(host) || 0) + 1100 - now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastByHost.set(host, now());
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: controller?.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Search online. Returns { ok, results, provider } — never throws. Cached per query + rounded place.
 * settings: { geocoder: "photon" | "nominatim", photonBase?, nominatimBase? }
 */
export async function geocodeOnline(query, { near = null, settings = {}, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) return { ok: false, results: [], reason: "Type a place or address." };
  if (typeof fetchImpl !== "function") return { ok: false, results: [], reason: "No network on this device." };
  const key = `${q.toLowerCase()}|${near ? `${near.latitude.toFixed(1)},${near.longitude.toFixed(1)}` : ""}`;
  if (cache.has(key)) return cache.get(key);
  const order = settings.geocoder === "nominatim" ? ["nominatim", "photon"] : ["photon", "nominatim"];
  for (const id of order) {
    const url = id === "photon"
      ? photonUrl(q, { near, base: settings.photonBase || GEOCODERS.photon.base })
      : nominatimUrl(q, { near, base: settings.nominatimBase || GEOCODERS.nominatim.base });
    const json = await politeFetch(url, fetchImpl, now);
    if (!json) continue;
    const results = id === "photon" ? parsePhoton(json) : parseNominatim(json);
    const answer = { ok: true, results, provider: id };
    cache.set(key, answer);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return answer;
  }
  return { ok: false, results: [], reason: "Could not reach the online search." };
}

export function _resetGeocoder() {
  cache.clear();
  lastByHost.clear();
}
