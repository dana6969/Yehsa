// R9: question understanding (action + animal), follow-ups, pictures, and the two-sided history route.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { R9_FLOWS, runR9Flows } from "./eval/dev_r9_flows.mjs";
import { understand } from "./symbolic/understanding/understand.js";
import { intentAnswer } from "./symbolic/understanding/pick.js";
import { entitiesIn } from "./symbolic/understanding/taxonomy.js";
import { nextOffer } from "./symbolic/understanding/followups.js";
import { relationQuestion } from "./symbolic/reasoning/relation.js";
import { cleanQuote } from "./symbolic/reasoning/quote_clean.js";
import { onSubject, subjectTerms } from "./symbolic/scripture_guard.js";
import { routeAsk } from "./symbolic/reasoning/ask_route.js";
import { libraryList } from "./symbolic/library/library.js";
import { DOCS } from "./eval/dev_r8_flows.mjs";
import { buildQuestions } from "./eval/questions.mjs";
import { DEV_SET } from "./eval/dev_set.mjs";
import { PARAPHRASE_SET } from "./eval/paraphrase_set.mjs";
import { loadRegressionV1 } from "./eval/regression/v1/load.mjs";

test("Dana's 25 Nov screenshot flows all pass", () => {
  const results = runR9Flows();
  assert.equal(results.length, R9_FLOWS.length);
  for (const r of results) assert.ok(r.pass, `${r.id}: ${r.why}`);
});

test("a question is read as an action and an animal, with its group", () => {
  const u = understand("How to gut a partridge");
  assert.equal(u.action, "dress");
  assert.equal(u.entity, "partridge");
  assert.deepEqual(u.groups, ["upland_bird", "bird", "game"]);
  for (const [q, action] of [["how do I field dress a chukar", "dress"], ["eviscerate a woodcock", "dress"], ["dress out a mallard", "dress"], ["how to pluck a pheasant", "pluck"], ["what temperature for duck", "cook"], ["make venison jerky", "preserve"], ["what do rabbit tracks look like", "track"]]) {
    assert.equal(understand(q).action, action, q);
  }
  assert.equal(understand("how do I clean a cut").action, null, "cleaning a wound is not field care");
  assert.equal(entitiesIn("steps for gutting teals")[0].entity, "duck");
  assert.equal(entitiesIn("hungarian partridge")[0].entity, "partridge");
});

test("the group note stands in for a missing species and says so in one line", () => {
  const a = intentAnswer("How to gut a partridge");
  assert.equal(a.symbol, "field_dressing_upland_birds");
  assert.match(a.text.split("\n")[0], /^Partridge \(gray or Hungarian partridge, chukar.*\) is handled like other upland birds:$/);
  assert.equal(intentAnswer("how do I gut a pheasant").text.split("\n")[0].startsWith("Field dressing grouse"), true, "a named species gets no stand-in line");
  assert.equal(intentAnswer("how do I field dress a caribou").symbol, "field_dressing_deer");
  assert.equal(intentAnswer("what does a pheasant look like"), null, "an ID question never borrows another bird's card");
  assert.equal(intentAnswer("what is the tao"), null);
});

test("field dressing birds gives the upland and waterfowl steps in full", () => {
  const a = intentAnswer("Tell me about field dressing birds");
  assert.match(a.text, /Field dressing grouse, pheasant, and quail:\n1\. Put on gloves/);
  assert.match(a.text, /Field dressing ducks and geese:\n1\. /);
  assert.match(a.text, /Field dressing a turkey \(ask "How do I gut a turkey\?"\)/);
});

test("follow-ups skip the topic just answered and stay on the same sort of animal", () => {
  for (const id of ["field_dressing_upland_birds", "field_dressing_birds", "field_dressing_waterfowl", "field_dressing_turkey"]) {
    const { offer } = nextOffer(id);
    assert.ok(offer, id);
    assert.doesNotMatch(`${offer.label} ${offer.ask}`, /venison|deer|field dressing birds/i, id);
  }
  assert.match(nextOffer("field_dressing_deer").offer.label, /venison/);
  assert.equal(nextOffer("field_dressing_upland_birds", ["game_cooking_temps"]).offer?.entry === "game_cooking_temps", false, "an answered note is not offered again");
});

test("quotes read cleanly", () => {
  assert.equal(cleanQuote("not sur- prising"), "not surprising");
  assert.equal(cleanQuote("a well- known road"), "a well-known road");
  assert.equal(cleanQuote("\u201cHe went"), "He went");
});

test("a book-title word is not a scripture subject without scripture context", () => {
  assert.deepEqual(subjectTerms("Muslim and romans"), ["muslim"]);
  assert.ok(subjectTerms("Romans chapter 8").includes("romans"));
  assert.deepEqual(onSubject("Muslim and romans", [{ text: "they heard that they were Romans" }]), []);
});

test("two-sided history questions are recognised, field pairs are not", () => {
  assert.deepEqual(relationQuestion("Muslim and romans").labels, ["Muslims", "Romans"]);
  assert.ok(relationQuestion("Vikings vs Saxons"));
  assert.ok(relationQuestion("what was the relationship between the Greeks and the Persians?"));
  for (const q of ["deer and elk", "fire and water", "salt and pepper", "kings and queens"]) assert.equal(relationQuestion(q), null, q);
});

test("no eval, dev, paraphrase or frozen v1 question takes the history route", () => {
  const ctx = { entries: libraryList({ docs: DOCS }), docs: DOCS };
  const all = [...buildQuestions().map((q) => q.prompt), ...DEV_SET.map((q) => q.prompt), ...PARAPHRASE_SET.map((q) => q.prompt), ...loadRegressionV1().questions.map((q) => q.prompt || q.question)].filter(Boolean);
  assert.deepEqual(all.filter((q) => routeAsk(q, ctx)?.kind === "relation"), []);
});

test("the understanding layer stays off the hot path and offline", () => {
  for (const f of ["symbolic/understanding/understand.js", "symbolic/understanding/pick.js", "symbolic/understanding/profiles.js", "symbolic/understanding/followups.js", "symbolic/understanding/taxonomy.js", "symbolic/reasoning/relation.js", "symbolic/scripture_guard.js"]) {
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /\bfetch\(|XMLHttpRequest|WebSocket|anthropic|openai/i, f);
  }
  assert.doesNotMatch(fs.readFileSync("symbolic/symbolic_dictionary.js", "utf8").slice(0, 4000), /understanding\//);
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(app, /route\?\.kind === "relation"/);
  assert.match(app, /relationClarify\(route\.relation\)/);
});
