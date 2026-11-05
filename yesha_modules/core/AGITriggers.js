import { logSymbolInteraction } from "../symbolic/logger.js";
import { recallKnowledge } from "../../symbolic/knowledge_index.js";
import { noteContext } from "../../symbolic/context_manager.js";
import { mapEmotion } from "../../symbolic/emotion_mapper.js";

const DEFAULT_INPUT = "I feel anxious and overwhelmed.";

export function evaluateTriggers(input = DEFAULT_INPUT) {
  console.log("[Yehsa AGI] Starting symbolic + semantic reasoning...");
  const emotion = mapEmotion(input);
  noteContext(input, { emotion: emotion.emotion });
  logSymbolInteraction(input);
  const hit = recallKnowledge(input);
  if (hit) console.log(`[knowledge:${hit.kind}] ${hit.symbol}: ${hit.text.slice(0, 180)}`);
  return { emotion, knowledge: hit };
}
