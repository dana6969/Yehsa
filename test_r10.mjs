// R10: keyboard layout, voice search, Morse light, and document section lookups.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { keyboardOverlap } from "./symbolic/keyboard_overlap.js";
import { filterMoreItems, voiceSearchText } from "./symbolic/voice_search.js";
import { alternating, signalSteps, unitForWpm, totalMs, timeline } from "./symbolic/morse_signal.js";

const src = (f) => fs.readFileSync(f, "utf8");

test("the keyboard overlap is added once: full when the window did not resize, zero when it did", () => {
  // Edge-to-edge: the app's view still reaches the screen bottom (800); keyboard top at 500.
  assert.equal(keyboardOverlap({ viewBottom: 800, keyboardTop: 500, keyboardHeight: 300, screenHeight: 800 }), 300);
  // adjustResize did shrink the window: the view ends where the keyboard starts.
  assert.equal(keyboardOverlap({ viewBottom: 500, keyboardTop: 500, keyboardHeight: 300, screenHeight: 800 }), 0);
  // No measurement: fall back to the screen.
  assert.equal(keyboardOverlap({ keyboardHeight: 280, screenHeight: 800 }), 280);
  assert.equal(keyboardOverlap({ viewBottom: 800, keyboardTop: 500, keyboardHeight: 0, screenHeight: 800 }), 0);
});

test("the shell lifts everything above the keyboard and hides the tab bar and SOS row while typing", () => {
  const app = src("src/phone/YehsaApp.js");
  assert.match(app, /const keyboard = useKeyboardInset\(rootRef\)/);
  assert.match(app, /styles\.keyboardFrame, keyboard\.pad \? \{ marginBottom: keyboard\.pad \}/);
  assert.match(app, /\(fullMap \|\| keyboard\.open\) && styles\.hidden/);
  assert.match(app, /keyboardDidShow[\s\S]{0,120}scrollToEnd/);
  // Every text box in the app is inside the shell (no separate Modal window with a text box).
  for (const f of fs.readdirSync("src/phone").filter((n) => n.endsWith(".js"))) {
    const s = src(`src/phone/${f}`);
    if (/<Modal\b/.test(s)) assert.doesNotMatch(s, /<TextInput|<Field\b/, f);
  }
  assert.equal(JSON.parse(src("app.json")).expo.android.softwareKeyboardLayoutMode, "resize");
});

test("every search field has a mic that fills the field and runs the search", () => {
  for (const f of ["src/phone/CommandSheet.js", "src/phone/route/RoutePanel.js", "src/phone/MorePane.js", "src/phone/ReaderScreen.js", "src/phone/LearnedPane.js", "src/phone/PictureGuide.js"]) {
    assert.match(src(f), /<VoiceSearchButton[\s\S]{0,200}onDone=/, f);
  }
  assert.match(src("src/phone/VoiceSearchButton.js"), /openMic\(/, "same recognizer as the Ask mic");
  assert.equal(voiceSearchText("Search for water filter."), "water filter");
  assert.equal(voiceSearchText("okay Yehsa, find me the compass"), "the compass");
  const items = [{ id: "display", label: "Display", hint: "Field, Sunlight" }, { id: "models", label: "Models", hint: "Helpers" }];
  assert.deepEqual(filterMoreItems(items, "display").map((i) => i.id), ["display"]);
  assert.equal(filterMoreItems(items, "").length, 2);
});

test("the recognizer retries once without on-device mode when the offline pack is missing", () => {
  const s = src("src/phone/speech_listen.native.js");
  assert.match(s, /language-not-supported/);
  assert.match(s, /restartPending/);
});

test("Morse light: PARIS timing, SOS run together, and the torch gets on/off lengths", () => {
  assert.equal(unitForWpm(12), 100);
  assert.equal(unitForWpm(5), 240);
  assert.deepEqual(alternating(signalSteps("SOS", 12)), [100, 100, 100, 100, 100, 100, 300, 100, 300, 100, 300, 100, 100, 100, 100, 100, 100, 700]);
  // E E: dot, word gap, dot, final gap.
  assert.deepEqual(alternating(signalSteps("e e", 12)), [100, 700, 100, 700]);
  // ET: dot, letter gap (3), dash (3), end gap.
  assert.deepEqual(alternating(signalSteps("et", 12)), [100, 300, 300, 700]);
  assert.equal(totalMs(timeline("paris", 100)) - 700, 43 * 100, "PARIS is 50 units with its word gap (43 + 7)");
});

test("the Morse screen flashes the torch through the native module and always turns it off", () => {
  const kt = src("modules/yehsa-torch/android/src/main/java/com/dana6969/axi0net/torch/TorchModule.kt");
  assert.match(kt, /setTorchMode/);
  assert.match(kt, /OnActivityEntersBackground/);
  assert.match(kt, /finally \{[\s\S]*setTorch\(false\)/);
  const ui = src("src/phone/MorseSignal.js");
  assert.match(ui, /playTorch\(alternating\(steps\), loop\)/);
  assert.match(ui, /AppState\.addEventListener/);
  assert.match(ui, /stopTorch\(\)/);
  assert.match(ui, /Repeat until I stop it/);
  assert.match(ui, /Flash it on the screen/);
  assert.match(ui, /Play it as a tone/);
  assert.match(src("src/phone/FieldPane.js"), /\["SOS", "HELP", "OK", "NEED WATER"\]/);
  assert.equal(JSON.parse(src("modules/yehsa-torch/expo-module.config.json")).android.modules[0], "com.dana6969.axi0net.torch.TorchModule");
});

import { R10_FLOWS, runR10Flows } from "./eval/dev_r10_flows.mjs";
import { numberValue, parseSectionRef, romanValue } from "./symbolic/docs/section_ref.js";
import { routeAsk } from "./symbolic/reasoning/ask_route.js";
import { buildQuestions } from "./eval/questions.mjs";
import { DEV_SET } from "./eval/dev_set.mjs";
import { PARAPHRASE_SET } from "./eval/paraphrase_set.mjs";
import { loadRegressionV1 } from "./eval/regression/v1/load.mjs";
import { BUNDLED_BOOKS } from "./symbolic/library/library.js";

test("document section flows (the second amendment screenshot, offline, routing, audit) all pass", () => {
  const results = runR10Flows();
  assert.equal(results.length, R10_FLOWS.length);
  for (const r of results) assert.ok(r.pass, `${r.id}: ${r.why}`);
});

test("ordinals, numerals and Roman numerals all name the same part", () => {
  for (const t of ["2", "2nd", "II", "ii", "two", "second"]) assert.equal(numberValue(t), 2, t);
  assert.equal(numberValue("twenty-seventh"), 27);
  assert.equal(numberValue("twenty first"), 21);
  assert.equal(romanValue("iiii"), null);
  assert.equal(romanValue("xiv"), 14);
  for (const q of ["What's my second amendment", "2nd amendment", "amendment II", "Amendment 2", "the second amendment to the constitution"]) {
    const r = parseSectionRef(q);
    assert.equal(r.kind, "amendment", q);
    assert.equal(r.n, 2, q);
  }
  assert.deepEqual((({ kind, n, section }) => ({ kind, n, section }))(parseSectionRef("article 1 section 8")), { kind: "article", n: 1, section: 8 });
  assert.deepEqual((({ kind, n, section }) => ({ kind, n, section }))(parseSectionRef("section 2 of article IV")), { kind: "article", n: 4, section: 2 });
  assert.equal(parseSectionRef("what does chapter 3 say").n, 3);
  assert.equal(parseSectionRef("preamble").kind, "preamble");
  assert.equal(parseSectionRef("amendment i think is wrong"), null);
});

test("no eval, dev, paraphrase or frozen v1 question takes the Constitution route", () => {
  const all = [...buildQuestions().map((q) => q.prompt), ...DEV_SET.map((q) => q.prompt), ...PARAPHRASE_SET.map((q) => q.prompt), ...loadRegressionV1().questions.map((q) => q.prompt || q.question)].filter(Boolean);
  assert.deepEqual(all.filter((q) => routeAsk(q, {})?.kind === "section"), []);
});

test("the Constitution and Bill of Rights ship with the app as a public-domain book", () => {
  const b = BUNDLED_BOOKS.find((x) => x.id === "book:us-constitution");
  assert.ok(b);
  const raw = src(`assets/books/${b.file}.ybk`);
  assert.match(raw, /public domain/);
  assert.match(raw, /AMENDMENT II\n\nA well regulated Militia/);
  assert.match(raw, /AMENDMENT XXVII/);
  assert.match(src("src/phone/book_assets.native.js"), /us_constitution: require\("..\/..\/assets\/books\/us_constitution\.ybk"\)/);
  const app = src("src/phone/YehsaApp.js");
  assert.match(app, /route\?\.kind === "section"/);
  assert.match(app, /reader: result\?\.reader \|\| null/);
});
