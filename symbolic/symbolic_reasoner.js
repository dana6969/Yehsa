import { getDefinitions } from "./symbolic_dictionary.js";
let dictionaryCache = null; export async function reasonThrough(symbol) { const fs = await import("fs/promises"); if (!dictionaryCache) { const raw = await fs.readFile("./symbolic_memory/full_dictionary.json", "utf-8"); dictionaryCache = JSON.parse(raw); } const def = dictionaryCache[symbol]; if (!def) console.log(`[⚠️ No definition found]: ${symbol}`); return { symbol, definition: def }; }
   if (def) console.log(`[📖] ${symbol}: ${def}`);
