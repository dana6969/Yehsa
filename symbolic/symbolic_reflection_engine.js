import { getDefinitions } from "./symbolic_dictionary.js";
import { executeSymbol } from "./symbolic_action_executor.js";

export function reflect(recent) {
  for (const entry of recent) {
executeSymbol(entry.symbol);
    const related = recent.filter(e => e !== entry && e.symbol.toLowerCase().includes(entry.symbol.split(/[-_ ]/)[0])); if (related.length) console.log(`🧠 Contextual Link → ${entry.symbol} ↔ ${related.map(r => r.symbol).join(", ")}`);

    const fusion = entry.symbol.split(/[-_ ]/).map(s => s.toLowerCase()).join("");
    console.log(`[🧬 Fusion Candidate] ${entry.symbol} → ${fusion}`);
  }
}