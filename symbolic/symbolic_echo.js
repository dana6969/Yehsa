import fs from "fs";

export function echoSymbolic(symbol) {
  const logPath = "symbolic_memory/executed_log.json";
  const ts = new Date().toISOString();
  const message = `[⏱ ${ts}] (echo) → ${symbol.toUpperCase()}`;
  console.log(message);

  const logEntry = { symbol, type: "echo", timestamp: ts };
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8")) : [];
  log.push(logEntry);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}
