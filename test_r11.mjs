// R11: keyboard lift from the real IME inset, Ask speed (same answers, less work), and the
// Constitution section quote that stops at the next heading.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { imeLift, keyboardOverlap } from "./symbolic/keyboard_overlap.js";
import { searchPassages, textHasToken, tokenForms } from "./symbolic/book_search.js";

const src = (f) => fs.readFileSync(f, "utf8");

test("the lift puts the app's bottom on the keyboard's top for any keyboard height", () => {
  // Dana's phone: 915 dp window, Gboard with number row and toolbar 288 dp, 48 dp navigation bar under it.
  assert.equal(imeLift({ imeBottom: 336, windowHeight: 915, viewBottom: 915 }), 336);
  // A taller keyboard (clipboard strip open) and a short one.
  assert.equal(imeLift({ imeBottom: 402, windowHeight: 915, viewBottom: 915 }), 402);
  assert.equal(imeLift({ imeBottom: 250, windowHeight: 915, viewBottom: 915 }), 250);
  // Floating or split keyboard: no bottom inset, nothing to lift.
  assert.equal(imeLift({ imeBottom: 0, windowHeight: 915, viewBottom: 915 }), 0);
  assert.equal(imeLift({ imeBottom: 336, windowHeight: 915, viewBottom: 915, visible: false }), 0);
  // The system already resized the window (older Android): the root ends at the keyboard, so 0, not twice.
  assert.equal(imeLift({ imeBottom: 336, windowHeight: 915, viewBottom: 579 }), 0);
  // The root stops above the navigation bar: only the rest is lifted.
  assert.equal(imeLift({ imeBottom: 336, windowHeight: 915, viewBottom: 867 }), 288);
});

test("the React Native fallback is no longer capped at the event height (R10 came up one navigation bar short)", () => {
  // keyboardDidShow on Android: height = IME inset - system bars (288), screenY = keyboard top (579).
  const lift = keyboardOverlap({ viewBottom: 915, keyboardTop: 579, keyboardHeight: 288, screenHeight: 915 });
  assert.equal(lift, 336);
  assert.equal(keyboardOverlap({ viewBottom: 579, keyboardTop: 579, keyboardHeight: 288, screenHeight: 915 }), 0);
  assert.equal(keyboardOverlap({ viewBottom: 915, keyboardTop: 579, keyboardHeight: 0, screenHeight: 915 }), 0);
});

test("one keyboard store: the native IME module first, the frame and hidden rows re-render alone", () => {
  const ki = src("src/phone/keyboard_inset.js");
  assert.match(ki, /requireOptionalNativeModule\?\.\("YehsaIme"\)/);
  assert.match(ki, /addListener\("onIme", fromNative\)/);
  assert.match(ki, /export function KeyboardFrame/);
  assert.match(ki, /export function KeyboardHidden/);
  const kt = src("modules/yehsa-ime/android/src/main/java/com/dana6969/axi0net/ime/ImeModule.kt");
  assert.match(kt, /WindowInsetsCompat\.Type\.ime\(\)/);
  assert.match(kt, /Name\("YehsaIme"\)/);
  assert.match(kt, /setWindowInsetsAnimationCallback/);
  assert.deepEqual(JSON.parse(src("modules/yehsa-ime/expo-module.config.json")).android.modules, ["com.dana6969.axi0net.ime.ImeModule"]);
  const app = src("src/phone/YehsaApp.js");
  assert.doesNotMatch(app, /useKeyboardInset\(/);
  assert.doesNotMatch(app, /keyboard\.(open|pad)/);
});

// The R10 matcher, kept here as the reference the cached one must equal.
function refTextHasToken(text, token) {
  const forms = new Set(tokenForms(token));
  if (forms.size === 0) return false;
  for (const word of String(text || "").toLowerCase().split(/[^a-z0-9+]+/)) {
    if (!word) continue;
    if (forms.has(word)) return true;
    for (const form of tokenForms(word)) if (forms.has(form)) return true;
  }
  return false;
}

test("the faster word matcher gives the same answer as before on every word and plural", () => {
  const words = ["berry", "berries", "mosquito", "mosquitoes", "ash", "ashes", "box", "boxes", "church", "churches", "glass", "willow", "willows", "fly", "flies", "bus", "dish", "dishes", "water", "watershed", "a", "of", "tea", "teas", "c+", "x2"];
  const texts = [
    "Wild berries and a willow; mosquitoes at the watershed.",
    "Ashes in the boxes by the churches. Glass.",
    "Flies, dishes, a bus and teas", "", "BERRY", "x2 c+ fly"
  ];
  for (const t of texts) for (const w of words) assert.equal(textHasToken(t, w), refTextHasToken(t, w), `${w} in ${t}`);
  const passages = [{ symbol: "willow_bark", title: "Willow bark", context: "Inner bark of willows (salix) for aches.", source: "herbology" }];
  assert.equal(searchPassages(passages, "willow bark", 3)[0]?.symbol, "willow_bark");
});

test("the Second Amendment quote is exactly the amendment sentence, with the copy's own page (House Manual and GovInfo)", async () => {
  const { documentSectionAnswer } = await import("./symbolic/docs/section_answer.js");
  const { bookFromText } = await import("./symbolic/library/library.js");
  const bundled = bookFromText({ id: "book:us-constitution", title: "Constitution", raw: src("assets/books/us_constitution.ybk") }).pages;
  const sentence = "A well regulated Militia, being necessary to the security of a free State, the right of the people to keep and bear Arms, shall not be infringed.";
  for (const [file, page] of [["eval/fixtures/r11/hman117_constitution_pages.json", 109], ["eval/fixtures/r10/govinfo_constitution_pages.json", 19]]) {
    const pages = JSON.parse(src(file));
    const entries = [{ meta: { id: "c", title: "CONSTITUTION - GovInfo", url: "https://www.govinfo.gov/" }, body: { pages } }];
    const a = documentSectionAnswer("What's my second amendment", { entries, constitutionPages: bundled });
    const quoted = /^"(.*)" \[1\]/m.exec(a.text)[1];
    assert.equal(quoted, sentence, file);
    assert.doesNotMatch(a.text, /Roosevelt|20th amendment|executive Power/);
    assert.equal(a.reader.bookId, "doc:c");
    assert.equal(a.reader.page, page, file);
    assert.match(a.text, new RegExp(`page ${page}: Amendment II`));
    assert.match(a.text, /Ratified December 15, 1791/);
  }
});

test("every Constitution part in both GovInfo layouts quotes the National Archives text and the copy's page", async () => {
  const { results } = await import("./eval/r11/section_quote_audit.mjs");
  const bad = results.filter((r) => !r.ok);
  assert.equal(bad.length, 0, JSON.stringify(bad.slice(0, 5)));
  assert.ok(results.length >= 84);
});
