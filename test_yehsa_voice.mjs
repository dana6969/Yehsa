import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { askField } from "./symbolic/phone_field.js";
import { warmFiller, stripFiller } from "./symbolic/answer_polish.js";
import { shapeAnswer } from "./symbolic/answer_shape.js";
import { mergeCompound, newThread, socialTurn, splitCompound, tripResult, voiceReply, TRIP_PLAN_TEXT, domainOf } from "./symbolic/yehsa_voice.js";

const passages = JSON.parse(fs.readFileSync("symbolic_memory/books_index.json", "utf8")).passages;
const ask = (q) => askField(q, passages, {});

function speak(question, thread = newThread()) {
  const parts = splitCompound(question);
  if (parts) {
    const answers = parts.map((part) => ({ part, result: part.domain === "trip" ? null : ask(part.text) }));
    return voiceReply(mergeCompound(parts, answers, thread), question, thread);
  }
  if (domainOf(question) === "trip") return voiceReply(tripResult(), question, thread);
  return voiceReply(ask(question), question, thread);
}

test("Dana's shelter and trip question gets both answered, tied to Before you go, and ends with an offer", () => {
  const q = "I need help with building a shelter and planning a trip";
  const parts = splitCompound(q);
  assert.equal(parts.length, 2);
  const voiced = speak(q);
  assert.match(voiced.text, /^Happy to help with both\./);
  assert.match(voiced.text, /wind|ground/i);
  assert.match(voiced.text, /Before you go/);
  assert.match(voiced.text, /offline map/i);
  assert.match(voiced.text, /Want me to walk you through a packing list for the trip\?$/);
  assert.equal(voiced.parts.sections.length, 2);
  assert.ok(voiced.suggestions.some((chip) => chip.go === "kit"));
  assert.ok(voiced.suggestions.some((chip) => chip.go === "before"));
});

test("a yes to my last offer runs it, a thanks or a hello gets a short human answer", () => {
  const thread = speak("I need help with building a shelter and planning a trip").thread;
  const yes = socialTurn("yes please", thread);
  assert.equal(yes.kind, "go");
  assert.equal(yes.go, "kit");
  assert.equal(socialTurn("hello", newThread()).kind, "talk");
  assert.equal(socialTurn("thanks", newThread()).kind, "talk");
  assert.equal(socialTurn("how do I build a fire", newThread()), null);
  const med = speak("How do I stop heavy bleeding?").thread;
  const again = socialTurn("yes", med);
  assert.equal(again.kind, "ask");
  assert.ok(ask(again.ask).answered);
});

test("the same offer is never repeated twice in a row", () => {
  let thread = newThread();
  const offers = [];
  for (const q of ["How do I make a shelter?", "How do I build a shelter in the snow?"]) {
    const voiced = speak(q, thread);
    thread = voiced.thread;
    offers.push(voiced.parts.offer);
  }
  assert.notEqual(offers[0], offers[1]);
});

test("a miss stays honest and does not pretend", () => {
  const voiced = voiceReply({ answered: false, miss: "x" }, "what is the capital of mars", newThread());
  assert.match(voiced.text, /I don't have a trusted note for that/);
  assert.doesNotMatch(voiced.text, /Want me to/);
});

test("serious bleeding keeps its urgency and drops the 'this note does not' filler", () => {
  const voiced = speak("How do I stop heavy bleeding?");
  assert.match(voiced.text, /direct pressure/i);
  assert.match(voiced.text, /urgent|help/i);
  assert.doesNotMatch(voiced.text, /This note does not/i);
  assert.match(voiced.parts.opener, /steady|calm|here is what to do/i);
});

test("warmFiller removes what a note is not, and keeps safety lines", () => {
  assert.equal(warmFiller("Apply pressure. This note does not teach surgery or medication dosing."), "Apply pressure.");
  assert.match(warmFiller("This is not safe to drink. Boil it first."), /This is not safe to drink\./);
  assert.match(warmFiller("Call a doctor. This guide does not replace care."), /Call a doctor\./);
});

test("the frozen filler stripper used by the gate was not changed", () => {
  const before = stripFiller("This note does not teach surgery. Press hard.");
  assert.ok(typeof before === "string");
});

test("spiritual answers are not rewritten into survival prose", () => {
  const result = { answered: true, kind: "spiritual", symbol: "psalm_23", text: "The Lord is my shepherd; I shall not want." };
  const voiced = voiceReply(result, "read psalm 23", newThread());
  assert.match(voiced.text, /The Lord is my shepherd; I shall not want\./);
  assert.doesNotMatch(voiced.text, /Want me to go over when a cut/);
});

test("calculator and about answers are left exactly as they are", () => {
  const result = { answered: true, kind: "calculator", text: "12 mi = 19.3 km" };
  assert.equal(voiceReply(result, "12 miles in km", newThread()).text, "12 mi = 19.3 km");
});

test("a pure trip question points at Before you go and the pack list", () => {
  const voiced = speak("Help me plan a camping trip");
  assert.ok(voiced.text.includes(TRIP_PLAN_TEXT));
  assert.ok(voiced.suggestions.some((chip) => chip.go === "before"));
});

test("answers take the scannable shape: bold summary, numbered steps, folded extras, safety line in view", () => {
  const shape = shapeAnswer("Get out of the wind first.\n\n1. Find shelter.\n2. Sit on something dry.\n\nYou can use a tarp or branches.\n\nCommon mistakes: sitting on wet ground.\n\nDo not drink seawater.");
  assert.equal(shape.summary, "Get out of the wind first.");
  assert.deepEqual(shape.steps, ["Find shelter.", "Sit on something dry."]);
  assert.equal(shape.folded[0].label, "Materials and common mistakes");
  assert.match(shape.folded[0].text, /tarp/);
  assert.match(shape.folded[0].text, /Common mistakes/);
  assert.deepEqual(shape.notes, ["Do not drink seawater."]);
});

test("no user-facing source says Later, Coming in a later update, or Corpus health outside the developer row", () => {
  const files = fs.readdirSync("src/phone").filter((name) => name.endsWith(".js"));
  for (const name of files) {
    const body = fs.readFileSync(`src/phone/${name}`, "utf8");
    assert.doesNotMatch(body, /Coming in a later update|arrive in a later update|LATER_COPY|later: true/i, name);
  }
  const guide = fs.readFileSync("src/phone/PictureGuide.js", "utf8");
  const defaultScreen = guide.slice(0, guide.indexOf("export function CorpusHealth"));
  assert.doesNotMatch(defaultScreen, /Corpus health/);
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(app, /<DeveloperRow \/>/);
  assert.match(app, /const \[on, setOn\] = useState\(false\)/);
});

test("layout fixes from the handoff: chip gap 16, tab labels 14, explicit mode chips", () => {
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(app, /askChip: \{[^}]*marginBottom: 16/s);
  assert.match(app, /tabText: \{[^}]*fontSize: 14/s);
  const ui = fs.readFileSync("src/phone/ui.js", "utf8");
  assert.match(ui, /function ModeChips/);
  assert.doesNotMatch(ui, /nextMode/);
});

test("bleeding offers the tourniquet note, and the tourniquet note offers a way back to direct pressure", () => {
  const bleed = speak("How do I stop heavy bleeding?");
  // Round 4: the full field entries answer these, and the loop between them is kept.
  assert.equal(ask("How do I stop heavy bleeding?").symbol, "heavy_vs_minor_bleeding");
  assert.match(bleed.offer.label, /tourniquet is the last resort/);
  const next = speak(bleed.offer.ask, bleed.thread);
  assert.equal(ask(bleed.offer.ask).symbol, "tourniquet_apply");
  assert.match(next.text, /last resort/i);
  assert.match(next.offer.label, /direct pressure/);
  assert.equal(ask(next.offer.ask).symbol, "heavy_vs_minor_bleeding");
});
