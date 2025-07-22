import fs from "fs";

const queuePath = "./symbolic_memory/learning_queue.json";
const learnedPath = "./symbolic_memory/trainer_learned.json";

let queue = [], learned = [];
try { queue = JSON.parse(fs.readFileSync(queuePath, "utf-8")); } catch {}
if (fs.existsSync(learnedPath)) {
  try { learned = JSON.parse(fs.readFileSync(learnedPath, "utf-8")); } catch {}
}
const learnedMap = new Set(learned.map(e => e.symbol));

export async function trainSymbol(entry) {
  if (!entry?.symbol || typeof entry.symbol !== "string") return;
  if (!learnedMap.has(entry.symbol)) {
    const safe = { symbol: entry.symbol, context: entry.context || `auto:${entry.symbol}` };
    learned.push(safe);
    learnedMap.add(entry.symbol);
    fs.writeFileSync(learnedPath, JSON.stringify(learned, null, 2));
  }
}

if (import.meta.url.endsWith("symbolic_trainer.js")) {
  const ts = Date.now();
  const unlearned = queue.filter(e =>
    e.symbol && e.context &&
    typeof e.symbol === "string" &&
    typeof e.context === "string" &&
    !learnedMap.has(e.symbol)
  );
  console.log(`[TRAINER] Auto-training ${unlearned.length} symbol(s)...`);
  if (unlearned.length > 0) {
    learned.push(...unlearned);
    fs.writeFileSync(learnedPath, JSON.stringify(learned, null, 2));
  }
  console.log(`[TRAINER] Complete in ${Date.now() - ts} ms.`);
  console.log(`[TRAINER] Ready with ${queue.length} queued items.`);
}
