import { lookupRegistered, registerSymbol } from "./runtime_store.js";

export function register(symbol, meta = {}) {
  if (typeof symbol !== "string" || !symbol.trim()) return null;
  return registerSymbol(symbol.trim(), meta);
}

export function lookup(symbol) {
  return lookupRegistered(symbol);
}
