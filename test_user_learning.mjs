import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";
import { ask } from "./symbolic/ask.js";
import { mapEmotion } from "./symbolic/emotion_mapper.js";

const PHONE = "abcd1234ef567890";
const QUESTION = "What can willow bark be used for in a survival setting?";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yehsa-learn-"));
}

function options(dir) {
  return {
    ownerPath: path.join(dir, "owner.json"),
    learningPath: path.join(dir, "learning.json"),
    phoneId: PHONE
  };
}

test("off this phone, use is not stored and the answer still arrives", () => {
  const dir = tempDir();
  const learningPath = path.join(dir, "learning.json");
  const queue = "symbolic_memory/learning_queue.json";
  const queueBefore = fs.statSync(queue).mtimeMs;
  const answer = ask(QUESTION, { ownerPath: path.join(dir, "owner.json"), learningPath });
  assert.equal(answer.answered, true);
  assert.equal(answer.learning.learned, false);
  assert.match(answer.text.toLowerCase(), /willow/);
  assert.equal(answer.emotion.understood, false);
  assert.equal(fs.existsSync(learningPath), false);
  assert.equal(fs.statSync(queue).mtimeMs, queueBefore);
});

test("the bound phone remembers topic and wording and adapts the next reply", () => {
  const dir = tempDir();
  const opts = options(dir);
  const first = ask(QUESTION, opts);
  assert.equal(first.answered, true);
  assert.equal(first.learning.learned, true);
  assert.equal(first.learning.turns, 1);
  assert.doesNotMatch(first.text, /come back/);
  assert.match(first.text.toLowerCase(), /willow/);
  const saved = JSON.parse(fs.readFileSync(opts.learningPath, "utf8"));
  assert.equal(saved.binding, "this-phone");
  assert.equal(saved.topics["willow bark"], 1);
  assert.equal(saved.emotions.neutral, 1);

  const second = ask(QUESTION, opts);
  assert.equal(second.learning.turns, 2);
  assert.match(second.text, /come back to willow bark \(2\)/);
  assert.match(second.text.toLowerCase(), /salix|willow/);
  assert.equal(second.emotion.understood, false);
});

test("unclear emotion still answers, and a repeated feeling is remembered", () => {
  const dir = tempDir();
  const opts = options(dir);
  const wording = "I can't breathe and my chest is tight";
  const read = mapEmotion(wording);
  assert.equal(read.emotion, "fear");
  assert.match(read.deduction, /Fear reads as threat/);
  const first = ask(wording, opts);
  assert.equal(first.answered, true);
  assert.equal(first.emotion.emotion, "fear");
  assert.match(first.emotion.deduction, /Fear reads as threat/);
  const second = ask(wording, opts);
  assert.match(second.text, /fear has shown up in your wording before/);
  assert.match(second.emotion.deduction, /Fear reads as threat/);
  assert.equal(second.answered, true);
});
