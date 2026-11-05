import { speakContext } from "./symbolic_speaker.js";
import { logTrace } from "./symbolic_trace_logger.js";
import { recallKnowledge } from "./knowledge_index.js";
import fs from "fs";

function searchLearned(keyword) {
  const file = "./symbolic_memory/trainer_learned.json";
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (!Array.isArray(data)) return null;
  const needle = keyword.toLowerCase();
  return data.find((entry) =>
    typeof entry?.context === "string" && entry.context.toLowerCase().includes(needle)
  ) || null;
}

export function semanticAnswer(keyword) {
  const ts = Date.now();
  const query = String(keyword || "").trim();
  if (!query) {
    console.log("No query.");
    return null;
  }

  const learned = searchLearned(query);
  const knowledge = learned
    ? { kind: "trainer", symbol: learned.symbol, text: learned.context }
    : recallKnowledge(query);

  if (!knowledge) {
    console.log(`❌ No matches for "${query}"`);
    return null;
  }

  console.log(`🧠 Semantic matches for "${query}":`);
  console.log(`🔹 ${knowledge.symbol}: ${knowledge.text}`);
  console.log(`⏱️ Duration: ${Date.now() - ts} ms`);
  if (knowledge.kind === "trainer") speakContext(knowledge.symbol);
  logTrace(knowledge.symbol, knowledge.text);
  return knowledge;
}
