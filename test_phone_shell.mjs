import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createHash } from "node:crypto";
import { ask } from "./symbolic/ask.js";
import { askField } from "./symbolic/phone_field.js";
import { lookupPhoneMedical, phoneCorpusMeta, phoneLexical, phoneMedicalSize } from "./symbolic/phone_corpus.js";
import { lookupMedical } from "./symbolic/knowledge_index.js";
import { EXPO_LOCK_ACCURACY_M, pickAccurateSample } from "./symbolic/position_fix.js";
import { chooseRadioRoute } from "./symbolic/radio_adapter.js";
import { meshScreenStatus } from "./symbolic/phone_mesh.js";
import { evaluateOwner, sha256Hex } from "./symbolic/owner_bind.js";
import { applySatelliteReading, chooseLocationRoute } from "./symbolic/position_adapter.js";
import { bindThisInstall, memoryStore } from "./src/phone/install_owner.js";
import {
  courseText,
  declinationText,
  gotoSessionWaypoint,
  saveSessionWaypoint,
  sunText,
  trackText
} from "./symbolic/phone_land.js";
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
  assert.match(home, /phoneCorpusMeta/);
  assert.match(home, /Scan for Yehsa peers/);
  assert.match(home, /readPlatformFix/);
  assert.doesNotMatch(home, /does not start a scan|The large dictionary is not loaded/);
  const positionStart = home.indexOf("function PositionPane");
  const meshStart = home.indexOf("function MeshPane");
  const positionBody = home.slice(positionStart, meshStart);
  assert.doesNotMatch(positionBody, /useEffect/);
  assert.match(positionBody, /consent !== true/);
  assert.match(home, /function changeConsent\(value\) \{\n    const next = setConsent\(position, value\);/);
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
  const light = askField("What is light?", passages);
  assert.equal(light.answered, false);
  assert.match(light.miss, /scripture index/);
  assert.equal(light.text, null);
  const meters = askField("How many meters are in 2 kilometers?", passages);
  assert.match(meters.text, /2000/);
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

test("mesh status before a scan is degraded and does not invent a radio", () => {
  const status = meshScreenStatus();
  assert.equal(status.readiness, "degraded");
  assert.match(status.headline, /not been run/i);
  assert.match(JSON.stringify(status), /No cellular call/);
  assert.match(JSON.stringify(status), /without a position lock/i);
  assert.doesNotMatch(JSON.stringify(status), /ready to transmit|radio is up|encrypted/i);
});

test("the packaged dictionary matches ask and the full corpora stay", () => {
  assert.equal(phoneCorpusMeta.scope, "ask-merge");
  assert.equal(phoneCorpusMeta.websterBundled, true);
  assert.equal(phoneCorpusMeta.fullCorporaRemain, true);
  assert.equal(phoneCorpusMeta.fieldNotesComplete, true);
  assert.ok(phoneCorpusMeta.headwords >= 100000);
  assert.ok(phoneCorpusMeta.medicalNames >= 170000);
  assert.equal(phoneLexical().size, phoneCorpusMeta.headwords);
  assert.equal(phoneMedicalSize(), phoneCorpusMeta.medicalNames);
  assert.ok(phoneLexical().has("willow"));
  assert.ok(phoneLexical().has("salicin"));
  assert.ok(phoneLexical().has("tourniquet"));
  assert.ok(phoneLexical().has("frostbite"));
  assert.ok(phoneLexical().has("yarrow"));
  assert.ok(fs.statSync("symbolic_memory/webster_raw.json").size > 1000000);
  assert.ok(fs.statSync("symbolic_memory/full_dictionary.json").size > 1000000);
  assert.ok(fs.statSync("symbolic_memory/dictionary_memory.json").size > 1000000);
  assert.ok(fs.statSync("symbolic_memory/medical_terms_only.txt").size > 100000);
  assert.ok(fs.statSync("codesante_en.txt").size > 1000000);
  assert.ok(fs.statSync("glutanimate.txt").size > 100000);
  for (const term of ["tourniquet", "iodine", "willow", "water"]) {
    assert.deepEqual(lookupPhoneMedical(term), lookupMedical(term), term);
  }
  assert.equal(lookupPhoneMedical("not-a-real-term-zzqq"), null);
  const questions = [
    "What is polarity?",
    "What is a tourniquet?",
    "What is frostbite?",
    "What is dehydration?",
    "What is yarrow?",
    "What is charcoal?",
    "What is a splint?",
    "What is iodine?"
  ];
  for (const raw of questions) {
    const phone = askField(raw, passages);
    const cli = ask(raw);
    assert.equal(phone.answered, cli.answered, raw);
    assert.equal(phone.text, cli.text, raw);
  }
  assert.match(phoneCorpusMeta.honest, /Webster/);
  assert.match(phoneCorpusMeta.honest, /stay on disk/);
  assert.match(phoneCorpusMeta.fieldNoteHonest, /full field notes/);
});

test("satellite lock follows the provider and never locks without consent", () => {
  assert.equal(chooseLocationRoute({ termuxAvailable: true, expoAvailable: true }), "termux-location");
  assert.equal(chooseLocationRoute({ expoAvailable: true }), "expo-location");
  assert.equal(chooseLocationRoute({}), "none");

  const start = initialPosition();
  const blocked = applySatelliteReading(start, {
    route: "expo-location",
    fix: { latitude: 44.7128, longitude: -69.0123, accuracy: 5 }
  });
  assert.equal(blocked.status, "unlocked");
  assert.equal(blocked.fix, null);
  assert.match(blocked.note, /opt-in/);

  const consented = setConsent(start, true);
  const expoFix = applySatelliteReading(consented, {
    route: "expo-location",
    fix: { latitude: 45.1, longitude: -69.2, accuracy: 8, altitude: 12 }
  });
  assert.equal(expoFix.status, "locked");
  assert.equal(expoFix.source, "expo-location");
  assert.equal(expoFix.shared, false);
  assert.equal(expoFix.fix.altitude, 12);

  const gnss = applySatelliteReading(consented, {
    route: "termux-location",
    stdout: JSON.stringify({ latitude: 10, longitude: 20, accuracy: 4, provider: "gps" })
  });
  assert.equal(gnss.status, "locked");
  assert.equal(gnss.source, "gnss");
  assert.equal(gnss.shared, false);

  const network = applySatelliteReading(consented, {
    route: "termux-location",
    stdout: JSON.stringify({ latitude: 10, longitude: 20, accuracy: 4, provider: "network" })
  });
  assert.equal(network.status, "degraded");
  assert.equal(network.fix, null);
  assert.match(network.note, /network|GPS/i);

  const missing = applySatelliteReading(consented, { route: "none" });
  assert.equal(missing.status, "degraded");
  assert.equal(missing.fix, null);

  const kept = applySatelliteReading(expoFix, {
    route: "expo-location",
    reason: "Expo Location did not return a fix. Nothing was stored."
  });
  assert.equal(kept.status, "locked");
  assert.equal(kept.source, "expo-location");
  assert.equal(kept.fix.latitude, 45.1);
  assert.equal(kept.shared, false);

  const coarse = applySatelliteReading(consented, {
    route: "expo-location",
    fix: { latitude: 45.1, longitude: -69.2, accuracy: EXPO_LOCK_ACCURACY_M + 50 }
  });
  assert.equal(coarse.status, "degraded");
  assert.equal(coarse.fix, null);
  assert.equal(JSON.stringify(coarse).includes("45.1"), false);
  assert.match(coarse.note, new RegExp(String(EXPO_LOCK_ACCURACY_M)));

  const tight = pickAccurateSample([
    { latitude: 1, longitude: 2, accuracy: 180 },
    { latitude: 3, longitude: 4, accuracy: 12 }
  ]);
  assert.equal(tight.fix.latitude, 3);
  assert.equal(tight.fix.accuracy, 12);
  assert.equal(tight.fix.source, "expo-location");
  const rejected = pickAccurateSample([{ latitude: 9, longitude: 8, accuracy: 400 }]);
  assert.equal(rejected.fix, null);
  assert.equal(JSON.stringify(rejected).includes("9"), false);

  const locationSrc = fs.readFileSync("src/phone/location_provider.js", "utf8");
  assert.match(locationSrc, /BestForNavigation/);
  assert.match(locationSrc, /watchPositionAsync/);
  assert.match(locationSrc, /termuxLocation/);
  assert.doesNotMatch(locationSrc, /getLastKnownPositionAsync/);
  assert.doesNotMatch(locationSrc, /useEffect/);
});

test("expo install bind is per-device and does not rewrite a foreign record", async () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const phone = "abcd1234ef567890";
  assert.equal(
    sha256Hex(`android-id:${phone}`),
    createHash("sha256").update(`android-id:${phone}`).digest("hex")
  );
  const minted = evaluateOwner({
    phone: { id: phone, source: "android-id" },
    randomBytes: () => new Uint8Array(16).fill(1),
    now: "2026-01-01T00:00:00.000Z"
  });
  assert.equal(minted.write, true);
  assert.equal(minted.recognized, true);
  assert.equal(minted.exterior, "deny");
  assert.equal(minted.encryption, "none");
  assert.equal(minted.ownership, "local-device");
  const again = evaluateOwner({
    phone: { id: phone, source: "android-id" },
    stored: minted.record
  });
  assert.equal(again.write, false);
  assert.equal(again.installId, minted.installId);
  const other = evaluateOwner({
    phone: { id: "1234abcd5678ef90", source: "android-id" },
    stored: minted.record
  });
  assert.equal(other.recognized, false);
  assert.equal(other.write, false);
  assert.equal(other.record, minted.record);
  const nobody = evaluateOwner({});
  assert.equal(nobody.recognized, false);
  assert.match(nobody.reason, /no phone identity/);

  const store = memoryStore();
  const first = await bindThisInstall(store);
  assert.equal(first.recognized, true);
  assert.equal(first.source, "expo-install");
  assert.equal(first.exterior, "deny");
  assert.equal(first.encryption, "none");
  const second = await bindThisInstall(store);
  assert.equal(second.write, false);
  assert.equal(second.installId, first.installId);
  const saved = JSON.parse(await store.get("yehsa.device_owner.v1"));
  saved.deviceMark = "0".repeat(64);
  await store.set("yehsa.device_owner.v1", JSON.stringify(saved));
  const denied = await bindThisInstall(store);
  assert.equal(denied.recognized, false);
  assert.equal(denied.write, false);
  assert.match(denied.reason, /not this phone/);
  assert.equal(JSON.parse(await store.get("yehsa.device_owner.v1")).deviceMark, "0".repeat(64));

  const ownerSrc = fs.readFileSync("src/phone/install_owner.js", "utf8");
  assert.match(ownerSrc, /expo-application/);
  assert.match(ownerSrc, /getAndroidId|androidId/);
  assert.match(ownerSrc, /getIosIdForVendorAsync/);
  assert.doesNotMatch(ownerSrc, /device_owner\.json/);
  const home = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(home, /bound to this device/);
  assert.match(home, /Exterior access is denied/);
});

test("native ble is real on android and ios and a scan does not cancel a held link", () => {
  const native = fs.readFileSync("src/phone/ble_native.native.js", "utf8");
  const stub = fs.readFileSync("src/phone/ble_native.js", "utf8");
  const provider = fs.readFileSync("src/phone/ble_provider.js", "utf8");
  assert.match(native, /react-native-ble-plx/);
  assert.match(native, /LowPower/);
  assert.doesNotMatch(native, /LowLatency/);
  assert.doesNotMatch(native, /destroy\(/);
  const scanBody = native.slice(
    native.indexOf("export async function scanNative"),
    native.indexOf("export async function connectNative")
  );
  assert.doesNotMatch(scanBody, /cancelDeviceConnection/);
  const connectBody = native.slice(
    native.indexOf("export async function connectNative"),
    native.indexOf("export async function writeNativeNote")
  );
  assert.match(connectBody, /cancelDeviceConnection/);
  assert.match(connectBody, /The link already in use was left alone/);
  assert.match(stub, /No peers were invented/);
  assert.equal(stub.includes("react-native-ble-plx"), false);
  assert.match(provider, /chooseRadioRoute/);
  assert.match(provider, /requestLEScan/);
  assert.match(provider, /MESH_NOTE_UUID/);
  assert.equal(chooseRadioRoute({
    termuxAvailable: true,
    nativeOs: true,
    nativeModule: true,
    webBluetooth: true
  }), "termux-bluetooth");
  assert.equal(chooseRadioRoute({ nativeOs: true, nativeModule: true, webBluetooth: true }), "native-ble");
  assert.equal(chooseRadioRoute({ nativeOs: true, nativeModule: false, webBluetooth: true }), "none");
  assert.equal(chooseRadioRoute({ webBluetooth: true }), "web-bluetooth");
  assert.equal(chooseRadioRoute({}), "none");

  const manifest = JSON.parse(fs.readFileSync("app.json", "utf8"));
  assert.equal(manifest.expo.name, "Yehsa");
  assert.equal(manifest.expo.slug, "axionet");
  assert.ok(manifest.expo.android.permissions.includes("BLUETOOTH_SCAN"));
  assert.match(manifest.expo.ios.infoPlist.NSBluetoothAlwaysUsageDescription, /Scan/);
  const eas = JSON.parse(fs.readFileSync("eas.json", "utf8"));
  assert.equal(eas.build.preview.distribution, "internal");
  assert.equal(eas.build.preview.android.buildType, "apk");
});
