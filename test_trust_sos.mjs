import assert from "node:assert/strict";
import fs from "fs";
import path from "node:path";
import test from "node:test";
import { ask } from "./symbolic/ask.js";
import { askField } from "./symbolic/phone_field.js";
import { citeHit, formatAnswerSource } from "./symbolic/answer_source.js";
import { PLEDGE, PLEDGE_SECTIONS, PLEDGE_TITLE } from "./data/text/no_account_pledge.js";
import { SAT_SOS, SAT_SOS_SECTIONS } from "./data/text/sat_sos_guide.js";
import { HOTSPOT, HOTSPOT_SECTIONS } from "./data/text/hotspot_guide.js";

const root = path.dirname(new URL(import.meta.url).pathname);
const passages = JSON.parse(fs.readFileSync(path.join(root, "symbolic_memory/books_index.json"), "utf8")).passages;

const FORBIDDEN = /military[- ]grade|unbreakable|perfect record|guarantees? help|Yehsa (?:sends|can send) (?:a )?satellite|our app (?:does|can) satellite/i;

test("a field-note answer cites the note title and origin without changing the text", () => {
  const raw = "How do I treat a mosquito bite with plants?";
  const desktop = ask(raw);
  const phone = askField(raw, passages);
  assert.equal(desktop.answered, true);
  assert.equal(phone.answered, true);
  assert.equal(phone.text, desktop.text);
  assert.match(String(desktop.source), /field note/i);
  assert.match(String(phone.source), /field note/i);
  assert.match(String(desktop.source), /Plantain|Yarrow|Herbology|Mosquito/i);
  assert.doesNotMatch(desktop.text, /^Source:/);
  assert.doesNotMatch(phone.text, /^Source:/);
});

test("a public-domain book answer names the book", () => {
  const cited = citeHit({
    title: "The Kybalion",
    source: "symbolic_books/the_kybalion.txt",
    symbol: "kybalion_1",
    kind: "book"
  });
  assert.equal(cited, "The Kybalion — a public-domain book");
});

test("calculator and missed questions do not invent a note source", () => {
  const sum = ask("What is 2 + 2?");
  assert.equal(sum.answered, true);
  assert.equal(sum.source, null);
  const miss = askField("qqqq zzzzz ploverish", passages);
  assert.equal(miss.answered, false);
  assert.equal(miss.source, null);
});

test("a dictionary definition cites the dictionary pack", () => {
  const result = ask("What does willow mean?");
  if (result.answered) {
    assert.match(String(result.source), /dictionary pack/i);
  }
});

test("formatAnswerSource is stable when the display string is already set", () => {
  const once = formatAnswerSource({
    answered: true,
    text: "Carry known-safe water.",
    kind: "survival",
    title: "water",
    source: "symbolic_books/survival/water.txt",
    symbol: "water_1",
    hits: [{ kind: "survival", symbol: "water_1", title: "water", source: "symbolic_books/survival/water.txt", text: "Carry known-safe water." }]
  });
  assert.equal(once, "Water — a field note");
  assert.equal(formatAnswerSource({ answered: true, text: "Carry known-safe water.", source: once }), once);
});

test("the no-account pledge states the four promises in plain language", () => {
  assert.equal(PLEDGE_TITLE, "Trust");
  const blob = PLEDGE.toLowerCase();
  assert.match(blob, /no account/);
  assert.match(blob, /does not ask you to create an account/);
  assert.match(blob, /does not run an advertising tracker/);
  assert.match(blob, /work without a cell signal/);
  assert.match(blob, /stay on this (phone|device)/);
  assert.equal(PLEDGE_SECTIONS.length >= 4, true);
  assert.doesNotMatch(PLEDGE, FORBIDDEN);
});

test("the satellite SOS guide puts 911 or 112 first and does not claim Yehsa makes the link", () => {
  const blob = SAT_SOS;
  assert.match(blob, /Try 911 or 112 first/);
  assert.match(blob, /clear view of the sky/);
  assert.match(blob, /Check your phone's settings/);
  assert.match(blob, /Yehsa does not make a satellite link/);
  assert.match(blob, /What to say/);
  assert.doesNotMatch(blob, FORBIDDEN);
  assert.equal(SAT_SOS_SECTIONS[0].id, "call-first");
});

test("the hotspot page describes mesh honestly and separates it from tethering", () => {
  const blob = HOTSPOT;
  assert.match(blob, /Hotspot|tethering/i);
  assert.match(blob, /check your phone's settings/i);
  assert.match(blob, /without a cell signal/);
  assert.match(blob, /does not give you internet access/);
  assert.match(blob, /does not replace a hotspot/);
  assert.match(blob, /does not reach emergency services/);
  assert.doesNotMatch(blob, FORBIDDEN);
});

test("standalone screens and the More-menu entry exist with exports", () => {
  const files = {
    "src/phone/TrustScreen.js": /export default function TrustScreen/,
    "src/phone/SatSosGuide.js": /export default function SatSosGuide/,
    "src/phone/HotspotGuide.js": /export default function HotspotGuide/
  };
  const index = fs.readFileSync(path.join(root, "src/phone/screens_index.js"), "utf8");
  assert.match(index, /SatSosGuide/);
  assert.match(index, /HotspotGuide/);
  assert.match(index, /PLEDGE/);
  assert.doesNotMatch(index, /from \"\.\/YehsaApp/);
  for (const [rel, pattern] of Object.entries(files)) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    assert.match(text, pattern);
    assert.match(text, /from "\.\/tokens\.js"/);
    assert.doesNotMatch(text, FORBIDDEN);
  }
  const app = fs.readFileSync(path.join(root, "src/phone/YehsaApp.js"), "utf8");
  assert.match(app, /Source: \$\{item\.source\}/);
  assert.match(app, /source: result\?\.source \|\| null/);
});

test("docs/EVAL.md describes the frozen 411 buckets and how to reproduce them", () => {
  const text = fs.readFileSync(path.join(root, "docs/EVAL.md"), "utf8");
  assert.match(text, /411/);
  assert.match(text, /Correct/);
  assert.match(text, /Incorrect-confident/);
  assert.match(text, /Incorrect-hedged/);
  assert.match(text, /Appropriate abstention/);
  assert.match(text, /Unnecessary refusal/);
  assert.match(text, /node eval\/run\.mjs/);
  assert.match(text, /node eval\/gate\.mjs/);
  assert.match(text, /reviewed/);
  assert.doesNotMatch(text, FORBIDDEN);
});
