// Score the paraphrase development set. Not used by the frozen v1 runner or the gate.
// Pass --lexical to score Ask without the meaning matcher.
import fs from "fs";
import { ask, askWithMeaning } from "../symbolic/ask.js";
import { classifyOutcome, judge, tallyOutcomes } from "./score.mjs";
import { PARAPHRASE_SET } from "./paraphrase_set.mjs";

const lexicalOnly = process.argv.includes("--lexical") || Boolean(process.env.YEHSA_MEANING_OFF);
const outIndex = process.argv.indexOf("--out");
const items = [];
for (const question of PARAPHRASE_SET) {
  const result = lexicalOnly
    ? ask(question.prompt, { agents: false })
    : await askWithMeaning(question.prompt, { agents: false });
  const scored = judge(question, result);
  const outcome = classifyOutcome(question, { ...result, ...scored });
  items.push({ id: question.id, category: question.category, expectKind: question.expect.kind, outcome, pass: scored.pass, reason: scored.reason, text: result.text, kind: result.kind || null, symbol: result.symbol || null });
  if (!scored.pass) {
    const shown = String(result.text || "(silent)").replace(/\s+/g, " ").slice(0, 160);
    console.log(`FAIL ${question.id} ${scored.reason}: ${shown}`);
  }
}
const breakdown = tallyOutcomes(items);
console.log(JSON.stringify({ mode: lexicalOnly ? "lexical" : "meaning", questions: PARAPHRASE_SET.length, ...breakdown }, null, 2));
if (outIndex > 0) fs.writeFileSync(process.argv[outIndex + 1], JSON.stringify({ breakdown, items }, null, 2));
