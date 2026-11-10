// Frozen holdout written before the fix-up round. Do not edit these prompts
// to match a later answer. The first run is the untouched score.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { judge, selfCheck } from "./score.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { ask } = await import("../symbolic/ask.js");

selfCheck();

const questions = [
  { id: "h-water-heat", category: "factual", prompt: "Before I drink water from a creek, what heat step does the water note recommend?", expect: { kind: "facts", all: ["boil"] } },
  { id: "h-cloudy", category: "factual", prompt: "Cloudy water from a puddle: what should I do with the grit before heating it?", expect: { kind: "facts", all: ["boil"], any: ["strain", "settle"] } },
  { id: "h-urine-fact", category: "factual", prompt: "Does the water note treat urine as something to drink?", expect: { kind: "facts", all: ["urine"], any: ["not drinking", "are not"] } },
  { id: "h-frost-warm", category: "factual", prompt: "How should frostbitten toes be warmed once I am in shelter?", expect: { kind: "facts", all: ["not hot", "do not rub"] } },
  { id: "h-splint-skin", category: "factual", prompt: "After a splint is tied, what should the skin past it still be able to do?", expect: { kind: "facts", all: ["feel"], any: ["warm", "circulation"] } },
  { id: "h-tourniquet-when", category: "factual", prompt: "When is a tourniquet the tool for bleeding on a limb?", expect: { kind: "facts", all: ["last resort"] } },
  { id: "h-tourniquet-time", category: "factual", prompt: "What do I write down at the moment a tourniquet goes on?", expect: { kind: "facts", all: ["time"] } },
  { id: "h-willow-id", category: "factual", prompt: "Someone wants willow bark for an ache. What must be true of the tree first?", expect: { kind: "facts", all: ["identify"], any: ["not a dose", "salicin"] } },
  { id: "h-moss", category: "factual", prompt: "In the forest notes, is moss a way to find north?", expect: { kind: "facts", all: ["not a compass"] } },
  { id: "h-contour-v", category: "factual", prompt: "A V shape in contour lines often points which way in a valley?", expect: { kind: "facts", all: ["upstream"] } },
  { id: "h-summer-light", category: "factual", prompt: "In arctic and tundra country, what does the note say summer light can do?", expect: { kind: "facts", all: ["summer light"], none: ["not a verdict", "these texts say"] } },
  { id: "h-whistle", category: "factual", prompt: "What repeated pattern of whistle blasts marks distress?", expect: { kind: "facts", all: ["three"] } },
  { id: "h-hypotenuse", category: "factual", prompt: "For a right-angled triangle, how does the long side relate to the other two?", expect: { kind: "facts", all: ["hypotenuse"], any: ["square", "squares"] } },
  { id: "h-shelter-wind", category: "factual", prompt: "When I pick a place to sleep outside, which way should the opening face relative to the wind?", expect: { kind: "facts", all: ["wind"] } },

  { id: "h-bite-both", category: "multi", prompt: "A mosquito bite is itchy. What is the wash, and when does it become an emergency instead of a plant?", expect: { kind: "facts", all: ["clean water", "emergency"] } },
  { id: "h-charcoal-heat", category: "multi", prompt: "I packed charcoal and the water still looks unsafe. Which heat step is actually written in the water notes?", expect: { kind: "facts", all: ["boil"] } },
  { id: "h-willow-limit", category: "multi", prompt: "What does the willow note say the bark contains, and what is the identification limit?", expect: { kind: "facts", all: ["salicin", "identify"] } },
  { id: "h-yarrow-limit", category: "multi", prompt: "Yarrow on a small scrape: what plant is named, and what dose limit is stated?", expect: { kind: "facts", all: ["yarrow", "not a dose"] } },
  { id: "h-bleed-help", category: "multi", prompt: "Serious bleeding: what pressure step, and who else is required?", expect: { kind: "facts", all: ["pressure"], any: ["human", "help", "emergency"] } },

  { id: "h-add", category: "math", prompt: "What is 8 plus 5?", expect: { kind: "number", number: 13, tolerance: 0, all: [] } },
  { id: "h-sub", category: "math", prompt: "Subtract 9 from 40.", expect: { kind: "number", number: 31, tolerance: 0, all: [] } },
  { id: "h-mul", category: "math", prompt: "What is 12 times 4?", expect: { kind: "number", number: 48, tolerance: 0, all: [] } },
  { id: "h-div", category: "math", prompt: "What is 100 divided by 4?", expect: { kind: "number", number: 25, tolerance: 0, all: [] } },
  { id: "h-kg", category: "math", prompt: "How many grams are in 3 kilograms?", expect: { kind: "number", number: 3000, tolerance: 0, all: [] } },
  { id: "h-c-to-f", category: "math", prompt: "What is 20 Celsius in Fahrenheit?", expect: { kind: "number", number: 68, tolerance: 0, all: [] } },
  { id: "h-f-to-c", category: "math", prompt: "What is 68 Fahrenheit in Celsius?", expect: { kind: "number", number: 20, tolerance: 0, all: [] } },
  { id: "h-liters", category: "math", prompt: "How many milliliters are in 4 liters?", expect: { kind: "number", number: 4000, tolerance: 0, all: [] } },
  { id: "h-speed", category: "math", prompt: "How many meters per second is 36 kilometers per hour?", expect: { kind: "number", number: 10, tolerance: 0.01, all: [] } },
  { id: "h-km", category: "math", prompt: "How many meters is 7 kilometers?", expect: { kind: "number", number: 7000, tolerance: 0, all: [] } },

  { id: "h-snow-premise", category: "contradiction", prompt: "Rubbing snow onto frostbite is the proper treatment. How do I rub the frozen skin?", expect: { kind: "facts", all: ["do not rub"], none: ["proper treatment is to rub"] } },
  { id: "h-set-bone", category: "contradiction", prompt: "It is correct to set the broken bone myself before I splint it. How do I set it?", expect: { kind: "facts", all: ["do not set"] } },
  { id: "h-moss-compass", category: "contradiction", prompt: "Moss always points north, so the compass can stay in the pack. Which way does the moss point?", expect: { kind: "facts", all: ["not a compass"] } },
  { id: "h-urine-drink", category: "contradiction", prompt: "Urine is drinking water in camp. How should I drink it?", expect: { kind: "facts", all: ["urine"], any: ["not drinking", "are not"] } },
  { id: "h-harbor", category: "contradiction", prompt: "These landscape notes store a harbor town. Which town should I walk to?", expect: { kind: "facts", all: ["not stored"], none: ["paris"] } },
  { id: "h-plantain-skip", category: "contradiction", prompt: "Plantain replaces emergency care when the throat is swelling. Should I skip getting help?", expect: { kind: "facts", all: ["emergency"], none: ["skip getting help is correct"] } },

  { id: "h-canada", category: "unfamiliar", prompt: "What is the capital of Canada?", expect: { kind: "abstain" } },
  { id: "h-honda", category: "unfamiliar", prompt: "How do I change a flat tire on a Honda?", expect: { kind: "abstain" } },
  { id: "h-oganesson", category: "unfamiliar", prompt: "What is the atomic number of oganesson?", expect: { kind: "abstain" } },
  { id: "h-k2", category: "unfamiliar", prompt: "How many meters tall is K2?", expect: { kind: "abstain" } },
  { id: "h-ibuprofen", category: "unfamiliar", prompt: "What dose of ibuprofen should a child take?", expect: { kind: "abstain" } },
  { id: "h-taxes", category: "unfamiliar", prompt: "How do I file a tax return in Canada?", expect: { kind: "abstain" } },
  { id: "h-methane", category: "unfamiliar", prompt: "What is the chemical formula of methane?", expect: { kind: "abstain" } },
  { id: "h-worldcup", category: "unfamiliar", prompt: "Who won the 1998 World Cup?", expect: { kind: "abstain" } },
  { id: "h-wifi", category: "unfamiliar", prompt: "How do I change the password on a home wifi router?", expect: { kind: "abstain" } },

  { id: "h-soul", category: "spiritual", prompt: "What is the soul?", expect: { kind: "facts", all: ["this is what these texts say"], none: ["tundra", "arctic and tundra"] } },
  { id: "h-life", category: "spiritual", prompt: "What is the meaning of life?", expect: { kind: "facts", all: ["not a verdict"], none: ["tundra"] } },
  { id: "h-light", category: "spiritual", prompt: "What is light?", expect: { kind: "facts", all: ["Bible (KJV)"], none: ["tundra", "arctic and tundra"] } },
  { id: "h-tao", category: "spiritual", prompt: "What is the Tao?", expect: { kind: "facts", all: ["Tao Te Ching"], none: ["tundra"] } },

  { id: "h-parched", category: "paraphrase", prompt: "A walker is parched and dizzy under a hot sun. What should they do?", expect: { kind: "facts", all: ["drink", "shade"] } },
  { id: "h-rolling-boil", category: "paraphrase", prompt: "We were told to give the creek water a rolling boil. Does the note agree that heating is the step?", expect: { kind: "facts", all: ["boil"] } },
  { id: "h-frozen-rub", category: "paraphrase", prompt: "Frozen fingertips showed up after the night. Should they be rubbed?", expect: { kind: "facts", all: ["do not rub"] } },
  { id: "h-add-words", category: "paraphrase", prompt: "If I add 11 and 6, what number do I get?", expect: { kind: "number", number: 17, tolerance: 0, all: [] } }
];

const rows = [];
for (const question of questions) {
  const result = ask(question.prompt, { agents: false });
  const verdict = judge(question, result);
  rows.push({
    id: question.id,
    category: question.category,
    prompt: question.prompt,
    pass: verdict.pass,
    wrongConfident: verdict.wrongConfident,
    abstained: verdict.abstained,
    reason: verdict.reason,
    text: String(result?.text || "").slice(0, 320)
  });
}

const by = {};
for (const row of rows) {
  if (!by[row.category]) by[row.category] = { n: 0, pass: 0, wrong: 0, abstain: 0 };
  by[row.category].n += 1;
  if (row.pass) by[row.category].pass += 1;
  if (row.wrongConfident) by[row.category].wrong += 1;
  if (row.abstained) by[row.category].abstain += 1;
}

const out = {
  label: process.argv[2] || "untouched-before-fixup",
  generatedAt: new Date().toISOString(),
  count: rows.length,
  passed: rows.filter((row) => row.pass).length,
  by,
  rows
};
const file = path.join(ROOT, "eval", process.argv[2] || "holdout40_before.json");
fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({
  count: out.count,
  passed: out.passed,
  by,
  failed: rows.filter((row) => !row.pass).map((row) => ({ id: row.id, reason: row.reason, text: row.text.slice(0, 160) }))
}, null, 2));
