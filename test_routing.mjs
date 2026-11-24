// Routing: offline graph + router, turn steps, follow-along mode, online route parsing (mocked),
// geocoder parsing (mocked), offline place search, route service fallback, Ask route intents,
// and the Ask tidy helpers. No network: every fetch here is a mock.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { decodeGraph, readHeader } from "./symbolic/routing/graph_format.js";
import { routeOffline, snapToRoad, PROFILES } from "./symbolic/routing/router.js";
import { modifierFor, spokenStep, stepText, tidyRoadName, sameRoad } from "./symbolic/routing/steps.js";
import { followStep, initialFollow, prepareRoute } from "./symbolic/routing/nav_follow.js";
import { parseOsrmRoute, routeUrl, fetchOnlineRoute, USER_AGENT, _resetRouteClock } from "./symbolic/routing/route_online.js";
import { geocodeOnline, nominatimUrl, parseNominatim, parsePhoton, photonUrl, _resetGeocoder } from "./symbolic/routing/geocode.js";
import { parsePlaceIndex, parseSearch, searchPlaces } from "./symbolic/routing/place_search.js";
import { createRouteService, nearestKinds, regionsAt, ROAD_NOTE } from "./symbolic/routing/route_service.js";
import { routeIntent } from "./symbolic/routing/route_intent.js";
import { ROUTE_REGIONS } from "./symbolic/routing/regions.js";
import { distanceM, formatDistance, formatDuration } from "./symbolic/routing/geo.js";
import { DEV_SET } from "./eval/dev_set.mjs";
import { PARAPHRASE_SET } from "./eval/paraphrase_set.mjs";
import { buildQuestions } from "./eval/questions.mjs";

// ---- a tiny hand-made .yrg (same encoder rules as tools/routing/build_graph.py) ----
function uv(out, x) { while (x >= 0x80) { out.push((x & 0x7f) | 0x80); x = Math.floor(x / 128); } out.push(x); }
const zz = (x) => (x >= 0 ? x * 2 : -x * 2 - 1);
function encodeGraph({ nodes, edges, names }) {
  // nodes: [[lat, lon]] already sorted; edges: [{ a, b, len, cls, flags, name }], one grid cell.
  const south = Math.min(...nodes.map((n) => n[0])), north = Math.max(...nodes.map((n) => n[0]));
  const west = Math.min(...nodes.map((n) => n[1])), east = Math.max(...nodes.map((n) => n[1]));
  const cell = 0.02;
  const cw = Math.floor((east - west) / cell) + 1, ch = Math.floor((north - south) / cell) + 1;
  const cellOf = (n) => Math.min(ch - 1, Math.floor((n[0] - south) / cell)) * cw + Math.min(cw - 1, Math.floor((n[1] - west) / cell));
  const order = nodes.map((n, i) => i).sort((x, y) => cellOf(nodes[x]) - cellOf(nodes[y]) || x - y);
  const remap = new Map(order.map((old, i) => [old, i]));
  const secN = []; let pl = 0, po = 0;
  for (const i of order) { const la = Math.round(nodes[i][0] * 1e6), lo = Math.round(nodes[i][1] * 1e6); uv(secN, zz(la - pl)); uv(secN, zz(lo - po)); pl = la; po = lo; }
  const counts = new Array(cw * ch).fill(0); for (const i of order) counts[cellOf(nodes[i])]++;
  const secC = []; for (const c of counts) uv(secC, c);
  const es = edges.map((e) => ({ ...e, a: remap.get(e.a), b: remap.get(e.b) })).sort((x, y) => x.a - y.a || x.b - y.b);
  const secE = []; let pf = 0;
  for (const e of es) { uv(secE, e.a - pf); pf = e.a; uv(secE, zz(e.b - e.a)); uv(secE, e.len); uv(secE, e.name || 0); uv(secE, e.cls | ((e.flags || 0) << 4)); uv(secE, 0); }
  const secS = []; for (const n of names) { const b = Buffer.from(n, "utf8"); uv(secS, b.length); secS.push(...b); }
  const head = Buffer.alloc(68);
  head.write("YRG2", 0, "ascii"); head.writeUInt16LE(2, 4);
  head.writeUInt32LE(nodes.length, 8); head.writeUInt32LE(es.length, 12); head.writeUInt32LE(0, 16); head.writeUInt32LE(names.length, 20);
  head.writeInt32LE(Math.round(south * 1e6), 24); head.writeInt32LE(Math.round(west * 1e6), 28); head.writeInt32LE(Math.round(north * 1e6), 32); head.writeInt32LE(Math.round(east * 1e6), 36);
  head.writeUInt32LE(Math.round(cell * 1e6), 40); head.writeUInt32LE(cw, 44); head.writeUInt32LE(ch, 48);
  head.writeUInt32LE(secN.length, 52); head.writeUInt32LE(secC.length, 56); head.writeUInt32LE(secE.length, 60); head.writeUInt32LE(secS.length, 64);
  return new Uint8Array(Buffer.concat([head, Buffer.from(secN), Buffer.from(secC), Buffer.from(secE), Buffer.from(secS)]));
}
// A square block: 0=(0,0) 1=(0,0.002) 2=(0.002,0.002) 3=(0.002,0); plus a motorway 0->4 far east.
const D = 0.002; // about 222 m north, 160 m east at 44 N
const base = [44, -69];
const pts = [[0, 0], [0, D], [D, D], [D, 0], [0, 3 * D]].map(([a, b]) => [base[0] + a, base[1] + b]);
const len = (i, j) => Math.round(distanceM({ latitude: pts[i][0], longitude: pts[i][1] }, { latitude: pts[j][0], longitude: pts[j][1] }));
const tiny = decodeGraph(encodeGraph({
  nodes: pts,
  names: ["", "Main Street", "Oak Street", "Elm Street", "I 95"],
  edges: [
    { a: 0, b: 1, len: len(0, 1), cls: 6, name: 1, flags: 1 }, // Main St one-way 0 -> 1
    { a: 1, b: 2, len: len(1, 2), cls: 6, name: 2 },
    { a: 2, b: 3, len: len(2, 3), cls: 6, name: 3 },
    { a: 3, b: 0, len: len(3, 0), cls: 6, name: 2 },
    { a: 1, b: 4, len: len(1, 4), cls: 0, name: 4, flags: 1 } // motorway, no walking
  ]
}));
const P = (i) => ({ latitude: pts[i][0], longitude: pts[i][1] });

test("tiny graph decodes and snaps", () => {
  assert.equal(tiny.N, 5);
  assert.equal(tiny.E, 5);
  const hit = snapToRoad(tiny, { latitude: base[0] + 0.00001, longitude: base[1] + D / 2 });
  assert.ok(hit && hit.distM < 5);
  assert.equal(tiny.names[tiny.name[hit.edge]], "Main Street");
  assert.equal(snapToRoad(tiny, { latitude: 10, longitude: 10 }), null);
});

test("router honours one-way streets when driving, not when walking", () => {
  const forward = routeOffline(tiny, P(0), P(1), { profile: "drive" });
  assert.ok(forward.ok);
  assert.ok(Math.abs(forward.route.distanceM - len(0, 1)) < 2);
  const back = routeOffline(tiny, P(1), P(0), { profile: "drive" });
  assert.ok(back.ok);
  assert.ok(back.route.distanceM > len(0, 1) * 2, "drives around the block instead of against the one-way");
  const walk = routeOffline(tiny, P(1), P(0), { profile: "walk" });
  assert.ok(Math.abs(walk.route.distanceM - len(0, 1)) < 2, "walking may use the one-way street both ways");
  const steps = back.route.steps;
  assert.equal(steps[0].type, "depart");
  assert.equal(steps.at(-1).type, "arrive");
  assert.ok(steps.some((s) => /Turn (left|right) onto (Elm|Oak) Street/.test(s.instruction)), JSON.stringify(steps.map((s) => s.instruction)));
});

test("walking never uses the motorway", () => {
  const drive = routeOffline(tiny, P(1), P(4), { profile: "drive" });
  assert.ok(drive.ok);
  assert.ok(drive.route.steps.some((s) => /I-95/.test(s.instruction)));
  const walk = routeOffline(tiny, P(1), P(4), { profile: "walk", maxSettled: 1000 });
  // On foot the motorway is not a road: the walk ends on the nearest street instead.
  assert.ok(!walk.ok || distanceM(walk.route.coordinates.at(-1), P(4)) > 100);
  assert.ok(!walk.ok || !walk.route.steps.some((s) => /I-95/.test(s.instruction)));
  assert.ok(PROFILES.walk.speeds[0] === 0);
});

test("real Rhode Island graph routes Providence to Newport", () => {
  const bytes = new Uint8Array(fs.readFileSync("assets/routing/ri.yrg"));
  const head = readHeader(bytes);
  assert.ok(head.nodes > 10000);
  const g = decodeGraph(bytes, { id: "ri" });
  const t = Date.now();
  const r = routeOffline(g, { latitude: 41.824, longitude: -71.4128 }, { latitude: 41.4901, longitude: -71.3128 }, { profile: "drive" });
  assert.ok(r.ok, r.reason);
  assert.ok(r.route.distanceM > 40000 && r.route.distanceM < 70000, `${r.route.distanceM}`);
  assert.ok(r.route.durationS > 1500 && r.route.durationS < 4800);
  assert.ok(r.route.steps.length >= 3 && r.route.steps.length < 60);
  assert.ok(Date.now() - t < 3000);
});

test("step wording", () => {
  assert.equal(modifierFor(-90), "left");
  assert.equal(modifierFor(30), "slight right");
  assert.equal(modifierFor(150), "sharp right");
  assert.equal(stepText({ type: "turn", modifier: "left", name: "Main Street" }), "Turn left onto Main Street");
  assert.equal(stepText({ type: "arrive", modifier: "right" }), "Arrive. Your destination is on the right");
  assert.equal(stepText({ type: "roundabout", exitNumber: 2, name: "Elm Street" }), "At the roundabout, take exit 2 onto Elm Street");
  assert.equal(tidyRoadName("I 295;US 1"), "I-295 / US-1");
  assert.ok(sameRoad("Maine Turnpike (I 95)", "I 95"));
  assert.ok(!sameRoad("Main Street", "Oak Street"));
  assert.equal(spokenStep({ instruction: "Turn left onto Main Street" }, 250), "In 800 feet, turn left onto Main Street");
  assert.equal(formatDistance(1609.344 * 2.04), "2.0 mi");
  assert.equal(formatDuration(3900), "1 h 5 min");
});

test("follow mode: next turn, spoken prompts, off route, arrival", () => {
  const r = routeOffline(tiny, P(1), P(0), { profile: "drive" }).route;
  const prep = prepareRoute(r);
  let st = initialFollow();
  const first = followStep(prep, st, { ...P(1), accuracy: 5 }, { profile: "drive" });
  assert.ok(first.remainingM > 400);
  assert.ok(first.nextStep && first.nextStep.type !== "depart");
  assert.ok(first.say && /^In |^Turn|^Continue|^Arrive/.test(first.say), first.say);
  st = first.state;
  const away = { latitude: base[0] - 0.01, longitude: base[1] - 0.01, accuracy: 5 };
  const off1 = followStep(prep, st, away);
  assert.equal(off1.offRoute, false);
  const off2 = followStep(prep, off1.state, away);
  assert.equal(off2.offRoute, true);
  assert.match(off2.say, /Off route/);
  const end = followStep(prep, initialFollow(), { ...P(0), accuracy: 5 });
  assert.equal(end.arrived, true);
  assert.equal(end.say, "You have arrived.");
});

const OSRM_SAMPLE = {
  code: "Ok",
  routes: [{
    distance: 953.8, duration: 762.9,
    geometry: { type: "LineString", coordinates: [[-70.2568, 43.6591], [-70.2566, 43.6592], [-70.2555, 43.6596], [-70.2478, 43.6614]] },
    legs: [{ steps: [
      { distance: 16.7, duration: 12, name: "Congress Street", maneuver: { type: "depart", bearing_after: 54, location: [-70.2568, 43.6591] } },
      { distance: 900, duration: 700, name: "Fore Street", ref: "US 1A", maneuver: { type: "turn", modifier: "right", location: [-70.2566, 43.6592] } },
      { distance: 0, duration: 0, name: "", maneuver: { type: "arrive", modifier: "left", location: [-70.2478, 43.6614] } }
    ] }]
  }]
};

test("online route: FOSSGIS URL and OSRM parsing", () => {
  const url = routeUrl({ latitude: 43.6591, longitude: -70.2568 }, { latitude: 43.6615, longitude: -70.2483 }, { profile: "walk" });
  assert.match(url, /^https:\/\/routing\.openstreetmap\.de\/routed-foot\/route\/v1\/driving\/-70\.256800,43\.659100;-70\.248300,43\.661500\?overview=full&geometries=geojson&steps=true/);
  const parsed = parseOsrmRoute(OSRM_SAMPLE, { profile: "drive" });
  assert.ok(parsed.ok);
  assert.equal(parsed.route.source, "online");
  assert.equal(parsed.route.coordinates.length, 4);
  assert.deepEqual(parsed.route.steps.map((s) => s.instruction), ["Head northeast on Congress Street", "Turn right onto Fore Street (US-1A)", "Arrive. Your destination is on the left"]);
  assert.equal(parsed.route.steps[1].index, 1);
  assert.equal(parseOsrmRoute({ code: "NoRoute", message: "Impossible route" }).ok, false);
});

test("online route fetch sends a real User-Agent and survives failure", async () => {
  _resetRouteClock();
  let seen = null;
  const ok = await fetchOnlineRoute({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, {
    fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, json: async () => OSRM_SAMPLE }; }
  });
  assert.ok(ok.ok);
  assert.equal(seen.init.headers["User-Agent"], USER_AGENT);
  assert.match(USER_AGENT, /^Yehsa\//);
  _resetRouteClock();
  const bad = await fetchOnlineRoute({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, { fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(bad.ok, false);
});

const PHOTON_SAMPLE = { type: "FeatureCollection", features: [
  { type: "Feature", geometry: { type: "Point", coordinates: [-68.7778, 44.8012] }, properties: { osm_key: "place", osm_value: "city", name: "Bangor", state: "Maine", county: "Penobscot County", countrycode: "US" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [-68.77, 44.80] }, properties: { osm_value: "house", housenumber: "12", street: "Main Street", city: "Bangor", state: "Maine", countrycode: "US" } },
  { type: "Feature", geometry: { type: "Point", coordinates: ["x", 1] }, properties: { name: "Broken" } }
] };
const NOMINATIM_SAMPLE = [
  { lat: "44.8012", lon: "-68.7778", name: "Bangor", type: "city", category: "place", display_name: "Bangor, Penobscot County, Maine, United States", address: { city: "Bangor", state: "Maine" } },
  { lat: "nope", lon: "1" }
];

test("geocoder URLs and parsing", () => {
  const u = photonUrl("12 Main St, Bangor", { near: { latitude: 44.8, longitude: -68.7 } });
  assert.match(u, /^https:\/\/photon\.komoot\.io\/api\/\?q=12%20Main%20St%2C%20Bangor&limit=6&lang=en&lat=44\.8000&lon=-68\.7000/);
  assert.match(nominatimUrl("Bangor"), /^https:\/\/nominatim\.openstreetmap\.org\/search\?q=Bangor&format=jsonv2&addressdetails=1&limit=6$/);
  const p = parsePhoton(PHOTON_SAMPLE);
  assert.equal(p.length, 2);
  assert.deepEqual([p[0].name, p[0].detail, p[0].kind], ["Bangor", "Penobscot County, Maine", "city"]);
  assert.equal(p[1].name, "12 Main Street");
  const n = parseNominatim(NOMINATIM_SAMPLE);
  assert.equal(n.length, 1);
  assert.equal(n[0].latitude, 44.8012);
});

test("geocodeOnline: User-Agent, cache, Nominatim fallback, 1 request per second", async () => {
  _resetGeocoder();
  const calls = [];
  let clock = 1_000_000;
  const fetchImpl = async (url, init) => {
    calls.push({ url, ua: init.headers["User-Agent"], at: clock });
    if (url.includes("photon")) return { ok: false, status: 503 };
    return { ok: true, json: async () => NOMINATIM_SAMPLE };
  };
  const now = () => clock;
  const first = await geocodeOnline("Bangor", { fetchImpl, now });
  assert.ok(first.ok);
  assert.equal(first.provider, "nominatim");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => /^Yehsa\//.test(c.ua)));
  const again = await geocodeOnline("bangor", { fetchImpl, now });
  assert.equal(calls.length, 2, "second identical search is served from the cache");
  assert.equal(again.results[0].name, "Bangor");
  // A different search right away waits for the per-host one-second gap.
  clock += 100;
  const t = Date.now();
  await geocodeOnline("Orono", { fetchImpl, now: () => clock });
  assert.ok(Date.now() - t >= 900, "waited before calling the same host again");
  const none = await geocodeOnline("x", { fetchImpl, now });
  assert.equal(none.ok, false);
});

test("offline place search", () => {
  const rows = parsePlaceIndex(fs.readFileSync("assets/routing/ri_places.ypl", "utf8"), { region: "ri" });
  assert.ok(rows.length > 1000);
  const top = searchPlaces(rows, "Newport")[0];
  assert.equal(top.name, "Newport");
  assert.ok(["city", "town"].includes(top.kind));
  const hinted = searchPlaces(rows, "Providence, Rhode Island")[0];
  assert.equal(hinted.name, "Providence");
  assert.deepEqual(parseSearch("12 Main St, Bangor, ME"), { house: "12", words: ["main", "street"], town: ["bangor"], state: "me" });
  assert.equal(parseSearch("Hartford, CT").state, "ct");
  assert.equal(parseSearch("bangor maine").state, "me");
  assert.deepEqual(nearestKinds("nearest hospital"), ["hospital", "clinic"]);
  assert.equal(nearestKinds("Newport"), null);
});

test("route service: search + offline route, online failure falls back offline", async () => {
  const loadAsset = async (id, kind) => {
    const file = (kind === "graph" ? `assets/routing/${id}.yrg` : `assets/routing/${id}_places.ypl`);
    if (!fs.existsSync(file)) return null;
    return kind === "graph" ? new Uint8Array(fs.readFileSync(file)) : fs.readFileSync(file, "utf8");
  };
  _resetGeocoder();
  _resetRouteClock();
  const svc = createRouteService({ loadAsset, fetchImpl: async () => { throw new Error("no signal"); } });
  const here = { latitude: 41.824, longitude: -71.4128 };
  assert.ok(regionsAt(here).some((r) => r.id === "ri"));
  const found = await svc.search("Newport", { near: here, online: true });
  assert.ok(found.results.length);
  assert.ok(found.notes.some((n) => /offline/i.test(n)));
  const dest = found.results.find((r) => r.name === "Newport");
  const res = await svc.route(here, dest, { online: true, profile: "drive" });
  assert.ok(res.ok, res.reason);
  assert.equal(res.route.source, "offline");
  assert.ok(res.notes.some((n) => /offline road data/i.test(n)));
  const hospital = await svc.search("nearest hospital", { near: here });
  assert.ok(hospital.results.length && hospital.results[0].kind === "hospital");
  const street = await svc.search("Thayer Street Providence", { near: here });
  assert.ok(street.results.some((r) => r.kind === "street" && /Thayer Street/.test(r.name)), JSON.stringify(street.results.slice(0, 3)));
  const far = await svc.route(here, { latitude: 44.8, longitude: -68.78 }, { online: false });
  assert.equal(far.ok, false);
  assert.match(far.reason, /state line|outside/);
  assert.match(ROAD_NOTE, /obey all signs/);
  assert.match(ROAD_NOTE, /No traffic data/);
});

test("route regions cover the map-pack states", () => {
  const ids = ROUTE_REGIONS.map((r) => r.id).sort();
  assert.deepEqual(ids, ["co", "ct", "id", "ma", "me", "mi", "mn", "mt", "nh", "ny", "pa", "ri", "vt", "wi", "wy"]);
  for (const r of ROUTE_REGIONS) assert.ok(fs.existsSync(`assets/routing/${r.id}.yrg`) && fs.existsSync(`assets/routing/${r.id}_places.ypl`), r.id);
});

test("Ask route intents", () => {
  const yes = {
    "directions to Bangor, Maine": ["route", "Bangor, Maine", "drive"],
    "route to Moosehead Lake": ["route", "Moosehead Lake", "drive"],
    "how far to Augusta?": ["distance", "Augusta", "drive"],
    "how far is it to Millinocket": ["distance", "Millinocket", "drive"],
    "take me to Baxter State Park": ["route", "Baxter State Park", "drive"],
    "walking directions to Main Street": ["route", "Main Street", "walk"],
    "navigate to 12 Main St, Bangor": ["route", "12 Main St, Bangor", "drive"],
    "How do I get to Portland": ["route", "Portland", "drive"]
  };
  for (const [q, [kind, destination, profile]] of Object.entries(yes)) {
    assert.deepEqual(routeIntent(q), { kind, destination, profile }, q);
  }
  for (const q of ["how far away is lightning", "how far can a deer smell", "directions to make a fire", "directions to purify water", "take me home", "what is deer scat", "how far is the last waypoint"]) {
    assert.equal(routeIntent(q), null, q);
  }
});

test("no eval, dev or paraphrase question is taken as a route request", () => {
  const prompts = [
    ...buildQuestions().map((q) => q.prompt),
    ...DEV_SET.map((q) => q.prompt || q.question || q.q || ""),
    ...PARAPHRASE_SET.map((q) => q.prompt || q.question || q.q || q.text || "")
  ].filter(Boolean);
  assert.ok(prompts.length > 400);
  const hits = prompts.filter((p) => routeIntent(p));
  assert.deepEqual(hits, []);
});
