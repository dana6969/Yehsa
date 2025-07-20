import { getDefinitions } from "./symbolic_dictionary.js";
import { executeSymbol } from "./symbolic_action_executor.js";

export function reflect(recent) {
  for (const entry of recent) {
executeSymbol(entry.symbol);

    const fusion = entry.symbol.split(/[-_ ]/).map(s => s.toLowerCase()).join("");
    console.log(`[🧬 Fusion Candidate] ${entry.symbol} → ${fusion}`);
  }
}