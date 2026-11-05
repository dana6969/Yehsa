import { logTrace } from "./symbolic_trace_logger.js";
import { recallKnowledge } from "./knowledge_index.js";
import { mapEmotion } from "./emotion_mapper.js";

export function semanticAnswer(keyword) {
  const ts = Date.now();
  const query = String(keyword || "").trim();
  if (!query) {
    console.log("No query.");
    return null;
  }

  const emotion = mapEmotion(query);
  const knowledge = recallKnowledge(query);
  if (!knowledge && !emotion.understood) {
    console.log(`❌ No matches for "${query}"`);
    return { emotion, knowledge: null, answered: false, text: null };
  }

  const text = knowledge?.text || emotion.deduction;
  console.log(`🧠 Semantic matches for "${query}":`);
  if (emotion.understood) {
    console.log(`[emotion:${emotion.emotion} ${emotion.confidence}] ${emotion.deduction}`);
  }
  console.log(text);
  const hits = Array.isArray(knowledge?.hits) ? knowledge.hits : [];
  for (const hit of hits) {
    console.log(`🔹 [${hit.kind}] ${hit.symbol}: ${hit.text}`);
  }
  console.log(`⏱️ Duration: ${Date.now() - ts} ms`);
  logTrace(knowledge?.symbol || emotion.emotion, text);
  if (!knowledge) {
    return {
      kind: "emotion",
      symbol: emotion.emotion,
      text,
      hits: [],
      answer: text,
      emotion,
      answered: true
    };
  }
  return { ...knowledge, emotion, answered: true };
}
