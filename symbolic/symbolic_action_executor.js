import fs from "fs";
import { getMappedAction } from "./symbolic_dictionary.js";

const logPath = "symbolic_memory/executed_log.json";

export function execute(symbol) {
  const ts = new Date().toISOString();
  const action = getMappedAction(symbol);

  const logEntry = {
    symbol,
    action: action || "undefined",
    type: "execution",
    timestamp: ts
  };

  // Logging
  const log = fs.existsSync(logPath)
    ? JSON.parse(fs.readFileSync(logPath, "utf-8"))
    : [];
  log.push(logEntry);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

  if (action) {
    console.log(`⚡ Executing: ${symbol} → ${action}`);
    // Future real-world hooks or API commands go here
  } else {
    console.log(`🤔 No mapped action for: ${symbol}`);
  }
}
