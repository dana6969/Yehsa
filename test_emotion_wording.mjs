import assert from "node:assert/strict";
import test from "node:test";
import { mapEmotion } from "./symbolic/emotion_mapper.js";
import { parseSemanticInput } from "./yesha_modules/semantic/semantic_parser.js";
import { semanticAnswer } from "./symbolic/symbolic_knowledge_tools.js";
import { evaluateTriggers } from "./yesha_modules/core/AGITriggers.js";

test("wording cues deduce fear without the word fear", () => {
  const read = mapEmotion("I can't breathe and my chest is tight");
  assert.equal(read.emotion, "fear");
  assert.equal(read.understood, true);
  assert.ok(read.confidence >= 0.7);
  assert.ok(read.cues.includes("tight-body"));
  assert.ok(read.cues.includes("cannot-face"));
  assert.match(read.deduction, /Fear reads as threat/);
});

test("anger and sadness come from how the sentence is said", () => {
  const anger = mapEmotion("This isn't fair and I could scream");
  assert.equal(anger.emotion, "anger");
  assert.ok(anger.confidence > mapEmotion("I feel a bit glad").confidence || anger.cues.length >= 2);
  const sadness = mapEmotion("I miss them and everything feels heavy");
  assert.equal(sadness.emotion, "sadness");
  assert.match(sadness.deduction, /Sadness reads as weight/);
});

test("a factual question is not forced into an emotion", () => {
  const read = mapEmotion("willow bark");
  assert.equal(read.understood, false);
  assert.equal(read.emotion, "neutral");
  assert.equal(read.confidence, 0);
  assert.equal(read.deduction, null);
});

test("low emotion confidence still returns the knowledge answer", () => {
  const parsed = parseSemanticInput("willow bark");
  assert.equal(parsed.understood, false);
  assert.ok(parsed.linkedSymbols.includes("🧠"));
  const answer = semanticAnswer("willow bark");
  assert.equal(answer.answered, true);
  assert.equal(answer.emotion.understood, false);
  assert.match(answer.text.toLowerCase(), /willow/);
  assert.doesNotMatch(String(answer.hits[0].symbol).toLowerCase(), /suede/);
});

test("an understood feeling does not replace a useful answer", () => {
  const answer = evaluateTriggers("how do I carry drinking water");
  assert.equal(answer.emotion.understood, false);
  assert.equal(answer.answered, true);
  assert.match(answer.result.toLowerCase(), /water/);
  const felt = semanticAnswer("I am scared of the dark willow");
  assert.equal(felt.emotion.emotion, "fear");
  assert.equal(felt.answered, true);
  assert.match(felt.text.toLowerCase(), /willow|salix/);
});
