import { rememberEmotion } from "./runtime_store.js";

const RULES = [
  { test: /fear|anxious|overwhelm|stress|scared|panic/, emotion: "fear", symbol: "😱", intensity: "high" },
  { test: /anger|furious|rage/, emotion: "anger", symbol: "🔥", intensity: "high" },
  { test: /sad|grief|loss/, emotion: "sadness", symbol: "💧", intensity: "medium" },
  { test: /love|care|safe/, emotion: "care", symbol: "❤️", intensity: "medium" },
  { test: /curious|wonder|explore/, emotion: "interest", symbol: "🌌", intensity: "medium" },
  { test: /joy|glad|hope/, emotion: "joy", symbol: "✨", intensity: "medium" }
];

export function mapEmotion(input) {
  const text = Array.isArray(input) ? input.join(" ") : String(input ?? "");
  const lowered = text.toLowerCase();
  const matched = RULES.find((rule) => rule.test.test(lowered));
  const result = matched
    ? { emotion: matched.emotion, symbol: matched.symbol, intensity: matched.intensity, text }
    : { emotion: "neutral", symbol: "🌀", intensity: "low", text };
  return rememberEmotion(result);
}
