import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ask } from "./symbolic/ask.js";
import { askField } from "./symbolic/phone_field.js";
import {
  courseText,
  declinationText,
  gotoSessionWaypoint,
  saveSessionWaypoint,
  sunText,
  trackText
} from "./symbolic/phone_land.js";
import { meshScreenStatus } from "./symbolic/phone_mesh.js";
import {
  holdTypedFix,
  initialPosition,
  noteSatelliteUnavailable,
  setConsent,
  shareAttempt,
  unlockPosition
} from "./symbolic/phone_position.js";

const passages = JSON.parse(fs.readFileSync("symbolic_memory/books_index.json", "utf8")).passages;

test("the phone shell greets as Yehsa", () => {
  const appJs = fs.readFileSync("App.js", "utf8");
  const appTsx = fs.readFileSync("App.tsx", "utf8");
  const home = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  const manifest = JSON.parse(fs.readFileSync("app.json", "utf8"));
  assert.match(appJs, /YehsaApp/);
  assert.match(appTsx, /YehsaApp/);
  assert.doesNotMatch(appJs, /Axionet is running|Open up App\.js/);
  assert.doesNotMatch(appTsx, /Axionet is running|Open up App\.js/);
  assert.match(home, /Yehsa/);
  assert.doesNotMatch(home, /Axionet|Axi0net/);
  assert.equal(manifest.expo.name, "Yehsa");
  assert.equal(manifest.expo.slug, "axionet");
  const dictionary = fs.readFileSync("symbolic/symbolic_dictionary.js", "utf8");
  assert.doesNotMatch(dictionary, /phone_field|phone_land|landscape_nav|recallKnowledge/);
});

test("field ask follows the reasoner for notes and a typed course", () => {
  const willow = "What can willow bark be used for in a survival setting?";
  const phoneWillow = askField(willow, passages);
  const cliWillow = ask(willow);
  assert.equal(phoneWillow.answered, true);
  assert.equal(phoneWillow.text, cliWillow.text);
  assert.equal(phoneWillow.cue, null);
  assert.doesNotMatch(phoneWillow.text, /\{|\|/);

  const bite = "How do I treat a mosquito bite with plants?";
  const phoneBite = askField(bite, passages);
  assert.equal(phoneBite.text, ask(bite).text);
  assert.match(phoneBite.text, /plantain|Plantago/);

  const course = "What is the distance and bearing from 0,0 to 0,1?";
  const phoneCourse = askField(course, passages);
  assert.equal(phoneCourse.text, ask(course).text);
  assert.match(phoneCourse.text, /111\.19 km/);
  assert.match(phoneCourse.text, /not a city map/i);
});

test("a feeling is a cue and does not block the note", () => {
  const result = askField("I am scared, how do I carry drinking water?", passages);
  assert.equal(result.answered, true);
  assert.match(result.text.toLowerCase(), /water/);
  assert.match(result.cue, /fear/);
  assert.doesNotMatch(result.text, /Wording cue/);
  assert.equal(result.emotion.understood, true);
  const blank = askField("   ", passages);
  assert.equal(blank.empty, true);
  assert.equal(blank.text, null);
  const miss = askField("qqqq zzzzz ploverish", passages);
  assert.equal(miss.answered, false);
  assert.match(miss.miss, /No offline note/);
});

test("from here stays opt-in on the phone session", () => {
  const raw = "How far from here to 0,1?";
  const allowed = askField(raw, passages, {
    session: { consent: true, fix: { latitude: 44.7128, longitude: -69.0123 }, waypoints: [] }
  });
  assert.match(allowed.text, /consented position lock/);
  assert.match(allowed.text, /km/);
  assert.equal(allowed.text.includes("44.7128"), false);

  const noConsent = askField(raw, passages, {
    session: { consent: false, fix: { latitude: 44.7128, longitude: -69.0123 }, waypoints: [] }
  });
  assert.match(noConsent.text, /opt-in/i);
  assert.equal(noConsent.text.includes("44.7128"), false);
});

test("landscape screen math, waypoints, sun, and track stay local", () => {
  const course = courseText("0, 0", "0, 1");
  assert.equal(course.ok, true);
  assert.match(course.text, /111\.19 km/);
  assert.match(course.text, /90° \(E\)/);
  const bad = courseText("town", "0, 1");
  assert.equal(bad.ok, false);
  assert.doesNotMatch(bad.text, /city directory|street/i);

  const decl = declinationText("90", "12");
  assert.match(decl.text, /true 102°/);
  assert.match(decl.text, /map/);

  const closed = saveSessionWaypoint([], {
    consent: false,
    name: "camp",
    pointText: "45.1, -69.2"
  });
  assert.equal(closed.ok, false);
  assert.equal(closed.list.length, 0);
  assert.equal(closed.text.includes("45.1"), false);

  const saved = saveSessionWaypoint([], {
    consent: true,
    name: "Camp",
    pointText: "45.1, -69.2",
    altitudeText: "120"
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.list[0].name, "camp");
  const trip = gotoSessionWaypoint(saved.list, {
    consent: true,
    name: "camp",
    fromText: "45, -69"
  });
  assert.equal(trip.ok, true);
  assert.match(trip.text, /waypoint camp/);
  assert.match(trip.text, /not a city map/i);

  const sun = sunText("0, 0", "2026-03-20");
  assert.equal(sun.ok, true);
  assert.match(sun.text, /sunrise/i);
  assert.match(sun.text, /terrain/i);
  const summary = trackText([
    { latitude: 0, longitude: 0, time: "2026-01-01T00:00:00Z" },
    { latitude: 0, longitude: 1, time: "2026-01-01T01:00:00Z" }
  ]);
  assert.match(summary.text, /111\.19 km/);
  assert.match(summary.text, /60 minutes/);
});

test("position consent is explicit and share does not send", () => {
  const start = initialPosition();
  assert.equal(start.status, "unlocked");
  assert.equal(start.consent, false);
  const blocked = holdTypedFix(start, { latitude: 44.7128, longitude: -69.0123 });
  assert.equal(blocked.status, "unlocked");
  assert.equal(blocked.fix, null);
  assert.equal(JSON.stringify(blocked).includes("44.7128"), false);
  const noSat = noteSatelliteUnavailable(start);
  assert.equal(noSat.status, "unlocked");
  assert.match(noSat.note, /opt-in/);

  const consented = setConsent(start, true);
  assert.equal(consented.status, "unlocked");
  assert.equal(consented.fix, null);
  const degraded = noteSatelliteUnavailable(consented);
  assert.equal(degraded.status, "degraded");
  assert.equal(degraded.fix, null);
  assert.match(degraded.note, /termux-location/);

  const locked = holdTypedFix(consented, { latitude: 45.1, longitude: -69.2, altitude: 10 });
  assert.equal(locked.status, "locked");
  assert.equal(locked.source, "typed");
  assert.equal(locked.shared, false);
  const shared = shareAttempt(locked);
  assert.equal(shared.state.shared, false);
  assert.equal(shared.state.status, "locked");
  assert.match(shared.message, /Not sent/);
  assert.match(shared.message, /--consent --share/);

  const opened = unlockPosition(locked);
  assert.equal(opened.status, "unlocked");
  assert.equal(opened.fix, null);
  assert.equal(opened.consent, true);
  const cleared = setConsent(locked, false);
  assert.equal(cleared.consent, false);
  assert.equal(cleared.fix, null);
  assert.equal(JSON.stringify(cleared).includes("45.1"), false);
});

test("mesh status on the phone screen is degraded and read only", () => {
  const status = meshScreenStatus();
  assert.equal(status.readiness, "degraded");
  assert.match(status.headline, /degraded/i);
  assert.match(status.detail, /does not scan/);
  assert.match(JSON.stringify(status), /No cellular call/);
  assert.doesNotMatch(JSON.stringify(status), /ready to transmit|radio is up/i);
});
