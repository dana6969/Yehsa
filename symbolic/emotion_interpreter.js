import { mapEmotion } from "./emotion_mapper.js";

export function interpretEmotion(input) {
  if (!input) return "🌀";
  return mapEmotion(input).symbol || "🌀";
}
