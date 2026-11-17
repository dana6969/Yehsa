// Score the development set. Not used by the frozen v1 runner or the gate.
import { ask, askWithMeaning } from "../symbolic/ask.js";
import { modelAvailable } from "../symbolic/meaning/embed_node.js";
import { classifyOutcome, judge, tallyOutcomes } from "./score.mjs";
import { DEV_SET } from "./dev_set.mjs";

// Pass --lexical (or set YEHSA_MEANING_OFF=1) to score without the meaning matcher.
const useMeaning = !process.argv.includes("--lexical") && modelAvailable();
const long = [];
for (const question of DEV_SET) {
  const result = useMeaning ? await askWithMeaning(question.prompt, { agents: false }) : ask(question.prompt, { agents: false });
  const scored = judge(question, result);
  const outcome = classifyOutcome(question, { ...result, ...scored });
  long.push({
    id: question.id,
    category: question.category,
    outcome,
    pass: scored.pass,
    reason: scored.reason,
    text: result.text
  });
  if (!scored.pass) {
    const shown = String(result.text || "(silent)").replace(/\s+/g, " ").slice(0, 180);
    console.log(`FAIL ${question.id} ${scored.reason}: ${shown}`);
  }
}

const breakdown = tallyOutcomes(long.map((item) => ({ ...item, expectKind: DEV_SET.find((q) => q.id === item.id).expect.kind })));
console.log(JSON.stringify({ mode: useMeaning ? "meaning" : "lexical", questions: DEV_SET.length, ...breakdown }, null, 2));
if (breakdown.incorrectConfident || breakdown.incorrectHedged || breakdown.unnecessaryRefusal || breakdown.total !== DEV_SET.length) {
  process.exitCode = 1;
}
