// Internet radio directory. This is the only radio feature that uses the network, it needs
// signal, and it runs only when the user taps Search or Play. Station data comes from the
// community Radio Browser directory (https://www.radio-browser.info, open data). Yehsa sends
// the search words and nothing else about the phone or the person.

const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
  "https://at1.api.radio-browser.info"
];

export const INTERNET_RADIO_LABEL = "Needs signal. Uses mobile data or Wi-Fi.";
export const INTERNET_RADIO_PRIVACY = "Search words go to radio-browser.info. Playing a station connects to that station's own server.";

export function buildSearchPath({ name = "", state = "", country = "United States", tag = "", limit = 30 } = {}) {
  const q = new URLSearchParams();
  if (name.trim()) q.set("name", name.trim());
  if (state.trim()) q.set("state", state.trim());
  if (country.trim()) q.set("country", country.trim());
  if (tag.trim()) q.set("tag", tag.trim());
  q.set("hidebroken", "true");
  q.set("order", "clickcount");
  q.set("reverse", "true");
  q.set("limit", String(Math.max(1, Math.min(100, limit))));
  return `/json/stations/search?${q.toString()}`;
}

export function normalizeStation(raw) {
  const url = String(raw?.url_resolved || raw?.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    id: String(raw.stationuuid || url),
    name: String(raw.name || "").replace(/\s+/g, " ").trim() || "Unnamed station",
    url,
    codec: String(raw.codec || "").toUpperCase(),
    bitrate: Number(raw.bitrate) || 0,
    state: String(raw.state || ""),
    country: String(raw.countrycode || raw.country || ""),
    tags: String(raw.tags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 4),
    homepage: String(raw.homepage || "")
  };
}

// fetchImpl is injected so tests need no network.
export async function searchStations(options = {}, { fetchImpl = globalThis.fetch, mirrors = MIRRORS, timeoutMs = 12000 } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("No network access in this build.");
  const path = buildSearchPath(options);
  let lastError = null;
  for (const base of mirrors) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(base + path, { headers: { Accept: "application/json", "User-Agent": "Yehsa/1.0 (offline survival app)" }, signal: controller?.signal });
      if (!res.ok) throw new Error(`Directory answered ${res.status}.`);
      const list = await res.json();
      const seen = new Set();
      const stations = [];
      for (const raw of Array.isArray(list) ? list : []) {
        const s = normalizeStation(raw);
        if (!s || seen.has(s.name.toLowerCase())) continue;
        seen.add(s.name.toLowerCase());
        stations.push(s);
      }
      return stations;
    } catch (err) {
      lastError = err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw new Error(lastError?.message ? `Could not reach the radio directory. ${lastError.message}` : "Could not reach the radio directory.");
}

export function openFavorites(raw) {
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(list)) return [];
    return list.map((s) => normalizeStation({ ...s, url_resolved: s.url, stationuuid: s.id })).filter(Boolean).slice(0, 100);
  } catch {
    return [];
  }
}

export function toggleFavorite(list, station) {
  const has = list.some((s) => s.id === station.id);
  return has ? list.filter((s) => s.id !== station.id) : [station, ...list].slice(0, 100);
}
