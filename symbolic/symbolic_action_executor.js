import fs from "fs";
import { getMappedAction } from "./symbolic_dictionary.js";

const logPath = "symbolic_memory/executed_log.json";

export function execute(symbol) {
  const ts = new Date().toISOString();
  const action = getMappedAction(symbol);
  const logEntry = { symbol, action: action || "undefined", type: "execution", timestamp: ts };
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8")) : [];
  log.push(logEntry);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

  if (action) {
    console.log(`⚡ Executing: ${symbol} → ${action}`);
    // AGI hooks / real system calls
  } else {
    console.log(`🤔 No mapped action for: ${symbol}`);
  }
}

export function executeSymbol(symbol, action) {
  const ts = new Date().toISOString();
  const logEntry = { symbol, action, type: "external-exec", timestamp: ts };
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8")) : [];
  log.push(logEntry);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`⚙️ Executing: ${symbol} → ${action}`);
}
