/**
 * Hot-path symbol benchmark. Uses the in-memory symbol map only.
 * It does not load Webster, the book queue, or execute symbols unless
 * YEHSA_BENCHMARK_EXECUTE=1 (that path can quarantine unmapped symbols).
 */
import { symbolMap, getMappedAction } from "./symbolic/symbolic_dictionary.js";

const symbols = Object.keys(symbolMap).slice(0, 1000);
const execute = process.env.YEHSA_BENCHMARK_EXECUTE === "1";
const executeSymbol = execute
  ? (await import("./symbolic/symbolic_action_executor.js")).executeSymbol
  : null;
const start = process.hrtime.bigint();
let hits = 0;
for (const symbol of symbols) {
  const action = getMappedAction(symbol);
  if (action) hits += 1;
  if (executeSymbol && action) executeSymbol(symbol);
}
const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
const missStart = process.hrtime.bigint();
for (let i = 0; i < 1000; i += 1) getMappedAction(`missing-symbol-${i}`);
const missMs = Number(process.hrtime.bigint() - missStart) / 1e6;
console.log(
  `Hot path: ${symbols.length} symbols in ${elapsedMs.toFixed(2)} ms ` +
  `(${(elapsedMs / symbols.length).toFixed(4)} ms/lookup), hits ${hits}`
);
console.log(`Miss path: 1000 unknown symbols in ${missMs.toFixed(2)} ms (no corpus load)`);
