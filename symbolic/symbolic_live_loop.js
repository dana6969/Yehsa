import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { executeActions } from "./symbolic_action_executor.js";
import { dispatchSymbol } from "./ble_dispatch.js";

let last = "";

export async function loop() {
  while (true) {
    const raw = fs.readFileSync("./symbolic_memory/learning_queue.json", "utf-8");
    const mem = JSON.parse(raw);
    const recent = mem[mem.length - 1];
    if (recent && recent.symbol !== last) {
      console.log(`[LOOP] New Symbol: ${recent.symbol}`);
      if (recent.symbol === "end") {
        console.log("🛑 Yehsa loop halted via symbolic trigger.");
        break;
      }
      await executeActions(recent.symbol);
      dispatchSymbol(recent.symbol);
      const log = { symbol: recent.symbol, timestamp: Date.now(), source: "learning_queue.json" };
      fs.appendFileSync("./symbolic_memory/executed_log.json", JSON.stringify(log) + "\n");
      last = recent.symbol;
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  loop();
}
