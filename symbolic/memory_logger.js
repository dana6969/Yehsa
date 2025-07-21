import fs from "fs";
const logPath = "./symbolic_memory/execution_log.json";
if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, "[]");

export function logExecution(symbol) {
  const log = JSON.parse(fs.readFileSync(logPath, "utf8"));
  const entry = { symbol, ts: Date.now() };
  log.push(entry);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}
