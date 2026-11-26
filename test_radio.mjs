import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NOAA_CHANNELS, setRadioData, nearestWeatherRadio, loadNwr, loadPep, sameCodes, emergencyStations, stateCode, stateName, guessState, channelFor, receptionNote, bandOf, weatherRadioInState } from "./src/phone/radio_data.js";
import { buildSearchPath, normalizeStation, searchStations, openFavorites, toggleFavorite } from "./src/phone/internet_radio.js";

setRadioData({
  nwr: JSON.parse(fs.readFileSync(new URL("./assets/radio/nwr_stations.json", import.meta.url), "utf8")),
  pep: JSON.parse(fs.readFileSync(new URL("./assets/radio/pep_stations.json", import.meta.url), "utf8"))
});

test("the seven NOAA channels are the published frequencies", () => {
  assert.deepEqual(NOAA_CHANNELS.map((c) => c.mhz).sort(), [162.4, 162.425, 162.45, 162.475, 162.5, 162.525, 162.55]);
  assert.equal(channelFor(162.55).wx, 1);
  assert.equal(channelFor(162.4).wx, 2);
  assert.equal(channelFor(162.3), null);
});

test("every listed transmitter uses one of the seven channels and has a position", () => {
  const { stations } = loadNwr();
  assert.ok(stations.length > 1000);
  for (const s of stations) {
    assert.ok(channelFor(s.mhz), `${s.callsign} ${s.mhz}`);
    assert.ok(Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
    assert.ok(s.counties.length > 0 || s.state);
  }
});

test("Providence is served by WXJ39 on 162.400", () => {
  const near = nearestWeatherRadio(41.82, -71.41, { limit: 3 });
  assert.equal(near[0].callsign, "WXJ39");
  assert.equal(near[0].mhz, 162.4);
  assert.ok(near[0].km < 15);
  assert.equal(guessState(41.82, -71.41), "RI");
  assert.equal(weatherRadioInState("RI").length, 1);
});

test("SAME codes for a Rhode Island county", () => {
  const providence = sameCodes("RI", "providence");
  assert.equal(providence.length, 1);
  assert.deepEqual(providence[0].codes, ["044007"]);
  assert.ok(sameCodes("RI").length >= 5);
  assert.deepEqual(sameCodes("RI", "nowhere"), []);
});

test("emergency stations: Rhode Island is covered by Boston's WBZ", () => {
  const ri = emergencyStations("RI");
  assert.ok(ri.some((s) => s.callsign === "WBZ" && s.freq === "1030 AM"));
  const ct = emergencyStations("CT");
  assert.ok(ct.some((s) => s.callsign === "WTIC" && s.freq === "1080 AM"));
  assert.ok(emergencyStations("ME").some((s) => s.callsign === "WGAN"));
  assert.equal(loadPep().stations.length, 73);
  assert.equal(bandOf("97.1 FM"), "FM");
  assert.equal(bandOf("1030 AM"), "AM");
});

test("state names and codes", () => {
  assert.equal(stateCode("ri"), "RI");
  assert.equal(stateCode("Rhode Island"), "RI");
  assert.equal(stateCode("narnia"), "");
  assert.equal(stateName("RI"), "Rhode Island");
  assert.match(receptionNote(10), /Likely/);
  assert.match(receptionNote(200), /too far/);
});

test("internet radio search builds a safe query and normalizes stations", async () => {
  const path = buildSearchPath({ name: "news", state: "Rhode Island" });
  assert.match(path, /^\/json\/stations\/search\?/);
  assert.match(path, /hidebroken=true/);
  assert.match(path, /state=Rhode\+Island/);
  assert.equal(normalizeStation({ name: "x", url_resolved: "ftp://bad" }), null);
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.startsWith("https://down")) throw new Error("offline");
    return { ok: true, json: async () => [{ stationuuid: "a", name: "WXYZ  News", url_resolved: "https://s.example/live", codec: "mp3", bitrate: 64, state: "Rhode Island", tags: "news,talk" }, { stationuuid: "b", name: "wxyz news", url_resolved: "https://s.example/dup" }, { name: "bad", url_resolved: "" }] };
  };
  const list = await searchStations({ name: "news" }, { fetchImpl: fake, mirrors: ["https://down.example", "https://up.example"] });
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "WXYZ News");
  assert.equal(calls.length, 2);
  await assert.rejects(() => searchStations({}, { fetchImpl: async () => { throw new Error("offline"); }, mirrors: ["https://a.example"] }), /Could not reach the radio directory/);
});

test("favorites keep a station once and survive bad storage", () => {
  const s = normalizeStation({ stationuuid: "a", name: "A", url_resolved: "https://a.example/s" });
  let list = toggleFavorite([], s);
  assert.equal(list.length, 1);
  assert.equal(toggleFavorite(list, s).length, 0);
  assert.equal(openFavorites("not json").length, 0);
  assert.equal(openFavorites(JSON.stringify(list)).length, 1);
});
