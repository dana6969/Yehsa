import { getDefinitions } from "./symbolic_dictionary.js";

export async function reasonThrough(symbol) {
  const definition = getDefinitions(symbol);
  if (!definition) return null;
  console.log(`📖 ${symbol}: ${definition}`);
  return definition;
}
