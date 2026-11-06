import assert from "node:assert/strict";
import fs from "fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { recallKnowledge } from "./symbolic/knowledge_index.js";
import { parseQuestion } from "./symbolic/question_parse.js";
import { ask } from "./symbolic/ask.js";
import { askField } from "./symbolic/phone_field.js";

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

test("a plant question keeps the bite notes and does not garble the topic", () => {
  const parsed = parseQuestion("What plants help with mosquito bites?");
  assert.equal(parsed.topic, "mosquito bites");
  assert.ok(parsed.concerns.includes("plant"));
  assert.ok(parsed.concerns.includes("insect"));
  const answer = ask("What plants help with mosquito bites?");
  assert.equal(answer.answered, true);
  assert.match(answer.text, /plantain|Plantago/);
  assert.match(answer.text, /clean water/i);
  assert.match(answer.text, /mosquito/i);
  assert.match(answer.text, /emergency|breathing|swelling/i);
  assert.doesNotMatch(answer.text, /plants help/i);
  assert.doesNotMatch(answer.text, /For a plants/);
  const keyword = ask("plants for mosquitoes");
  assert.equal(keyword.answered, true);
  assert.match(keyword.text, /plantain|Plantago/);
  assert.match(keyword.text, /mosquito/i);
  assert.doesNotMatch(keyword.text, /plants mosquitoes/i);
});

test("iodine is not answered with the auxiliary would", () => {
  const parsed = parseQuestion("When would I use iodine in the field?");
  assert.equal(parsed.topic, "iodine");
  const answer = ask("When would I use iodine in the field?");
  assert.equal(answer.answered, true);
  assert.match(answer.text, /iodine|iodide|halogen/i);
  assert.doesNotMatch(answer.text, /auxiliary verb/i);
});

test("charcoal for safer water uses the water notes, not a watershed", () => {
  const answer = ask("How do I use charcoal to make water safer?");
  assert.equal(answer.answered, true);
  assert.match(answer.text, /boil/i);
  assert.doesNotMatch(answer.text, /watershed/i);
  assert.doesNotMatch(answer.text, /drains to one stream/i);
});

test("dehydration uses the drinking note instead of the dictionary gloss", () => {
  const answer = ask("What should I do for dehydration?");
  assert.equal(answer.answered, true);
  assert.match(answer.text, /dehydration/i);
  assert.match(answer.text, /drink|sweat|dizzy|shade/i);
  assert.doesNotMatch(answer.text, /freeing from water/i);
});

test("a question the notes do not answer stays a miss", () => {
  const capital = ask("What is the capital of France?");
  assert.equal(capital.answered, false);
  assert.equal(capital.text, null);
  const strike = ask("How do I summon a helicopter strike?");
  assert.equal(strike.answered, false);
  assert.equal(strike.text, null);
});

test("tourniquet, frostbite, splint, and yarrow answer from field notes", () => {
  const passages = JSON.parse(fs.readFileSync("symbolic_memory/books_index.json", "utf8")).passages;
  const cases = [
    {
      q: "How do I use a tourniquet?",
      kind: "medical",
      symbol: "tourniquet_last_resort",
      need: [/last resort/i, /life-threatening/i, /note the time/i, /direct pressure/i],
      gloss: /essentiallyof|istightened/
    },
    {
      q: "How do I treat frostbite?",
      kind: "medical",
      symbol: "frostbite_warming",
      need: [/do not rub snow/i, /not hot/i, /thawed foot/i],
      gloss: /thebody|Kane/
    },
    {
      q: "How do I splint a broken arm?",
      kind: "medical",
      symbol: "splint_immobilize",
      need: [/pad/i, /circulation/i, /do not set the bone/i, /broken arm/i],
      gloss: /whenset|inplace/
    },
    {
      q: "What is yarrow used for?",
      kind: "herbology",
      symbol: "yarrow_achillea",
      need: [/identified/i, /not a dose/i, /emergency care/i, /yarrow/i],
      gloss: /corymbed|Millefolium\)with/
    }
  ];
  for (const item of cases) {
    const answer = ask(item.q);
    const phone = askField(item.q, passages);
    assert.equal(answer.answered, true, item.q);
    assert.equal(answer.kind, item.kind, item.q);
    assert.equal(answer.symbol, item.symbol, item.q);
    assert.equal(phone.text, answer.text, item.q);
    for (const pattern of item.need) assert.match(answer.text, pattern, item.q);
    assert.doesNotMatch(answer.text, item.gloss, item.q);
    assert.notEqual(answer.hits[0].kind, "dictionary", item.q);
  }
});

test("a watershed question still reads the landscape note", () => {
  const answer = ask("What is a watershed?");
  assert.equal(answer.answered, true);
  assert.match(answer.text, /drains to one stream/i);
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
