import { execute } from "./symbolic_action_executor.js";
import fs from "fs";

let running = true;
const memory = JSON.parse(fs.readFileSync("./symbolic_memory/trainer_learned.json", "utf-8"));
const logPath = "./symbolic_memory/executed_log.json";
if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, "[]");
let log = JSON.parse(fs.readFileSync(logPath, "utf-8"));

(async function loop() {
  while (running) {
    for (const item of memory) {
      if (!log.find(e => e.symbol === item.symbol)) {
        console.log(`⚡ Execute: "${item.symbol}"`);
        execute(item.symbol);
        log.push({ symbol: item.symbol, ts: Date.now() });
        fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
        await new Promise(res => setTimeout(res, 100));
      }
    }
    await new Promise(res => setTimeout(res, 100));
  }
})();
