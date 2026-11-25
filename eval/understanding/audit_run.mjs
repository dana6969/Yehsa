// node eval/understanding/audit_run.mjs [out.json]
// Runs every audit question through Ask (the same lexical path the phone uses first) and checks
// that the top note is one of the right ones for the question's action and thing.
import fs from "node:fs";
import { ask, askWithMeaning } from "../../symbolic/ask.js";
import { modelAvailable } from "../../symbolic/meaning/embed_node.js";
import { auditSet } from "./audit_set.mjs";
import { routeAsk } from "../../symbolic/reasoning/ask_route.js";

export async function runAudit({ lexical = process.argv.includes("--lexical") } = {}) {
  const meaning = !lexical && modelAvailable();
  const rows = [];
  for (const item of auditSet()) {
    if (item.area === "history") {
      const kind = routeAsk(item.question, { entries: [], docs: [] })?.kind || null;
      rows.push({ ...item, got: kind, pass: (kind === "relation") === item.relation });
      continue;
    }
    const r = meaning ? await askWithMeaning(item.question, { agents: false }) : ask(item.question, { agents: false });
    const symbol = r?.answered ? r.symbol : null;
    // A hand-checked older note on the same topic counts too (the topic pattern is on the note's id).
    const onTopic = Boolean(symbol && item.topic && item.topic.test(String(symbol)));
    rows.push({ ...item, topic: item.topic ? String(item.topic) : undefined, got: symbol, pass: Boolean(symbol && (item.want.includes(symbol) || onTopic)) });
  }
  const byArea = {};
  for (const row of rows) {
    const a = (byArea[row.area] = byArea[row.area] || { n: 0, pass: 0 });
    a.n += 1;
    if (row.pass) a.pass += 1;
  }
  return { mode: meaning ? "meaning" : "lexical", total: rows.length, pass: rows.filter((r) => r.pass).length, byArea, rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await runAudit();
  for (const row of out.rows) if (!row.pass) console.log(`MISS ${row.id} | ${row.question} | got ${row.got} | want ${row.want.join("/")}`);
  console.log(JSON.stringify({ mode: out.mode, total: out.total, pass: out.pass, pct: +(100 * out.pass / out.total).toFixed(1), byArea: out.byArea }));
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (file) fs.writeFileSync(file, JSON.stringify(out, null, 1));
}
