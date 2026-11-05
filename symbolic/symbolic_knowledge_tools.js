import { logTrace } from "./symbolic_trace_logger.js";
import { recallKnowledge } from "./knowledge_index.js";

export function semanticAnswer(keyword) {
  const ts = Date.now();
  const query = String(keyword || "").trim();
  if (!query) {
    console.log("No query.");
    return null;
  }

  const knowledge = recallKnowledge(query);
  if (!knowledge) {
    console.log(`❌ No matches for "${query}"`);
    return null;
  }

  console.log(`🧠 Semantic matches for "${query}":`);
  console.log(knowledge.text);
  const hits = Array.isArray(knowledge.hits) ? knowledge.hits : [];
  for (const hit of hits) {
    console.log(`🔹 [${hit.kind}] ${hit.symbol}: ${hit.text}`);
  }
  console.log(`⏱️ Duration: ${Date.now() - ts} ms`);
  logTrace(knowledge.symbol, knowledge.text);
  return knowledge;
}
