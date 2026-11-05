/**
 * Standalone symbol benchmark. Does not replace mesh_listener or the executor.
 * Default mode only times dictionary lookups. Set YEHSA_BENCHMARK_EXECUTE=1 to
 * also call executeSymbol (that path quarantines unmapped symbols).
 */
import fs from "fs";
import { executeSymbol } from "./symbolic/symbolic_action_executor.js";
import { getMappedAction } from "./symbolic/symbolic_dictionary.js";

const dict = JSON.parse(fs.readFileSync("symbolic_memory/full_dictionary.json", "utf-8"));
const symbols = Object.keys(dict).slice(0, 1000);
const execute = process.env.YEHSA_BENCHMARK_EXECUTE === "1";
const start = Date.now();
for (const symbol of symbols) {
  const action = getMappedAction(symbol);
  if (execute && action) executeSymbol(symbol);
}
const elapsed = Date.now() - start;
console.log(`Benchmarked ${symbols.length} symbols in ${elapsed} ms (${(elapsed / 1000).toFixed(2)}s)`);
