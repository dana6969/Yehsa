import fs from "fs";
import { execute } from "./symbolic_action_executor.js";

const queuePath = "./symbolic_memory/learning_queue.json";
const logPath = "./symbolic_memory/executed_log.json";

if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, "[]");

const memory = JSON.parse(fs.readFileSync(queuePath, "utf-8")).filter(e => typeof e.symbol === "string");
const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));

for (const item of memory) {
  if (!log.find(e => e.symbol === item.symbol)) {
    console.log(`⚡ Executing symbol: "${item.symbol}"`);
    execute(item.symbol);
    log.push({ symbol: item.symbol, ts: Date.now() });
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    await new Promise(res => setTimeout(res, 500));
  }
}
