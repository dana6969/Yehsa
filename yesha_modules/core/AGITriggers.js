import { logSymbolInteraction } from "../symbolic/logger.js";
import { recallKnowledge } from "../../symbolic/knowledge_index.js";
import { noteContext } from "../../symbolic/context_manager.js";
import { mapEmotion } from "../../symbolic/emotion_mapper.js";

const DEFAULT_INPUT = "I feel anxious and overwhelmed.";

export function evaluateTriggers(input = DEFAULT_INPUT) {
  console.log("[Yehsa AGI] Starting symbolic + semantic reasoning...");
  const emotion = mapEmotion(input);
  noteContext(input, { emotion: emotion.emotion, confidence: emotion.confidence });
  // The answer is gathered before logging. A weak emotion read, or a log
  // write failure, does not skip it.
  const hit = recallKnowledge(input);
  try {
    logSymbolInteraction(input);
  } catch (err) {
    console.warn(`[knowledge] log skipped: ${err.message}`);
  }
  if (hit) console.log(`[knowledge:${hit.kind}] ${hit.symbol}: ${hit.text.slice(0, 180)}`);
  const result = hit?.text || (emotion.understood ? emotion.deduction : null);
  return { emotion, knowledge: hit, answered: Boolean(result), result };
}
