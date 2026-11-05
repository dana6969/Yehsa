import fs from "fs";
import { isDirectRun } from "./direct_run.js";

export function replayRecent(limit = 5) {
  const file = "symbolic_memory/trace_log.json";
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(data) ? data.slice(-limit) : [];
    for (const row of rows) console.log(`[replay] ${row.symbol || ""} ${row.context || ""}`);
    return rows;
  } catch {
    return [];
  }
}

if (isDirectRun(import.meta.url)) replayRecent(5);
