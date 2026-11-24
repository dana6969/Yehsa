// Round 4 bug list (Lucky's P0 4-8, Jeff's camera domain gate, the one weather module).
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import meta from "./assets/camera_id/classes.json" with { type: "json" };
import raw from "./assets/camera_id/index.json" with { type: "json" };
import oranges from "./eval/camera_id/fixtures/shot9_oranges.json" with { type: "json" };
import cases from "./eval/camera_id/fixtures/round4_cases.json" with { type: "json" };
import tomato from "./eval/camera_id/fixtures/heldout_tomato_vine.json" with { type: "json" };
import camReport from "./eval/camera_id/report.json" with { type: "json" };
import { DOMAINS, SCENE_QUIET, decodeIndex, gateDecision, identify, normalize, sceneOf } from "./src/phone/camera_id_match.js";
import { selectedFirst } from "./symbolic/hunt/chip_order.js";
import { dedupeCredit } from "./symbolic/map_layers.js";
import { SECRET_KEYS, secureKeyFor } from "./symbolic/peer_secret_names.js";
import { EXTEND_MINUTES, VERIFY_FAIL_TEXT, emptyRoster, extendSession, partyNotices, startSession } from "./symbolic/hunt/party.js";
import { SENT_NOTE, agoText, answerWeather, fetchWeather, freshnessText, weatherIntent, weatherRecord } from "./symbolic/weather_service.js";
import { conditionsFor, hudCards, windFrom } from "./symbolic/hunt/conditions.js";

const HOUR = 3600000;
const NOW = Date.parse("2026-11-24T12:00:00-05:00");

// ---------- P0 4: state chips ----------

test("state chips: the selected state comes first, the rest keep their order", () => {
  const options = ["ME", "RI", "NH", "VT", "MA", "CT", "NY", "PA"].map((id) => ({ id, label: id }));
  assert.deepEqual(selectedFirst(options, "NY").map((o) => o.id), ["NY", "ME", "RI", "NH", "VT", "MA", "CT", "PA"]);
  assert.deepEqual(selectedFirst(options, "ME").map((o) => o.id), options.map((o) => o.id));
  assert.deepEqual(selectedFirst(options, "").map((o) => o.id), options.map((o) => o.id));
  const hud = fs.readFileSync("src/phone/HuntHud.js", "utf8");
  assert.match(hud, /<Chips scroll label="State"/);
  assert.match(fs.readFileSync("src/phone/hunt_ui.js", "utf8"), /flexWrap: "nowrap"/);
});

// ---------- P0 5: one credit, About this map ----------

test("map credit: the Elevation sentence and 'May be dated.' appear once", () => {
  const text = dedupeCredit("Elevation: AWS Terrain Tiles. May be dated. Water: OpenStreetMap contributors, ODbL 1.0. Elevation: AWS Terrain Tiles. May be dated.");
  assert.equal(text.match(/Elevation:/g).length, 1);
  assert.equal(text.match(/May be dated\./g).length, 1);
  assert.match(text, /OpenStreetMap/);
  for (const file of ["src/phone/OfflineMap.js", "src/phone/OfflineMap.native.js"]) assert.match(fs.readFileSync(file, "utf8"), /MapCredit/, file);
  assert.match(fs.readFileSync("src/phone/MapCredit.js", "utf8"), /About this map/);
});

// ---------- P0 6: one weather record ----------

function hourly(from, n, extra = {}) {
  return Array.from({ length: n }, (_, k) => ({ start: from + k * HOUR, end: from + (k + 1) * HOUR, tempF: 42 + k, windMph: 5, windFrom: "W", rainChance: 10, short: "Cloudy", ...extra }));
}
const saved = (savedAt, more = {}) => ({ v: 2, source: "nws", savedAt, place: "Waterville, ME", lat: 44.55, lon: -69.63, hourly: hourly(NOW - HOUR / 2, 24), daily: [], alerts: [], ...more });

test("weather record: saved forecast with its age; manual wind wins and the agreement is stated", () => {
  const hunt = { saved: saved(NOW - 12 * 60000), wind: {}, manual: {}, baro: null };
  const rec = weatherRecord(hunt, { now: NOW, hasSensor: false });
  assert.equal(rec.wind.source, "saved forecast");
  assert.equal(rec.wind.point, "W");
  assert.equal(rec.wind.tag, "Updated 12 min ago");
  assert.equal(rec.temp.f, 42);
  const manual = weatherRecord({ ...hunt, wind: { fromPoint: "W", speedClass: "light", enteredAt: NOW - 60000 } }, { now: NOW, hasSensor: false });
  assert.equal(manual.wind.source, "manual");
  assert.match(manual.wind.tag, /^You entered this · \d+:\d\d (AM|PM)$/);
  assert.equal(manual.windAgree, true);
  const conflict = weatherRecord({ ...hunt, wind: { fromPoint: "E", speedClass: "strong" } }, { now: NOW, hasSensor: false });
  assert.equal(conflict.wind.source, "manual");
  assert.equal(conflict.windAgree, false);
});

test("weather record: offline and old copies say so; the barometer is never a wind source", () => {
  assert.equal(freshnessText(saved(NOW - 3 * HOUR), NOW, { offline: true }), "Cached · no signal. Updated 3 h ago. This copy stays until you update it.");
  assert.match(freshnessText(saved(NOW - 8 * HOUR), NOW), /^Old copy\. Updated 8 h ago/);
  assert.equal(agoText(NOW - 30000, NOW), "just now");
  const baro = { readings: [{ t: NOW - 3 * HOUR, hpa: 1015 }, { t: NOW, hpa: 1010 }] };
  const rec = weatherRecord({ saved: null, wind: {}, manual: {}, baro }, { now: NOW });
  assert.equal(rec.wind.ok, false);
  assert.equal(rec.wind.source, "none");
});

test("Hunt HUD, the cone and Weather read the same record", () => {
  const hunt = { saved: saved(NOW - 12 * 60000), wind: {}, manual: {}, baro: null, legal: {} };
  const cond = conditionsFor(hunt, { now: NOW, hasSensor: false });
  assert.deepEqual(windFrom(hunt, NOW), cond.wind);
  assert.equal(cond.weather.wind.fromDeg, cond.wind.fromDeg);
  assert.ok(cond.cone, "the cone follows the saved wind");
  assert.equal(hudCards(cond).wind.sub, "Updated 12 min ago");
  // Old manual entries keep working (speed class without typed mph).
  const typed = windFrom({ wind: { fromPoint: "NW", speedClass: "moderate" }, manual: {} }, NOW);
  assert.equal(typed.mph, 11);
  assert.equal(typed.cls, "moderate");
});

test("Ask: 'What's the weather trend?' is a weather question, survival how-tos are not", () => {
  assert.ok(weatherIntent("What's the weather trend?"));
  assert.ok(weatherIntent("will it rain tomorrow"));
  assert.ok(weatherIntent("whats the weather"));
  assert.equal(weatherIntent("how do I stay warm in a storm"), null);
  assert.equal(weatherIntent("how to read the clouds"), null);
});

test("Ask leads with the saved record, its age and source, never a generic field note", () => {
  const rec = weatherRecord({ saved: saved(NOW - 12 * 60000), wind: {}, manual: {}, baro: null }, { now: NOW, hasSensor: false, offline: true });
  const r = answerWeather("What's the weather trend?", rec, { now: NOW, fetched: false });
  assert.equal(r.kind, "weather");
  assert.match(r.text, /42°F/);
  assert.match(r.text, /W 5 mph/i);
  assert.match(r.text, /12 min ago/);
  assert.match(r.source, /National Weather Service/);
  const none = answerWeather("what's the weather", weatherRecord({ saved: null, wind: {}, manual: {} }, { now: NOW, hasSensor: false }), { now: NOW });
  assert.match(none.text, /will not guess/);
});

test("Ask that updates the copy says what left the phone", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("/points/")) return { ok: true, json: async () => ({ properties: { forecastHourly: "https://api.weather.gov/h", forecast: "https://api.weather.gov/d", relativeLocation: { properties: { city: "Waterville", state: "ME" } } } }) };
    if (url.endsWith("/h")) return { ok: true, json: async () => ({ properties: { periods: [{ startTime: new Date(NOW - 1000).toISOString(), endTime: new Date(NOW + HOUR).toISOString(), temperature: 40, temperatureUnit: "F", windSpeed: "6 mph", windDirection: "SW", probabilityOfPrecipitation: { value: 20 }, shortForecast: "Cloudy" }] } }) };
    if (url.endsWith("/d")) return { ok: true, json: async () => ({ properties: { periods: [] } }) };
    return { ok: true, json: async () => ({ features: [] }) };
  };
  const got = await fetchWeather({ lat: 44.5512345, lon: -69.6312345, fetchImpl, now: NOW });
  assert.equal(got.ok, true);
  assert.equal(got.source, "nws");
  assert.ok(calls[0].includes("44.551,-69.631"), `rounded to about 100 m: ${calls[0]}`);
  const rec = weatherRecord({ saved: got.snapshot, wind: {}, manual: {} }, { now: NOW, hasSensor: false });
  const r = answerWeather("what's the weather", rec, { now: NOW, fetched: true });
  assert.ok(r.text.includes(SENT_NOTE));
  const down = await fetchWeather({ lat: 44.5, lon: -69.6, fetchImpl: async () => { throw new Error("offline"); }, now: NOW });
  assert.equal(down.ok, false);
  assert.equal(down.errors.length, 2);
});

// ---------- P0 7: Hunt party states ----------

test("party: key error, copied phone, ending soon, offline and no peers are separate notices", () => {
  const empty = emptyRoster();
  assert.deepEqual(partyNotices({ roster: empty, keyState: "ready", now: NOW }), []);
  const err = partyNotices({ roster: empty, keyState: "error", now: NOW });
  assert.equal(err.length, 1);
  assert.equal(err[0].id, "key-error");
  assert.equal(err[0].action, "retry");
  assert.equal(partyNotices({ roster: empty, keyState: "foreign", now: NOW })[0].action, "replace");
  const roster = { ...empty, members: [{ id: "a", name: "Sam", verified: true }], session: { startedAt: NOW - 55 * 60000, endsAt: NOW + 5 * 60000, members: ["a"], stopped: false } };
  const ids = partyNotices({ roster, keyState: "ready", linkUp: false, now: NOW }).map((n) => n.id);
  assert.deepEqual(ids, ["ending", "offline"]);
  const noPeers = partyNotices({ roster, keyState: "ready", linkUp: true, peersNearby: 0, now: NOW }).map((n) => n.id);
  assert.deepEqual(noPeers, ["ending", "no-peers"]);
  assert.match(partyNotices({ roster, now: NOW, linkUp: true })[0].title, /stops in 5 minutes/);
  assert.match(VERIFY_FAIL_TEXT, /did not match/);
});

test("party: Add 30 minutes never goes past the longest session", () => {
  const roster = { ...emptyRoster(), session: { startedAt: NOW - 30 * 60000, endsAt: NOW + 30 * 60000, members: [], stopped: false } };
  const r = extendSession(roster, EXTEND_MINUTES, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.roster.session.endsAt, NOW + 60 * 60000);
  assert.equal(extendSession(emptyRoster(), 30, NOW).ok, false);
});

test("party screen: the key error is its own card, not a loose line under the empty state", () => {
  const src = fs.readFileSync("src/phone/PartyScreen.js", "utf8");
  assert.doesNotMatch(src, /setProblem\("I couldn't open your key\."\)/);
  assert.match(src, /partyNotices\(/);
  assert.match(src, /no peers nearby/);
});

test("every secure-store slot the vault uses has a valid name", () => {
  for (const slot of ["identity", "historyKey", "authFlag", "bindToken"]) assert.match(secureKeyFor(slot), /^[A-Za-z0-9._-]+$/, slot);
  assert.equal(new Set(Object.values(SECRET_KEYS)).size, Object.keys(SECRET_KEYS).length);
  assert.throws(() => secureKeyFor("nope"), /No secure-store name/);
});

// ---------- P0 8 + Jeff's domain gate ----------

const index = decodeIndex(raw, meta);

test("domain gate: oranges land in food_household with no species, no toxicity", () => {
  const r = identify(index, normalize(Float32Array.from(oranges.embedding)));
  assert.equal(r.status, "unsure");
  assert.equal(r.scene, "food_household");
  assert.ok(DOMAINS.includes(r.scene));
  assert.equal(r.quiet.startsWith(SCENE_QUIET.food_household), true);
  assert.doesNotMatch(JSON.stringify({ t: r.title, x: r.text, q: r.quiet }), /Jack-o|Omphalotus|toxic|deadly|edible/i);
});

test("domain gate: people and pets, screens and food each get their own words; wild matches say wild", () => {
  assert.equal(sceneOf("ev_dog"), "person_pet");
  assert.equal(sceneOf("ev_hands_people"), "person_pet");
  assert.equal(sceneOf("ev_electronics"), "document_screen");
  assert.equal(sceneOf("ev_citrus"), "food_household");
  const seen = new Set();
  for (const item of cases.everyday) {
    const r = identify(index, normalize(Float32Array.from(item.embedding)));
    assert.equal(r.status, "unsure", item.id);
    assert.ok(DOMAINS.includes(r.scene), `${item.id}: ${r.scene}`);
    assert.notEqual(r.scene, "wild", item.id);
    seen.add(r.scene);
  }
  assert.ok(seen.has("food_household"), [...seen].join(","));
  for (const item of cases.lookalikes) {
    const r = identify(index, normalize(Float32Array.from(item.embedding)));
    if (r.status === "match") assert.equal(r.scene, "wild", item.id);
    else assert.ok(["unclear", "wild"].includes(r.scene) || r.domain !== "everyday", item.id);
  }
});

// ---------- Round 4b: the one everyday photo still answered as a toxic species ----------

test("regression: tomatoes on the vine (held out) are never answered as bittersweet nightshade", () => {
  const th = index.thresholds;
  assert.ok(th.toxicEverydayCap > 0 && th.toxicEverydayCap < 0.2, JSON.stringify(th));
  // The held-out head's numbers for that photo: it cleared the toxic bar (0.667 >= 0.55) but carried
  // 0.223 everyday mass. The cap declines it.
  const held = tomato.heldout;
  const before = gateDecision({ top: { id: held.top, score: held.topScore }, everyday: held.everyday, other: held.other, meta: meta[held.top], thresholds: { ...th, toxicEverydayCap: 1 } });
  assert.equal(before.answer, true, "without the cap this photo was answered");
  const after = gateDecision({ top: { id: held.top, score: held.topScore }, everyday: held.everyday, other: held.other, meta: meta[held.top], thresholds: th });
  assert.deepEqual(after, { answer: false, why: "toxic-everyday" });
  // The same everyday mass on a non-toxic class is not capped (the cap is only for toxic or deadly).
  assert.equal(gateDecision({ top: { id: "yarrow", score: 0.667 }, everyday: 0.223, other: 0.014, meta: meta.yarrow, thresholds: th }).answer, true);
  // The shipped head on the photo itself: no toxic or deadly species.
  const r = identify(index, normalize(Float32Array.from(tomato.embedding)));
  if (r.status === "match") assert.ok(!["toxic", "deadly"].includes(meta[r.suggestions[0].id].use), r.suggestions[0].id);
  assert.doesNotMatch([r.title, r.text, r.quiet || "", r.deadlyLine || ""].join(" "), /nightshade|Solanum/i);
});

test("camera eval: no held-out everyday photo is answered as toxic, wild numbers unchanged", () => {
  const h = camReport.heldout;
  assert.equal(h.everyday_called_toxic, 0);
  assert.deepEqual(h.everyday_called_toxic_photos, []);
  assert.ok(h.everyday_declined >= 0.995);
  assert.ok(h.answered_pos >= 0.66 && h.top1_answered >= 0.91 && h.top3_answered >= 0.97, JSON.stringify(h));
  assert.ok(h.deadly_photos_with_deadly_top3 >= 0.96);
});
