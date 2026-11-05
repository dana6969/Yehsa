import { getDefinitions } from "./symbolic_dictionary.js";

export function classifySymbol(symbol) {
  const defs = getDefinitions(symbol).filter((item) => typeof item === "string");
  const synonyms = defs.flatMap(d => d.split(/[,;\.]/).map(w => w.trim())).filter(w => w.length > 3);
  console.log(`[🧩 Synonyms Linked] ${symbol}:`, synonyms);
}