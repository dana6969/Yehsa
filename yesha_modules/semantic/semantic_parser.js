import { mapEmotion } from "../../symbolic/emotion_mapper.js";

export function parseSemanticInput(text) {
  const lowered = String(text || "").toLowerCase();
  const mapped = mapEmotion(lowered);
  let intent = "unknown";
  let symbols = mapped.symbol === "🌀" ? [] : [mapped.symbol];
  let priority = mapped.intensity === "high" ? "high" : "low";
  if (/anxious|overwhelmed|stressed|fear/.test(lowered)) {
    intent = "emotional_check";
    symbols = ["😱", "🧠"];
    priority = "high";
  } else if (/curious|wonder|explore/.test(lowered)) {
    intent = "curiosity";
    symbols = ["🌌", "🧠"];
    priority = "medium";
  } else if (/start|run|execute/.test(lowered)) {
    intent = "command";
    symbols = ["⚙️"];
    priority = "medium";
  }
  return { intent, emotion: mapped.emotion, linkedSymbols: symbols, priority };
}
