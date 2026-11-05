import { mapEmotion } from "../../symbolic/emotion_mapper.js";

export function parseSemanticInput(text) {
  const lowered = String(text || "").toLowerCase();
  const mapped = mapEmotion(lowered);
  // Emotion never empties the work. A missed feeling still reflects on the words.
  let intent = "answer";
  let symbols = ["🧠"];
  let priority = "low";
  if (mapped.understood && mapped.emotion === "fear") {
    intent = "emotional_check";
    symbols = ["😱", "🧠"];
    priority = "high";
  } else if (mapped.understood && mapped.emotion === "anger") {
    intent = "emotional_check";
    symbols = ["🔥", "🧠"];
    priority = "high";
  } else if (mapped.understood && mapped.emotion === "interest") {
    intent = "curiosity";
    symbols = ["🌌", "🧠"];
    priority = "medium";
  } else if (/\b(start|run|execute)\b/.test(lowered)) {
    intent = "command";
    symbols = ["⚙️", "🧠"];
    priority = "medium";
  }
  return {
    intent,
    emotion: mapped.emotion,
    confidence: mapped.confidence,
    understood: mapped.understood,
    linkedSymbols: symbols,
    priority,
    deduction: mapped.deduction
  };
}
