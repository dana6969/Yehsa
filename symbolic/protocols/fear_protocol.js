import { mapEmotion } from "../emotion_mapper.js";
import { noteContext } from "../context_manager.js";

export function run(context) {
  const emotion = mapEmotion(context || "fear");
  noteContext(context || "fear", { protocol: "fear" });
  return {
    protocol: "fear",
    action: "contain",
    emotion: emotion.emotion,
    symbol: emotion.symbol,
    context: context ?? "",
    note: "Local containment state only. Not an outward action."
  };
}
