import fs from "fs";

export default function symbolicLogger(entry) {
  const path = "logs/symbolic_output.log";
  const timestamp = new Date().toISOString();
  const log = `[${timestamp}] ${JSON.stringify(entry)}\n`;
  fs.mkdirSync("logs", { recursive: true });
  fs.appendFileSync(path, log);
}

export function logReasoning(symbol, message) {
  console.log(`[🧠 REASON] ${symbol}: ${message}`);
}
