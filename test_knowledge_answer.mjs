import assert from "node:assert/strict";
import fs from "fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { recallKnowledge } from "./symbolic/knowledge_index.js";
import { parseQuestion } from "./symbolic/question_parse.js";
import { ask } from "./symbolic/ask.js";

test("getMappedAction stays a direct map read", () => {
  const src = fs.readFileSync("symbolic/symbolic_dictionary.js", "utf8");
  const start = src.indexOf("export function getMappedAction");
  const body = src.slice(start, start + 160);
  assert.match(body, /return symbolMap\[symbol\] \|\| null;/);
  assert.doesNotMatch(body, /recallKnowledge|semanticAnswer|trainer_learned/);
});

test("willow bark is a multi-source answer, not the suede gloss", () => {
  const answer = recallKnowledge("willow bark");
  assert.ok(answer);
  assert.ok(Array.isArray(answer.hits));
  assert.ok(answer.hits.length >= 2);
  const lead = `${answer.symbol} ${answer.hits[0].symbol}`.toLowerCase();
  assert.match(lead, /willow/);
  assert.doesNotMatch(lead, /suede/);
  assert.match(answer.text.toLowerCase(), /willow/);
  assert.match(answer.text.toLowerCase(), /analgesic|ache|salicin/);
  assert.doesNotMatch(answer.text, / \| /);
  assert.doesNotMatch(answer.text, /forsaken|Sir W/);
  const kinds = new Set(answer.hits.map((hit) => hit.kind));
  assert.ok(kinds.has("dictionary"));
  assert.equal(answer.hits.some((hit) => String(hit.symbol).toLowerCase() === "suede"), false);
});

test("plantain prefers the herbology note", () => {
  const answer = recallKnowledge("plantain poultice");
  assert.ok(answer);
  assert.equal(answer.hits[0].kind, "herbology");
  assert.match(String(answer.source), /herbology/);
  assert.match(answer.text.toLowerCase(), /plantain|plantago/);
  assert.ok(answer.hits.length >= 1);
});

test("a full survival question is parsed and answered from several sources", () => {
  const raw = "What can willow bark be used for in a survival setting?";
  const parsed = parseQuestion(raw);
  assert.equal(parsed.isQuestion, true);
  assert.equal(parsed.intent, "use");
  assert.equal(parsed.topic, "willow bark");
  assert.equal(parsed.domain, "survival");
  const answer = ask(raw);
  assert.equal(answer.answered, true);
  assert.equal(answer.question.topic, "willow bark");
  assert.match(answer.symbol.toLowerCase(), /willow/);
  assert.doesNotMatch(answer.symbol.toLowerCase(), /suede/);
  assert.match(answer.text.toLowerCase(), /willow/);
  assert.match(answer.text.toLowerCase(), /survival/);
  assert.match(answer.text.toLowerCase(), /analgesic|ache|salicin/);
  assert.doesNotMatch(answer.text, / \| /);
  assert.doesNotMatch(answer.text, /forsaken|Sir W/);
  assert.notEqual(answer.hits[0].kind, "dictionary");
  assert.ok(answer.hits.length >= 2);
  const kinds = new Set(answer.hits.map((hit) => hit.kind));
  assert.ok(kinds.has("dictionary"));
  assert.ok(kinds.has("herbology") || kinds.has("survival") || kinds.has("medical"));
  assert.equal(answer.hits.some((hit) => String(hit.symbol).toLowerCase() === "suede"), false);
  const cli = spawnSync(process.execPath, ["symbolic/ask.js", raw], {
    cwd: path.dirname(new URL(import.meta.url).pathname),
    encoding: "utf8"
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout.trim(), answer.text);
  assert.doesNotMatch(cli.stdout.trim(), /^\{/);
});

test("a plant care question is one answer joined across notes", () => {
  const raw = "How do I treat a mosquito bite with plants?";
  const parsed = parseQuestion(raw);
  assert.equal(parsed.isQuestion, true);
  assert.equal(parsed.intent, "care");
  assert.equal(parsed.topic, "mosquito bite");
  assert.ok(parsed.concerns.includes("plant"));
  assert.ok(parsed.concerns.includes("insect"));
  assert.ok(parsed.concerns.includes("skin"));
  const answer = ask(raw);
  assert.equal(answer.answered, true);
  assert.equal(answer.emotion.understood, false);
  assert.equal(answer.emotion.emotion, "neutral");
  assert.match(answer.text, /plantain|Plantago/);
  assert.match(answer.text, /clean water/i);
  assert.match(answer.text, /identif/i);
  assert.match(answer.text, /emergency|breathing|swelling/i);
  assert.match(answer.text, /mosquito/i);
  assert.doesNotMatch(answer.text, / \| /);
  assert.doesNotMatch(answer.text, /\nAlso:/);
  assert.doesNotMatch(answer.text, /\{/);
  const kinds = new Set(answer.hits.map((hit) => hit.kind));
  assert.ok(kinds.has("herbology"));
  assert.ok(kinds.has("medical"));
  assert.ok(kinds.has("survival"));
  assert.notEqual(answer.hits[0].kind, "dictionary");
});

test("survival and math questions stay on those corpora", () => {
  const water = recallKnowledge("how do I carry drinking water");
  assert.ok(water);
  assert.ok(water.hits.some((hit) => hit.kind === "survival"));
  assert.match(water.text.toLowerCase(), /water/);

  const triangle = recallKnowledge("what is a triangle");
  assert.ok(triangle);
  assert.equal(triangle.hits[0].kind, "math");
  assert.match(triangle.text.toLowerCase(), /triangle/);
});
