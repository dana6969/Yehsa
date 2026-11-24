// Every camera-ID label has a text note, and Ask finds that note when the label is typed.
// Dana's miss: the camera named deer scat from a photo, but "what is deer scat" in Ask had no note.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { CAMERA_NOTES } from "./symbolic/camera_notes.js";
import { entryFor } from "./symbolic/entries.js";
import { ask } from "./symbolic/ask.js";
import { askField } from "./symbolic/phone_field.js";

const classes = JSON.parse(fs.readFileSync("assets/camera_id/classes.json", "utf8"));
const passages = JSON.parse(fs.readFileSync("symbolic_memory/books_index.json", "utf8")).passages;
const symbols = new Set(passages.map((passage) => passage.symbol));
// Everyday classes (food, objects, pets) are the camera's out-of-domain gate. They never get a note.
const wild = Object.entries(classes).filter(([, meta]) => meta.group !== "everyday");
const plainName = (title) => title.replace(/\s*\([^)]*\)/g, "").trim();

test("every camera label maps to a text note that ships", () => {
  const missing = wild.filter(([label]) => !CAMERA_NOTES[label]).map(([label]) => label);
  assert.deepEqual(missing, [], `camera labels with no text note: ${missing.join(", ")}`);
  for (const [label] of wild) {
    const note = CAMERA_NOTES[label];
    assert.ok(entryFor(note) || symbols.has(note), `${label} -> ${note} is not a field entry or an indexed note`);
    assert.ok(symbols.has(note), `${label} -> ${note} is not in symbolic_memory/books_index.json, so Ask cannot find it`);
  }
});

test("a new camera label without a note fails this test", () => {
  const fake = { ...Object.fromEntries(wild), made_up_lichen: { title: "Made-up lichen", group: "plant" } };
  const missing = Object.keys(fake).filter((label) => !CAMERA_NOTES[label]);
  assert.deepEqual(missing, ["made_up_lichen"]);
});

test("each field entry for a camera label follows the round-4 template", () => {
  for (const [label] of wild) {
    const entry = entryFor(CAMERA_NOTES[label]);
    if (!entry) continue;
    assert.ok(entry.def && entry.def.length >= 30, `${label}: definition`);
    assert.ok(entry.also?.length >= 1, `${label}: aliases`);
    assert.ok(entry.look?.length >= 2, `${label}: distinguishing features`);
    assert.ok(entry.use && entry.not, `${label}: when to use and when not to`);
    assert.ok(entry.src?.length >= 1, `${label}: sources`);
  }
});

test("typing a camera label in Ask lands on its note", () => {
  const wrong = [];
  for (const [label, meta] of wild) {
    const name = plainName(meta.title);
    for (const question of [`What is ${name.toLowerCase()}?`, `Tell me about ${name.toLowerCase()}`]) {
      const result = ask(question, { agents: false });
      if (!result.answered || result.symbol !== CAMERA_NOTES[label]) wrong.push(`${question} -> ${result.symbol || "no answer"} (want ${CAMERA_NOTES[label]})`);
    }
  }
  assert.deepEqual(wrong, []);
});

test("scat and track aliases reach the sign notes", () => {
  const cases = [
    ["What is deer scat?", "deer_scat"],
    ["Tell me about deer scat", "deer_scat"],
    ["What do deer droppings look like?", "deer_scat"],
    ["Is this deer poop?", "deer_scat"],
    ["I found small pellets, are they deer pellets?", "deer_scat"],
    ["What does bear scat look like?", "bear_scat"],
    ["Is raccoon poop dangerous?", "raccoon_scat"],
    ["What are rabbit droppings like?", "rabbit_scat"],
    ["What do deer tracks look like?", "deer_track"],
    ["What is a buck rub?", "deer_rub"],
    ["What is a deer scrape?", "deer_scrape"],
    ["How do I read deer sign?", "deer_sign_reading"]
  ];
  for (const [question, symbol] of cases) {
    const result = ask(question, { agents: false });
    assert.equal(result.symbol, symbol, `${question} -> ${result.text?.slice(0, 120)}`);
  }
});

test("the phone Ask path answers a typed camera label with the same note", () => {
  for (const question of ["What is deer scat?", "Tell me about deer scat", "What is chaga?", "What is plantain?"]) {
    const phone = askField(question, passages, {});
    assert.equal(phone.answered, true, question);
    assert.equal(phone.symbol, ask(question, { agents: false }).symbol, question);
  }
});
