// Round 5: field dressing / game care guides answer the questions Dana asked,
// camera species notes offer the matching guide, and the generic bear-safety
// card does not steal a "field dress a bear" question.
import assert from "node:assert/strict";
import test from "node:test";
import { ask } from "./symbolic/ask.js";
import { entryFor, relatedOffer } from "./symbolic/entries.js";
import { routeFieldGuide } from "./symbolic/field_guide.js";
import { CAMERA_NOTES } from "./symbolic/camera_notes.js";
import manifest from "./assets/pictures/manifest.json" with { type: "json" };
import { guideView, picturesFor } from "./symbolic/picture_guide.js";

const QUESTIONS = [
  ["how do I field dress a deer", "field_dressing_deer"],
  ["gut a turkey", "field_dressing_turkey"],
  ["clean a rabbit", "field_dressing_rabbit"],
  ["quarter an elk", "gutless_method"],
  ["How do I field dress a black bear?", "field_dressing_black_bear"],
  ["field dress a wild boar", "field_dressing_wild_hog"],
  ["field dress a moose", "field_dressing_moose"],
  ["field dress a pronghorn", "field_dressing_pronghorn"],
  ["clean a squirrel", "field_dressing_squirrel"],
  ["gut a pheasant", "field_dressing_upland_birds"],
  ["dress a duck", "field_dressing_waterfowl"],
  ["how to clean a fish", "fish_cleaning_spoilage"],
  ["What temperature should I cook venison to?", "game_cooking_temps"],
  ["Tell me about white spots on the liver", "game_disease_field_signs"],
  ["Tell me about evidence of sex", "evidence_of_sex_tag"],
  ["What do I need to field dress game?", "field_dress_tools"]
];

test("Ask lands on the field dressing guide for the common game-care questions", () => {
  for (const [question, symbol] of QUESTIONS) {
    const result = ask(question, { agents: false });
    assert.equal(result.symbol, symbol, `${question} -> ${result.symbol || "no answer"} (want ${symbol})`);
    assert.equal(result.answered, true, question);
  }
});

test("the generic bear-safety guide still answers a bear-country question", () => {
  assert.equal(routeFieldGuide("How do I field dress a black bear?"), null);
  assert.equal(routeFieldGuide("how do I stay safe around bears?"), "bears");
  assert.equal(ask("how do I stay safe around bears?", { agents: false }).symbol, "guide_bears");
});

test("venison cooks to 160 and bear or hog to 165, from official charts", () => {
  const temps = ask("Tell me about venison temperature", { agents: false }).text;
  assert.match(temps, /160/);
  assert.match(temps, /165/);
  const bear = ask("How do I field dress a black bear?", { agents: false }).text;
  assert.match(bear, /165/);
  assert.match(bear, /Trichinella/i);
  const hog = ask("field dress a wild boar", { agents: false }).text;
  assert.match(hog, /brucellosis/i);
  assert.match(hog, /165/);
  assert.match(hog, /glove/i);
});

test("camera labels for game species offer the matching dressing guide", () => {
  const links = {
    white_tailed_deer: "field_dressing_deer",
    elk: "field_dressing_elk",
    moose: "field_dressing_moose",
    black_bear: "field_dressing_black_bear",
    wild_boar: "field_dressing_wild_hog",
    snowshoe_hare: "field_dressing_rabbit",
    wild_turkey: "field_dressing_turkey",
    ruffed_grouse: "field_dressing_upland_birds",
    canada_goose: "field_dressing_waterfowl"
  };
  for (const [label, guide] of Object.entries(links)) {
    assert.equal(CAMERA_NOTES[label], label, label);
    const entry = entryFor(label);
    assert.ok(entry, label);
    assert.ok((entry.rel || []).includes(guide), `${label} should relate to ${guide}`);
    const offer = relatedOffer(label);
    assert.equal(offer?.entry, guide, `${label} offer -> ${offer?.entry}`);
  }
});

test("waterfowl and rabbit answers carry the legal or disease warning", () => {
  const duck = ask("dress a duck", { agents: false }).text;
  assert.match(duck, /wing/i);
  const rabbit = ask("clean a rabbit", { agents: false }).text;
  assert.match(rabbit, /tularemia/i);
  assert.match(rabbit, /glove/i);
});


test("the picture guide lists the field dressing pack under hunting, with credited photos", () => {
  const hunting = guideView(manifest, { domain: "hunting" });
  const symbols = new Set(hunting.map((entry) => entry.symbol));
  for (const id of ["field_dressing_deer", "gutless_method", "field_dressing_black_bear", "fish_cleaning_spoilage", "game_cooking_temps"]) {
    assert.ok(symbols.has(id), id);
  }
  const deer = picturesFor(manifest, "field_dressing_deer");
  assert.ok(deer.some((image) => image.role === "process" && /public domain/i.test(image.license)));
  assert.ok(deer.every((image) => image.author && image.sourceUrl && image.attribution));
});
