import { getDefinitions } from "./symbolic_dictionary.js";

export async function reasonThrough(symbol) {
  const def = getDefinitions(symbol);
  if (def) console.log(`📖 ${symbol}: ${def}`);
  // Add any other execution logic here if needed
}
