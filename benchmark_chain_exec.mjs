/**
 * Standalone dictionary-lookup benchmark. Does not execute symbols or start mesh.
 */
import fs from "fs";
import { getMappedAction } from "./symbolic/symbolic_dictionary.js";

const dict = JSON.parse(fs.readFileSync("symbolic_memory/full_dictionary.json", "utf-8"));
const symbols = Object.keys(dict);
const start = Date.now();
let count = 0;
for (const symbol of symbols) {
  getMappedAction(symbol);
  count++;
  if (count % 10000 === 0) console.log(`Processed ${count} symbols...`);
}
const elapsed = Date.now() - start;
console.log(`Benchmarked ${count} symbols in ${elapsed} ms (${(elapsed / 1000).toFixed(2)}s)`);
