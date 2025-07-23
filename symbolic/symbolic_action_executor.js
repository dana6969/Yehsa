import { quarantine } from "./quarantine.js";
import { inferAction } from "./symbolic_definition_mapper.js";

export const actionMap = {
  alchemical: "transmute_mind",
  glossology: "analyze_language_structure",
  dreamgate: "open_cosmic_portal",
  aviates: "initiate_flight_sequence",
  deductional: "reason_forward_chain",
  lived: "reflect_past_events"
};

export function executeSymbol(symbol) {
  const ts = new Date().toISOString();
  let action = actionMap[symbol];
  if (!action) {
  quarantine(symbol, "No mapped action");
    const inferred = inferAction(symbol);
    if (inferred) {
      console.log(`🧠 [Auto-Mapped] ${symbol} → ${inferred} @ ${ts}`);
      actionMap[symbol] = inferred;
      action = inferred;
    }
  }
  if (action) {
    console.log(`⚡ [EXEC] ${symbol} → ${action} @ ${ts}`);
  } else {
    console.warn(`🤔 [Unknown] ${symbol} — no mapped action @ ${ts}`);
  }
  return action;
}

export function getDefinitions(symbol) {
  return actionMap[symbol] || null;
}
