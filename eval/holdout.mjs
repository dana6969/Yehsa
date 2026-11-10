// Fresh questions, written after the product changes and not used to edit them.
// This is not part of eval/questions.mjs and does not change that rubric.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { judge, selfCheck } from "./score.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { ask } = await import("../symbolic/ask.js");

selfCheck();

const questions = [
  {
    id: "hold-soul",
    category: "spiritual",
    prompt: "What is the soul?",
    expect: { kind: "facts", all: ["this is what these texts say"], none: ["tundra", "arctic"] }
  },
  {
    id: "hold-salvation",
    category: "spiritual",
    prompt: "What is salvation?",
    expect: { kind: "facts", all: ["not a verdict"], none: ["tundra"] }
  },
  {
    id: "hold-daylight",
    category: "field",
    prompt: "How long can summer light last in arctic country?",
    expect: { kind: "facts", all: ["summer light"], none: ["not a verdict"] }
  },
  {
    id: "hold-boil",
    category: "paraphrase",
    prompt: "How do I make creek water safer by boiling it?",
    expect: { kind: "facts", all: ["boil"], none: ["watershed"] }
  },
  {
    id: "hold-parched",
    category: "paraphrase",
    prompt: "A hiker is parched after a climb. What should they do?",
    expect: { kind: "facts", all: ["drink"], none: ["camp cleanup", "repeated addition"] }
  },
  {
    id: "hold-pounds",
    category: "math",
    prompt: "Convert 4 pounds to ounces.",
    expect: { kind: "number", number: 64, tolerance: 0, all: [] }
  },
  {
    id: "hold-subtract",
    category: "math",
    prompt: "What is 15 minus 4?",
    expect: { kind: "number", number: 11, tolerance: 0, all: [] }
  },
  {
    id: "hold-f-to-c",
    category: "math",
    prompt: "What is 32 Fahrenheit in Celsius?",
    expect: { kind: "number", number: 0, tolerance: 0, all: [] }
  },
  {
    id: "hold-bone",
    category: "contradiction",
    prompt: "Is it correct to set a broken bone in the field?",
    expect: { kind: "facts", all: ["do not set", "contradicts that premise"], none: [] }
  },
  {
    id: "hold-japan",
    category: "unfamiliar",
    prompt: "What is the capital of Japan?",
    expect: { kind: "abstain" }
  },
  {
    id: "hold-asthma",
    category: "unfamiliar",
    prompt: "Which plant in the notes cures asthma?",
    expect: { kind: "abstain" }
  },
  {
    id: "hold-speed",
    category: "unfamiliar",
    prompt: "What is the speed of light in miles per hour?",
    expect: { kind: "abstain" }
  }
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
    text: String(result?.text || "").slice(0, 280)
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

const out = { generatedAt: new Date().toISOString(), count: rows.length, by, rows };
const file = path.join(ROOT, "eval", "holdout_results.json");
fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
const failed = rows.filter((row) => !row.pass);
console.log(JSON.stringify({ count: rows.length, passed: rows.length - failed.length, failed: failed.map((row) => ({ id: row.id, reason: row.reason, text: row.text })) }, null, 2));
