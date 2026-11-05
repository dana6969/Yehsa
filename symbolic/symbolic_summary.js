import fs from "fs";
import { isDirectRun } from "./direct_run.js";

export function summarizeKnowledge() {
  const learnedPath = "./symbolic_memory/trainer_learned.json";
  const learnedRaw = fs.existsSync(learnedPath) ? JSON.parse(fs.readFileSync(learnedPath, "utf8")) : [];
  const learned = Array.isArray(learnedRaw) ? learnedRaw : [];
  console.log("🧠 SYMBOLIC KNOWLEDGE SUMMARY");
  console.log(`Total trainer entries: ${learned.length}`);
  for (const entry of learned.slice(0, 5)) {
    console.log(`- ${entry.symbol}: ${String(entry.context || "").slice(0, 80)}`);
  }
  return { learned: learned.length };
}

if (isDirectRun(import.meta.url)) summarizeKnowledge();
