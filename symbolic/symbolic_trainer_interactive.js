import fs from "fs";
import readline from "readline";
import { executeSymbol } from "./symbolic_action_executor.js";
import { getDefinitions } from "./symbolic_dictionary.js";
import { isDirectRun } from "./direct_run.js";

const learnedPath = "./symbolic_memory/trainer_learned.json";

function loadLearned() {
  if (!fs.existsSync(learnedPath)) return [];
  const data = JSON.parse(fs.readFileSync(learnedPath, "utf8"));
  return Array.isArray(data) ? data : [];
}

function saveLearned(learned) {
  fs.writeFileSync(learnedPath, JSON.stringify(learned, null, 2));
}

export async function promptLearnedSymbols(memory) {
  const learned = loadLearned();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pending = memory.filter((entry) => entry?.symbol && !learned.some((item) => item.symbol === entry.symbol && item.context));

  async function ask(index = 0) {
    if (index >= pending.length) {
      rl.close();
      return;
    }
    const symbol = pending[index].symbol;
    const defs = getDefinitions(symbol);
    if (defs.length) console.log(`[🗣️ Prompt Assist] Try responding with context like:`, defs[0]);
    rl.question(`[?] Symbol: "${symbol}" — Enter response: `, async (response) => {
      const existing = learned.find((item) => item.symbol === symbol);
      if (existing) existing.context = response;
      else learned.push({ symbol, context: response });
      saveLearned(learned);
      fs.appendFileSync("./symbolic_memory/learn_log.json", `${JSON.stringify({ symbol, defs })}\n`);
      executeSymbol(symbol);
      await ask(index + 1);
    });
  }

  console.log(`[trainer] ${pending.length} symbols without context. Ctrl+C to stop.`);
  await ask(0);
}

if (isDirectRun(import.meta.url)) {
  const memory = JSON.parse(fs.readFileSync("./symbolic_memory/learning_queue.json", "utf8"));
  promptLearnedSymbols(Array.isArray(memory) ? memory : []);
}
