import fs from "fs";
import { semanticAnswer } from "./symbolic_knowledge_tools.js";
const TRACE_LOG = "./symbolic_memory/trace_log.json";

export async function replayRecentTraces(limit = 5) {
  try {
    const log = JSON.parse(fs.readFileSync(TRACE_LOG, "utf-8"));
    const recent = log.slice(-limit);
    console.log(`🔁 Replaying last ${recent.length} traces:\n`);
    for (const entry of recent) {
      console.log(`➡️ ${entry.symbol}`);
      await semanticAnswer(entry.symbol);
    }
  } catch (e) {
    console.error("❌ Replay failed:", e.message);
  }
}
