// Offline place and street search over the bundled .ypl indexes (built from OpenStreetMap, ODbL).
// Each line: name \t kind \t lat \t lon \t nearest town. No house numbers are stored, so an
// address search lands on the street, near its town.
import { distanceM } from "./geo.js";

const ABBR = {
  st: "street", rd: "road", ave: "avenue", av: "avenue", hwy: "highway", mt: "mount", mtn: "mountain", ln: "lane",
  dr: "drive", ct: "court", pl: "place", blvd: "boulevard", pkwy: "parkway", cir: "circle", ter: "terrace",
  n: "north", s: "south", e: "east", w: "west", ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
  ft: "fort", pt: "point", hts: "heights", jct: "junction", lk: "lake", pd: "pond", rte: "route", rt: "route", sq: "square", tpke: "turnpike"
};

export const STATE_WORDS = {
  me: ["maine", "me"], ri: ["rhode island", "ri"], nh: ["new hampshire", "nh"], vt: ["vermont", "vt"],
  ma: ["massachusetts", "ma", "mass"], ct: ["connecticut", "ct", "conn"], ny: ["new york", "ny"], pa: ["pennsylvania", "pa", "penn"],
  mi: ["michigan", "mi", "mich"], wi: ["wisconsin", "wi", "wis"], mn: ["minnesota", "mn", "minn"], co: ["colorado", "co", "colo"],
  mt: ["montana", "mt", "mont"], id: ["idaho", "id"], wy: ["wyoming", "wy", "wyo"]
};

export function normalizeName(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => ABBR[w] || w);
}

export function parsePlaceIndex(text, { region = "" } = {}) {
  const rows = [];
  for (const line of String(text || "").split("\n")) {
    if (!line) continue;
    const [name, kind, lat, lon, near] = line.split("\t");
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    rows.push({ name, kind, latitude, longitude, near: near || "", region, words: normalizeName(name), nearWords: normalizeName(near) });
  }
  return rows;
}

/**
 * Split a typed search into its parts: house number, main words, a town hint, and a state hint.
 * "12 Main St, Bangor, Maine" -> { house: "12", words: [main, street], town: [bangor], state: "me" }
 */
export function parseSearch(query) {
  let q = String(query || "").trim();
  let state = null;
  const parts = q.split(",").map((p) => p.trim()).filter(Boolean);
  const plain = (txt) => String(txt || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const findState = (txt) => {
    const t = ` ${plain(txt)} `;
    for (const [code, words] of Object.entries(STATE_WORDS)) {
      for (const w of words) {
        if (t.endsWith(` ${w} `)) return { code, rest: t.slice(0, t.length - w.length - 1).trim() };
      }
    }
    return null;
  };
  if (parts.length > 1) {
    const s = findState(parts[parts.length - 1]);
    if (s) {
      state = s.code;
      if (s.rest) parts[parts.length - 1] = s.rest;
      else parts.pop();
    }
  } else {
    // "bangor maine": only a full state name at the end counts here (not "me" or "co").
    const t = plain(parts[0]);
    for (const [code, words] of Object.entries(STATE_WORDS)) {
      if (words[0].includes(" ") || words[0].length > 3) {
        if (t.endsWith(` ${words[0]}`)) {
          state = code;
          parts[0] = t.slice(0, t.length - words[0].length).trim();
        }
      }
    }
  }
  let main = parts[0] || "";
  let town = parts.slice(1).join(" ");
  const inMatch = !town && main.match(/^(.+?)\s+(?:in|near)\s+(.+)$/i);
  if (inMatch) {
    main = inMatch[1];
    town = inMatch[2];
  }
  let house = null;
  const hm = main.match(/^\s*(\d+[a-z]?)\s+(.+)$/i);
  if (hm && /[a-z]/i.test(hm[2])) {
    house = hm[1];
    main = hm[2];
  }
  return { house, words: normalizeName(main), town: normalizeName(town), state };
}

const KIND_BONUS = { city: 30, town: 26, village: 18, suburb: 12, hamlet: 10, neighbourhood: 6, locality: 4, peak: 12, water: 12, bay: 8, national_park: 12, hospital: 8, fuel: 4, trailhead: 6, camp_site: 5, protected_area: 12, nature_reserve: 8, park: 4, street: 0 };
const STREET_WORDS = new Set(["street", "road", "avenue", "lane", "drive", "court", "place", "boulevard", "highway", "way", "route", "circle", "terrace", "parkway", "turnpike"]);

function prefixAll(needles, hay) {
  for (const n of needles) {
    let hit = false;
    for (const h of hay) {
      if (h === n || (n.length >= 2 && h.startsWith(n))) {
        hit = true;
        break;
      }
    }
    if (!hit) return false;
  }
  return true;
}

/** Search rows (from parsePlaceIndex). near: bias point. Returns the best `limit` results. */
export function searchPlaces(rows, query, { near = null, limit = 8 } = {}) {
  const parsed = parseSearch(query);
  const { words, town } = parsed;
  if (!words.length) return [];
  const wantsStreet = words.some((w) => STREET_WORDS.has(w)) || Boolean(parsed.house);
  const joined = words.join(" ");
  const scored = [];
  for (const row of rows) {
    if (parsed.state && row.region && row.region !== parsed.state) continue;
    let ok = prefixAll(words, row.words);
    let viaNear = false;
    if (!ok && !town.length) {
      // "Main Street Bangor": some words may be the town.
      ok = prefixAll(words, [...row.words, ...row.nearWords]) && row.words.some((w) => words.includes(w));
      viaNear = ok;
    }
    if (!ok) continue;
    let score = 0;
    const name = row.words.join(" ");
    if (name === joined) score += 100;
    else if (name.startsWith(joined)) score += 60;
    else score += 40 - Math.min(20, row.words.length - words.length) * 2;
    score += KIND_BONUS[row.kind] ?? 2;
    if (row.kind === "street") score += wantsStreet ? 25 : -10;
    if (town.length) {
      if (prefixAll(town, row.nearWords) || prefixAll(town, row.words)) score += 50;
      else score -= 40;
    }
    if (viaNear) score += 20;
    if (near) score -= Math.min(20, distanceM(near, row) / 10000);
    scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const out = [];
  const seen = new Set();
  for (const { row, score } of scored) {
    const key = `${row.name.toLowerCase()}|${row.near.toLowerCase()}|${row.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: row.name,
      detail: [row.kind === "street" ? "Street" : kindLabel(row.kind), row.near].filter(Boolean).join(" · "),
      kind: row.kind,
      latitude: row.latitude,
      longitude: row.longitude,
      region: row.region,
      source: "offline",
      house: parsed.house,
      score
    });
    if (out.length >= limit) break;
  }
  return out;
}

const TOWN_KINDS = new Set(["city", "town", "village", "hamlet", "suburb"]);

/**
 * Streets come from the road graph's own names (the place lists hold no streets), so a street
 * search reads the same data the router uses. One hit per street name per ~5 km, labelled with
 * the nearest town from the place list.
 */
export function searchStreetsInGraph(graph, query, { rows = [], near = null, limit = 8, region = "" } = {}) {
  const parsed = parseSearch(query);
  let { words, town } = parsed;
  if (!words.length || !graph) return [];
  if (!graph._nameWords) graph._nameWords = graph.names.map((n) => normalizeName(n));
  const matchNames = (needles) => {
    const found = new Map();
    for (let i = 1; i < graph.names.length && found.size < 400; i++) {
      if (prefixAll(needles, graph._nameWords[i])) found.set(i, new Map());
    }
    return found;
  };
  let matched = matchNames(words);
  // "Hammond Street Bangor": the last word or two may be the town.
  for (let cut = 1; !matched.size && !town.length && cut <= 2 && words.length - cut >= 1; cut++) {
    const head = words.slice(0, words.length - cut);
    const next = matchNames(head);
    if (next.size) {
      matched = next;
      town = words.slice(words.length - cut);
      words = head;
    }
  }
  if (!matched.size) return [];
  for (let k = 0; k < graph.E; k++) {
    const cells = matched.get(graph.name[k]);
    if (!cells) continue;
    const n = graph.from[k];
    const key = `${Math.floor(graph.lat[n] / 0.05)},${Math.floor(graph.lon[n] / 0.05)}`;
    if (!cells.has(key)) cells.set(key, { latitude: graph.lat[n], longitude: graph.lon[n] });
  }
  const towns = rows.filter((r) => TOWN_KINDS.has(r.kind));
  const nearestTown = (p) => {
    let best = null;
    let bd = Infinity;
    for (const t of towns) {
      const d = (t.latitude - p.latitude) ** 2 + ((t.longitude - p.longitude) * 0.72) ** 2;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  };
  const joined = words.join(" ");
  const out = [];
  let budget = 600;
  for (const [i, cells] of matched) {
    const nameWords = graph._nameWords[i];
    const base = nameWords.join(" ") === joined ? 100 : nameWords.join(" ").startsWith(joined) ? 60 : 40 - Math.min(20, nameWords.length - words.length) * 2;
    for (const p of cells.values()) {
      if (--budget < 0) break;
      const t = nearestTown(p);
      let score = base + 10;
      if (town.length) {
        if (t && prefixAll(town, t.words)) score += 50;
        else score -= 40;
      }
      if (near) score -= Math.min(20, distanceM(near, p) / 10000);
      out.push({ name: graph.names[i], detail: ["Street", t?.name].filter(Boolean).join(" · "), kind: "street", latitude: p.latitude, longitude: p.longitude, region, source: "offline", house: parsed.house, score });
    }
  }
  out.sort((a, b) => b.score - a.score);
  const seen = new Set();
  return out.filter((r) => {
    const key = `${r.name}|${r.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function looksLikeStreet(query) {
  const p = parseSearch(query);
  return Boolean(p.house) || p.words.some((w) => STREET_WORDS.has(w));
}

export function kindLabel(kind) {
  const k = String(kind || "").replace(/_/g, " ");
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : "";
}
