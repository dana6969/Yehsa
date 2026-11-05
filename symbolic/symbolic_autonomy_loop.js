import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { executeSymbol } from "./symbolic_action_executor.js";

const memory = JSON.parse(fs.readFileSync("./symbolic_memory/trainer_learned.json", "utf-8"));
const logPath = "./symbolic_memory/executed_log.json";
if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, "[]");
let log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
let running = false;

export function startAutonomyLoop() {
  if (running) return;
  running = true;
  (async function loop() {
    while (running) {
      for (const item of memory) {
        const alreadyExecuted = log.find(e => e.symbol === item.symbol);
        if (!alreadyExecuted) {
          const ts = new Date().toISOString();
          console.log(`🧠 [Execute Loop] ${item.symbol} @ ${ts}`);
          executeSymbol(item.symbol);
          log.push({ symbol: item.symbol, ts: Date.now() });
          fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
          await new Promise(res => setTimeout(res, 100));
        }
      }
      await new Promise(res => setTimeout(res, 100));
    }
  })();
}

export function stopAutonomyLoop() {
  running = false;
}

function dispatch(symbol) {
  const ts = new Date().toISOString();
  console.log(`🚀 [Dispatch] ${symbol} triggered @ ${ts}`);
  executeSymbol(symbol);
}

export { dispatch };

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  startAutonomyLoop();
}
