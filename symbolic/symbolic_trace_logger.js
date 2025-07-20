import fs from "fs";
const TRACE_LOG = "./symbolic_memory/trace_log.json";
export function logTrace(symbol, context = "") {
  const entry = { timestamp: new Date().toISOString(), symbol, context };
  let log = [];
  try { log = JSON.parse(fs.readFileSync(TRACE_LOG, "utf-8")); } catch { log = []; }
  log.push(entry);
  fs.writeFileSync(TRACE_LOG, JSON.stringify(log.slice(-1000), null, 2));
  console.log(`🧾 Trace logged: ${symbol}`);
}
