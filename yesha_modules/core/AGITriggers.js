import { logSymbolInteraction } from "../symbolic/logger.js";
import { recallKnowledge } from "../../symbolic/knowledge_index.js";

const DEFAULT_INPUT = "I feel anxious and overwhelmed.";

export function evaluateTriggers(input = DEFAULT_INPUT) {
  console.log("[Yehsa AGI] Starting symbolic + semantic reasoning...");
  logSymbolInteraction(input);
  const hit = recallKnowledge(input);
  if (hit) console.log(`[knowledge:${hit.kind}] ${hit.symbol}: ${hit.text.slice(0, 180)}`);
}
