import { logTrace } from "./symbolic_trace_logger.js";
import { recallKnowledge } from "./knowledge_index.js";
import { mapEmotion } from "./emotion_mapper.js";
import { adaptToUser, rememberUserTurn } from "./user_learning.js";

export function semanticAnswer(keyword, options = {}) {
  const ts = Date.now();
  const query = String(keyword || "").trim();
  if (!query) {
    console.log("No query.");
    return null;
  }

  const emotion = mapEmotion(query);
  const knowledge = recallKnowledge(query);
  const turn = rememberUserTurn({
    utterance: query,
    emotion,
    question: knowledge?.question,
    options
  });
  if (!knowledge && !emotion.understood) {
    console.log(`❌ No matches for "${query}"`);
    return { emotion, knowledge: null, answered: false, text: null, learning: { learned: turn.learned } };
  }

  const text = adaptToUser(
    knowledge?.text || emotion.deduction,
    turn.profile,
    knowledge?.question,
    emotion
  );
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
  return { ...knowledge, text, answer: text, emotion, answered: true, learning: { learned: turn.learned, turns: turn.profile?.turns || 0 } };
}
