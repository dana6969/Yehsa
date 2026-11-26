// Dana's 17 Nov phone test: shelter answers, feedback buttons, Helpful not saving, chat leak.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { fieldGuideAnswer, fieldGuideTopics, routeFieldGuide } from "./symbolic/field_guide.js";
import { stripFiller } from "./symbolic/answer_polish.js";
import { askField } from "./symbolic/phone_field.js";
import { isFeedbackEligible } from "./symbolic/chat_turn.js";
import { confirmLearned, emptyLearned, exportLearned, noteOrigin, openLearned, retrieveLearned, saveHelpfulAnswer, searchLearned } from "./symbolic/learned_notes.js";

const books = JSON.parse(fs.readFileSync("symbolic_memory/books_index.json", "utf8"));
const passages = books.passages || books;

test("different shelter questions get different, step-first answers with no filler", () => {
  const need = askField("I need shelter", passages);
  const use = askField("What could I use for shelter", passages);
  assert.equal(need.answered, true);
  assert.equal(use.answered, true);
  assert.notEqual(need.text, use.text);
  assert.match(need.text, /^Get out of the wind and off wet ground first\./);
  assert.match(need.text, /\n1\. /);
  assert.match(use.text, /Tarp|tarp/);
  assert.match(use.text, /debris hut/);
  for (const text of [need.text, use.text]) {
    assert.doesNotMatch(text, /planning note|wilderness course|In a survival setting/i);
    assert.doesNotMatch(text, /^Shelter and fire:/);
  }
  const seen = new Set();
  for (const q of ["How do I build a debris hut", "How do I make a lean-to", "How do I pitch a tarp shelter", "How do I build a snow cave", "How do I insulate myself from the cold ground", "Where should I build my shelter"]) {
    const answer = askField(q, passages);
    assert.equal(answer.answered, true, q);
    assert.equal(seen.has(answer.text), false, `${q} repeats another answer`);
    seen.add(answer.text);
  }
});

test("each guide answer has steps and at most one safety line", () => {
  for (const id of fieldGuideTopics()) {
    assert.ok(id.length > 2);
  }
  for (const q of ["How do I start a fire", "How do I start a fire in the rain", "How do I purify water", "Where can I find water", "I am lost", "How do I signal for rescue", "How do I tie a bowline", "What should I do if I see a bear", "How do I cross a river", "What do I do in a power outage", "How do I remove a tick"]) {
    const guide = fieldGuideAnswer(q);
    assert.ok(guide, q);
    assert.match(guide.text, /\n1\. /, q);
    assert.doesNotMatch(guide.text, /not a wilderness course|not a building code/i);
  }
});

test("note quizzes and myth checks still go to the field notes", () => {
  for (const q of [
    "What should I get out of first when I need shelter?",
    "How do I choose a shelter site before I think about a fire?",
    "How many blasts are in the repeated whistle signal?",
    "How much iodine do I add to make drinking water safe, in drops?",
    "Moss always points north, so I can ignore the compass. Which way is north from the moss?"
  ]) {
    assert.equal(routeFieldGuide(q), null, q);
  }
});

test("filler disclaimers are stripped and real safety lines stay", () => {
  const text = stripFiller("Shelter and fire: get out of wind and wet ground first. Do not light a fire where local rules forbid it. This is a planning note, not a wilderness course.");
  assert.equal(text, "Get out of wind and wet ground first. Do not light a fire where local rules forbid it.");
  assert.equal(stripFiller("Do not rub frostbite with snow or ice."), "Do not rub frostbite with snow or ice.");
});

test("feedback shows only under real answers", () => {
  assert.equal(isFeedbackEligible(askField("I need shelter", passages)), true);
  assert.equal(isFeedbackEligible({ answered: false, text: null, miss: "No offline note answered that." }), false);
  assert.equal(isFeedbackEligible({ answered: true, text: "12", kind: "calculator" }), false);
  assert.equal(isFeedbackEligible({ answered: true, text: "I answer from...", kind: "about" }), false);
  assert.equal(isFeedbackEligible(null), false);
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(app, /item\.feedbackEligible === true/);
  assert.doesNotMatch(app, /label="Helpful"|label="Not right"/);
  assert.doesNotMatch(app, /Marked helpful\. I'll remember|That trusted note stays/);
  assert.match(app, /Thanks\. I saved that on this phone\./);
  const onHelpful = app.slice(app.indexOf("function onHelpful(item)"), app.indexOf("function onNotRight(item)"));
  assert.doesNotMatch(onHelpful, /pushMessage/);
});

test("Yes on a trusted answer saves a note that shows on What Yehsa has learned and survives a restart", () => {
  const answer = askField("I need shelter", passages);
  let store = emptyLearned("phone-a");
  store = saveHelpfulAnswer(store, { question: "I need shelter", text: answer.text, title: answer.title, symbol: answer.symbol });
  assert.equal(store.notes.length, 1);
  assert.equal(searchLearned(store, "").length, 1);
  store = saveHelpfulAnswer(store, { question: "I need shelter", text: answer.text, title: answer.title, symbol: answer.symbol });
  assert.equal(store.notes.length, 1, "a second Yes does not duplicate");
  assert.equal(store.notes[0].helpful, 2);
  const reopened = openLearned(JSON.parse(exportLearned(store)), "phone-a");
  assert.equal(reopened.notes.length, 1);
  assert.match(noteOrigin(reopened.notes[0]), /^From a chat answer · \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  assert.equal(confirmLearned(reopened, reopened.notes[0].id).notes[0].confidence, "confirmed");
  // A trusted note still answers first; the saved note is a fallback only.
  assert.notEqual(askField("I need shelter", passages, { learned: reopened }).kind, "learned");
  assert.ok(retrieveLearned("I need shelter", reopened));
});

test("chat stays in Ask: no docked composer or bubble on other screens", () => {
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.doesNotMatch(app, /dockHost|docked=/);
  const chip = app.slice(app.indexOf("function AskChip("), app.indexOf("function heldPhrase("));
  assert.doesNotMatch(chip, /summary\?\.text/);
  const learned = fs.readFileSync("src/phone/LearnedPane.js", "utf8");
  assert.match(learned, /Things you asked Yehsa to remember on this phone\./);
  assert.match(learned, /Forget all saved notes\?/);
  assert.doesNotMatch(learned, /Not a retrained model|Reset all learned notes|vs\. asked the model/);
});
