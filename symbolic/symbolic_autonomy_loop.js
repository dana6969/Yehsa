import fs from "fs";
import { getMappedAction } from "./symbolic_dictionary.js";
import { chainSymbol } from "./symbolic_chain.js";
import { echoSymbolic } from "./symbolic_echo.js";

const logPath = "symbolic_memory/executed_log.json";
const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8")) : [];

export function dispatch(symbol) {
  const action = getMappedAction(symbol);
  const timestamp = new Date().toISOString();

  log.push({ symbol, action: action || "echo", timestamp });
  fs.writeFileSync(logPath, JSON.stringify(log.slice(-5000), null, 2));

  console.log(`[⏱ ${timestamp}] → ${symbol.toUpperCase()}`);
  if (action) {
    console.log(`⚙️  Mapped Action: ${action}`);
    try {
      chainSymbol(symbol);
    } catch (e) {
      console.error("❌ Chain error:", e.message);
    }
  } else {
    echoSymbolic(symbol);
  }
}
