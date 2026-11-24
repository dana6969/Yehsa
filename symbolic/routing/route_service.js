// One place the Map and Ask call for search and routes. The phone supplies loadAsset(region, kind)
// (src/phone/route/route_assets.native.js); Node tests pass a loader that reads files.
// Online first when allowed (and fall back to offline on any failure); offline only otherwise.
import { decodeGraph } from "./graph_format.js";
import { routeOffline } from "./router.js";
import { fetchOnlineRoute } from "./route_online.js";
import { geocodeOnline } from "./geocode.js";
import { parsePlaceIndex, parseSearch, searchPlaces, searchStreetsInGraph, looksLikeStreet, normalizeName, kindLabel } from "./place_search.js";
import { distanceM } from "./geo.js";
import { ROUTE_REGIONS } from "./regions.js";

export const ROAD_NOTE = "Check road conditions and obey all signs. Roads, tracks and trails can be closed, gated, washed out or private. No traffic data is used.";

export function regionsAt(point) {
  if (!point) return [];
  return ROUTE_REGIONS.filter((r) => point.latitude >= r.bounds.south && point.latitude <= r.bounds.north && point.longitude >= r.bounds.west && point.longitude <= r.bounds.east)
    .sort((a, b) => area(a) - area(b));
}
const area = (r) => (r.bounds.north - r.bounds.south) * (r.bounds.east - r.bounds.west);

const NEAREST = [
  [/hospital|er\b|emergency room/, ["hospital", "clinic"]],
  [/gas|fuel|gas station/, ["fuel"]],
  [/pharmacy|drug ?store/, ["pharmacy"]],
  [/police|sheriff/, ["police"]],
  [/fire station|fire department/, ["fire_station"]],
  [/ranger/, ["ranger_station"]],
  [/grocery|supermarket|food store/, ["supermarket", "convenience", "general"]],
  [/store|shop|convenience/, ["convenience", "supermarket", "general", "hardware", "department_store"]],
  [/hardware/, ["hardware", "doityourself"]],
  [/camp ?ground|campsite|camp site|camping/, ["camp_site", "caravan_site"]],
  [/trail ?head/, ["trailhead"]],
  [/town|city/, ["town", "city", "village"]],
  [/shelter|hut/, ["shelter", "alpine_hut", "wilderness_hut"]],
  [/water|lake|pond/, ["water"]],
  [/peak|summit|mountain/, ["peak"]],
  [/post office/, ["post_office"]],
  [/restaurant|food|eat/, ["restaurant", "fast_food", "cafe"]],
  [/motel|hotel|lodging/, ["motel", "hotel"]]
];

/** "nearest hospital" / "closest gas station" -> list of kinds, else null. */
export function nearestKinds(query) {
  const m = String(query || "").toLowerCase().match(/^(?:the\s+)?(?:nearest|closest|a|an)\s+(.+)$/);
  if (!m) return null;
  for (const [re, kinds] of NEAREST) if (re.test(m[1])) return kinds;
  return null;
}

export function createRouteService({ loadAsset, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const graphs = new Map(); // keep at most one decoded graph in memory
  const places = new Map(); // and a few place lists

  async function graphFor(region) {
    if (graphs.has(region)) return graphs.get(region);
    const bytes = await loadAsset(region, "graph");
    if (!bytes) return null;
    const graph = decodeGraph(bytes, { id: region });
    graphs.clear();
    graphs.set(region, graph);
    return graph;
  }
  async function placesFor(region) {
    if (places.has(region)) return places.get(region);
    const text = await loadAsset(region, "places");
    if (!text) return [];
    const rows = parsePlaceIndex(text, { region });
    if (places.size >= 3) places.delete(places.keys().next().value);
    places.set(region, rows);
    return rows;
  }

  async function searchOffline(query, { near = null, limit = 8, regions = null } = {}) {
    const kinds = nearestKinds(query);
    const parsed = parseSearch(query);
    const local = regionsAt(near).map((r) => r.id);
    // A named state narrows the search to it; otherwise start where you are.
    let ids = regions || (parsed.state ? [parsed.state] : local);
    const fallback = !regions && !parsed.state;
    if (!ids.length) ids = ROUTE_REGIONS.map((r) => r.id);
    const found = [];
    const searchIn = async (id, withStreets) => {
      const rows = await placesFor(id);
      if (kinds && near) {
        const hits = rows.filter((r) => kinds.includes(r.kind))
          .map((r) => ({ r, d: distanceM(near, r), k: kinds.indexOf(r.kind) }))
          .filter((x) => x.d < 150000)
          .sort((a, b) => a.k - b.k || a.d - b.d)
          .slice(0, limit)
          .map(({ r }) => ({ name: r.name, detail: [kindLabel(r.kind), r.near].filter(Boolean).join(" · "), kind: r.kind, latitude: r.latitude, longitude: r.longitude, region: id, source: "offline", score: 0 }));
        found.push(...hits);
        return;
      }
      const places = searchPlaces(rows, query, { near, limit });
      found.push(...places);
      // Streets live in the road graph. Read it when the search looks like a street or an
      // address, or when the place list had nothing good.
      if (withStreets && (looksLikeStreet(query) || !places.some((f) => f.score >= 60))) {
        try {
          const graph = await graphFor(id);
          found.push(...searchStreetsInGraph(graph, query, { rows, near, limit, region: id }));
        } catch {
          // no road file for this region
        }
      }
    };
    for (const [i, id] of ids.entries()) await searchIn(id, i === 0);
    if (fallback && !kinds && !found.some((f) => f.score >= 60)) {
      for (const r of ROUTE_REGIONS) if (!ids.includes(r.id)) await searchIn(r.id, false);
    }
    if (!kinds) found.sort((a, b) => b.score - a.score);
    return found.slice(0, limit);
  }

  /** Search: online results first (if allowed), then offline ones not already listed. */
  async function search(query, { near = null, online = false, settings = {}, limit = 8 } = {}) {
    const notes = [];
    let results = [];
    if (online && !nearestKinds(query)) {
      const res = await geocodeOnline(query, { near, settings, fetchImpl, now });
      if (res.ok) results = res.results;
      else notes.push(`${res.reason} Showing offline results.`);
    }
    let offline = [];
    try {
      offline = await searchOffline(query, { near, limit });
    } catch {
      notes.push("The offline place list could not be read.");
    }
    for (const r of offline) {
      if (results.length >= limit) break;
      if (!results.some((x) => normalizeName(x.name).join(" ") === normalizeName(r.name).join(" ") && distanceM(x, r) < 3000)) results.push(r);
    }
    if (!results.length && !online) notes.push("Nothing in the offline place list matched. Go online to search addresses and more places.");
    return { results, notes };
  }

  async function route(from, to, { profile = "drive", online = false, endpoints } = {}) {
    const notes = [];
    if (online) {
      const res = await fetchOnlineRoute(from, to, { profile, endpoints, fetchImpl, now });
      if (res.ok) return { ok: true, route: res.route, notes };
      notes.push(`${res.reason} Using the offline road data.`);
    }
    const a = regionsAt(from);
    const b = new Set(regionsAt(to).map((r) => r.id));
    const shared = a.filter((r) => b.has(r.id));
    // Prefer the region the destination came from (search results carry it).
    shared.sort((x, y) => (y.id === to.region) - (x.id === to.region));
    if (!shared.length) {
      const reason = !a.length
        ? "Your position is outside the offline road data (it covers the map-pack states)."
        : "Offline routes stay inside one state's road file, and this trip crosses a state line. Go online for this route.";
      return { ok: false, reason, notes };
    }
    // State boxes overlap, so try each state that holds both ends until one has roads there.
    let res = null;
    for (const region of shared) {
      const graph = await graphFor(region.id);
      if (!graph) continue;
      res = routeOffline(graph, from, to, { profile });
      if (res.ok) break;
    }
    if (!res) return { ok: false, reason: "The offline road data could not be read.", notes };
    if (!res.ok) return { ok: false, reason: res.reason, notes };
    res.route.credit = "Offline route from OpenStreetMap road data (© OpenStreetMap contributors, ODbL), built into Yehsa.";
    return { ok: true, route: res.route, notes };
  }

  /** Road lines in a box as GeoJSON, read from the same graph (for a road layer that wants it). */
  async function roadsInBox(region, box, { maxClass = 9 } = {}) {
    const graph = await graphFor(region);
    if (!graph) return { type: "FeatureCollection", features: [] };
    const { head } = graph;
    const features = [];
    const x0 = Math.max(0, Math.floor((box.west - head.west) / head.cell));
    const x1 = Math.min(head.cellsW - 1, Math.floor((box.east - head.west) / head.cell));
    const y0 = Math.max(0, Math.floor((box.south - head.south) / head.cell));
    const y1 = Math.min(head.cellsH - 1, Math.floor((box.north - head.south) / head.cell));
    const seen = new Set();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = y * head.cellsW + x;
        for (let n = graph.cellStart[c]; n < graph.cellStart[c + 1]; n++) {
          for (let a = graph.adjStart[n]; a < graph.adjStart[n + 1]; a++) {
            const k = graph.adj[a];
            if (seen.has(k) || (graph.kind[k] & 15) > maxClass) continue;
            seen.add(k);
            const coords = [[graph.lon[graph.from[k]], graph.lat[graph.from[k]]]];
            for (let j = graph.shapeStart[k]; j < graph.shapeStart[k + 1]; j++) coords.push([graph.shapeLon[j], graph.shapeLat[j]]);
            coords.push([graph.lon[graph.to[k]], graph.lat[graph.to[k]]]);
            features.push({ type: "Feature", properties: { cls: graph.kind[k] & 15, name: graph.names[graph.name[k]] || "" }, geometry: { type: "LineString", coordinates: coords } });
          }
        }
      }
    }
    return { type: "FeatureCollection", features };
  }

  return { search, searchOffline, route, roadsInBox, graphFor, placesFor };
}
