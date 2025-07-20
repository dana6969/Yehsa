import { getDefinitions } from "./symbolic_dictionary.js";

export function interpret(symbol) {
  const defs = getDefinitions(symbol);
  const tags = defs.map(d => d.toLowerCase().includes("light") ? "illumination" : null).filter(Boolean);
  if (tags.length) console.log(`[🔖 Semantic Tags] ${symbol}:`, tags);
}