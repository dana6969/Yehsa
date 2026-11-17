import assert from "node:assert/strict";
import test from "node:test";
import { LOG_EVERY_MS, addReading, ageText, bandFor, emptyLog, markElevationChange, trendOf, PAUSED_TEXT } from "./symbolic/hunt/baro.js";
import { alertsUrl, describeSaved, makeSaved, parseAlerts, parseHourly, NWS_HEADERS } from "./symbolic/hunt/nws.js";
import { FOOTER, PRESETS, checkInputs, solve } from "./symbolic/hunt/ballistics.js";
import { legalLight } from "./symbolic/hunt/legal_light.js";
import { estimateDeer } from "./symbolic/hunt/deer_estimate.js";
import { addEntry, emptyLog as emptySightings, howDidItDo, newEntry, pins, sharablePin } from "./symbolic/hunt/sightings.js";
import { bestStands, classFor, scentCone } from "./symbolic/hunt/scent.js";
import { addItem, emptyKit, emptyFamily, expiryNote, familyCardText, parseExpiry, pretripFrom, resetList, setFamilyField, toggleItem } from "./symbolic/hunt/kit.js";

const H = 3600000;

function steadyLog(delta, startT = Date.UTC(2026, 10, 17, 12)) {
  let log = emptyLog();
  const readings = 13;
  for (let i = 0; i < readings; i += 1) {
    log = addReading(log, { t: startT + i * LOG_EVERY_MS, hpa: 1013 + (delta * i) / (readings - 1) });
  }
  return { log, now: startT + (readings - 1) * LOG_EVERY_MS };
}

test("barometer bands follow the 3 hour tendency edges", () => {
  assert.equal(bandFor(0.05), "steady");
  assert.equal(bandFor(1.5), "slowly");
  assert.equal(bandFor(3.5), "plain");
  assert.equal(bandFor(6.0), "quickly");
  assert.equal(bandFor(6.1), "very-rapidly");
});

test("a falling trend says so, and a rising one does too", () => {
  const fall = steadyLog(-4);
  const trend = trendOf(fall.log, fall.now);
  assert.equal(trend.state, "trend");
  assert.match(trend.label, /fall/i);
  const rise = steadyLog(+4);
  assert.match(trendOf(rise.log, rise.now).label, /ris/i);
  const flat = steadyLog(0);
  assert.match(trendOf(flat.log, flat.now).label, /steady/i);
});

test("no trend is claimed before three hours of readings", () => {
  let log = addReading(emptyLog(), { t: 1_000_000_000_000, hpa: 1012 });
  const trend = trendOf(log, 1_000_000_000_000 + 10 * 60000);
  assert.equal(trend.state, "collecting");
});

test("changing elevation pauses the trend until fresh readings exist", () => {
  const { log, now } = steadyLog(-6);
  const paused = trendOf(markElevationChange(log, now), now);
  assert.equal(paused.state, "paused");
  assert.equal(paused.text, PAUSED_TEXT);
  let jumped = emptyLog();
  jumped = addReading(jumped, { t: now, hpa: 1010, altitudeM: 100 });
  jumped = addReading(jumped, { t: now + LOG_EVERY_MS, hpa: 1005, altitudeM: 140 });
  assert.ok(jumped.elevationChangedAt);
});

test("no sensor is said plainly", () => {
  assert.equal(trendOf(emptyLog(), Date.now(), { hasSensor: false }).state, "no-sensor");
  assert.match(ageText(Date.now() - 6 * H, Date.now()), /6 h/);
});

test("saved NWS alerts parse, show their age, and grey out when expired", () => {
  assert.equal(NWS_HEADERS["User-Agent"].length > 5, true);
  assert.match(alertsUrl(44.8, -68.8), /api\.weather\.gov\/alerts\/active\?point=/);
  const now = Date.UTC(2026, 10, 17, 18);
  const alerts = parseAlerts({ features: [
    { properties: { id: "a1", event: "Frost Advisory", headline: "Frost Advisory until 9 AM", ends: new Date(now - H).toISOString() } },
    { properties: { id: "a2", event: "Wind Advisory", headline: "Wind Advisory", ends: new Date(now + 5 * H).toISOString() } }
  ] });
  const hourly = parseHourly({ properties: { periods: [{ startTime: new Date(now - H).toISOString(), endTime: new Date(now + H).toISOString(), temperature: 34, temperatureUnit: "F", windSpeed: "5 to 10 mph", windDirection: "NW", probabilityOfPrecipitation: { value: 20 }, shortForecast: "Clear" }] } });
  assert.equal(hourly[0].windMph, 8);
  const described = describeSaved(makeSaved({ alerts, hourly, savedAt: now - 6 * H, place: "Bangor, ME" }), now);
  assert.match(described.age, /6 h/);
  assert.equal(described.alerts.find((a) => a.id === "a1").expired, true);
  assert.equal(described.alerts.find((a) => a.id === "a2").expired, false);
  assert.equal(described.forecast.tempF, 34);
  assert.equal(describeSaved(null).has, false);
});

test("ballistics: sane drop, wind drift that grows with range, presets present, honest footer", () => {
  assert.ok(PRESETS.length >= 10);
  const result = solve({ grains: 150, bc: 0.415, fps: 2820, sightIn: 1.5, zeroYd: 100, windMph: 10, windClock: 3 });
  assert.equal(result.ok, true);
  const at = (yd) => result.rows.find((row) => row.yd === yd);
  assert.ok(Math.abs(at(100).dropIn) < 0.3, "zeroed at 100");
  assert.ok(at(300).dropIn < at(200).dropIn && at(200).dropIn < at(100).dropIn + 0.01);
  assert.ok(at(300).dropIn < -10 && at(300).dropIn > -30, `300 yd drop ${at(300).dropIn}`);
  assert.ok(at(300).driftIn > at(200).driftIn && at(200).driftIn > at(100).driftIn);
  assert.equal(at(300).driftSide, "left", "wind from 3 o'clock pushes the bullet left");
  assert.ok(at(300).fps < at(100).fps);
  assert.equal(result.footer, FOOTER);
  assert.equal(checkInputs({ grains: 2, bc: 0.4, fps: 2800 }).ok, false);
  assert.equal(solve({ grains: 2 }).ok, false);
});

test("legal light matches Maine's official chart for deer", () => {
  const maine = (m, d, y = 2026) => legalLight({ state: "ME", species: "deer", date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, offsetMinutes: -300 });
  const near = (text, expected) => {
    const parse = (t) => { const m = /(\d+):(\d+)\s*(AM|PM)/i.exec(t); return (Number(m[1]) % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]); };
    assert.ok(Math.abs(parse(text) - parse(expected)) <= 2, `${text} vs ${expected}`);
  };
  // Official chart is in daylight time before Nov 1 (UTC-4) and standard after.
  const nov17 = maine(11, 17);
  assert.equal(nov17.verified, true);
  near(nov17.opensText, "6:05 AM");
  near(nov17.closesText, "4:35 PM");
  assert.match(nov17.source.url, /maine\.gov/);
  const nov23 = maine(11, 23);
  near(nov23.opensText, "6:13 AM");
  near(nov23.closesText, "4:30 PM");
  const summer = (m, d) => legalLight({ state: "ME", species: "deer", date: `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, offsetMinutes: -240 });
  near(summer(10, 1).opensText, "6:03 AM");
  near(summer(10, 1).closesText, "6:46 PM");
  near(summer(9, 1).opensText, "5:27 AM");
  near(summer(9, 1).closesText, "7:42 PM");
  const sunday = maine(11, 22);
  assert.equal(sunday.status, "no-hunting-today");
  assert.equal(sunday.summary, "No hunting today");
});

test("an unverified state shows the common rule with a warning, never a made-up rule", () => {
  const ri = legalLight({ state: "RI", species: "deer", date: "2026-11-17", offsetMinutes: -300 });
  assert.equal(ri.verified, false);
  assert.match(ri.label, /Common rule, check your state regulations/);
  assert.ok(ri.warning.length > 20);
  assert.equal(legalLight({ date: "2026-11-17" }).ok, false);
});

test("deer estimate: moon has zero weight, every factor has a reason, missing inputs are left out, and it is labelled an estimate", () => {
  const base = { lat: 44.8, lon: -68.8, date: "2026-11-08", nowMinutes: 6 * 60 + 40, offsetMinutes: -300, temp: { f: 38, source: "manual" }, pressure: { band: "plain", delta: -3, source: "live" } };
  const a = estimateDeer({ ...base });
  assert.match(a.text, /Estimate, not a guarantee/);
  assert.equal(a.moon.weight, 0);
  for (const factor of a.factors) assert.ok(factor.reason.length > 10, factor.id);
  const terrain = a.factors.find((f) => f.id === "terrain");
  assert.equal(terrain.source, "not used");
  // The same inputs on a day with a different moon give the same total unless the season differs.
  const sameSeason = estimateDeer({ ...base, date: "2026-11-09" });
  assert.equal(sameSeason.total, a.total);
  const bare = estimateDeer({ date: base.date });
  assert.ok(bare.used < a.used);
  const withTerrain = estimateDeer({ ...base, terrain: { reliable: true, feature: "saddle" } });
  assert.equal(withTerrain.factors.find((f) => f.id === "terrain").weight, 1);
  const unreliable = estimateDeer({ ...base, terrain: { reliable: false, feature: "saddle" } });
  assert.equal(unreliable.factors.find((f) => f.id === "terrain").weight, 0);
});

test("sightings: zero counts are kept, no spot unless given, one pin can be shared by hand", () => {
  let log = emptySightings();
  log = addEntry(log, newEntry({ species: "Deer", count: 0, estimate: { level: "Low", total: 0 } }, 1000));
  log = addEntry(log, newEntry({ species: "Deer", count: 3, spot: { latitude: 44.8, longitude: -68.8 }, estimate: { level: "High", total: 6 } }, 2000));
  assert.equal(log.entries.find((e) => e.t === 1000).count, 0);
  assert.equal(log.entries.find((e) => e.t === 1000).spot, null);
  assert.equal(pins(log).length, 1);
  assert.equal(sharablePin(log.entries.find((e) => e.t === 1000)), null);
  assert.equal(sharablePin(pins(log)[0]).label, "3 deer");
  assert.match(howDidItDo(log).text, /Five or more entries/);
});

test("scent cone points downwind, widens only when light and swirling, and picks stands by what it would blow on", () => {
  const north = scentCone({ fromDeg: 0, mph: 8 });
  assert.equal(north.downwindDeg, 180);
  assert.equal(north.widthDeg, 30);
  assert.equal(scentCone({ fromDeg: 0, mph: 2, swirling: true }).widthDeg, 60);
  assert.equal(scentCone({ fromDeg: 0, mph: 2, swirling: false }).widthDeg, 30);
  assert.equal(scentCone({}).ok, false);
  assert.ok(classFor(1).id !== classFor(20).id);
  const stands = [{ name: "Ridge", latitude: 44.8, longitude: -68.8 }, { name: "Creek", latitude: 44.8, longitude: -68.79 }];
  const avoid = [{ name: "Bedding", kind: "bedding", latitude: 44.7985, longitude: -68.8 }];
  const ranked = bestStands(stands, avoid, north);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].good, true);
  assert.equal(ranked.some((s) => s.good === false), true);
});

test("kit: lists progress, expiry reads in plain words, reset starts over, pre-trip pulls from the list", () => {
  let kit = emptyKit();
  const id = kit.lists[0].id;
  kit = toggleItem(kit, id, kit.lists[0].items[0].id, 5);
  assert.equal(kit.lists[0].items[0].done, true);
  assert.equal(kit.lists[0].checkedAt, 5);
  const now = Date.UTC(2026, 10, 17);
  kit = addItem(kit, id, "Epinephrine pen", "2026-12-01");
  const item = kit.lists[0].items.find((i) => i.label === "Epinephrine pen");
  assert.equal(expiryNote(item, now).soon, true);
  assert.match(expiryNote({ expires: "2026-11-01" }, now).text, /Expired/);
  assert.equal(parseExpiry("2026-02-31"), null);
  assert.ok(pretripFrom(kit, id).missing.length > 0);
  assert.equal(resetList(kit, id).lists[0].items.some((i) => i.done), false);
});

test("family card: only what was filled in is shown, and it stays text", () => {
  let card = emptyFamily();
  assert.equal(familyCardText(card), "");
  card = setFamilyField(card, "allergies", "Penicillin");
  assert.match(familyCardText(card), /Penicillin/);
  assert.equal(setFamilyField(card, "not_a_field", "x"), card);
});
