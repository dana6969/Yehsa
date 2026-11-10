// Score the development set. Not used by the frozen v1 runner or the gate.
import { ask } from "../symbolic/ask.js";
import { classifyOutcome, judge, tallyOutcomes } from "./score.mjs";
import { DEV_SET } from "./dev_set.mjs";

const long = [];
for (const question of DEV_SET) {
  const result = ask(question.prompt, { agents: false });
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
console.log(JSON.stringify({ questions: DEV_SET.length, ...breakdown }, null, 2));
if (breakdown.incorrectConfident || breakdown.incorrectHedged || breakdown.unnecessaryRefusal || breakdown.total !== DEV_SET.length) {
  process.exitCode = 1;
}
