import { logSymbolInteraction } from "../symbolic/logger.js";

const DEFAULT_INPUT = "I feel anxious and overwhelmed.";

export function evaluateTriggers(input = DEFAULT_INPUT) {
  console.log("[Yehsa AGI] Starting symbolic + semantic reasoning...");
  logSymbolInteraction(input);
}
