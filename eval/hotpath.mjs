// Symbol-map timing only. Does not call Ask and does not load the corpora.
import fs from "fs";
import { getMappedAction, symbolMap } from "../symbolic/symbolic_dictionary.js";

const symbols = Object.keys(symbolMap);
const n = Math.min(1000, symbols.length);
const startRss = rss();
const start = process.hrtime.bigint();
let hits = 0;
for (let i = 0; i < n; i += 1) {
  if (getMappedAction(symbols[i])) hits += 1;
}
const lookupNs = process.hrtime.bigint() - start;
const missStart = process.hrtime.bigint();
for (let i = 0; i < n; i += 1) getMappedAction(`missing-symbol-${i}`);
const missNs = process.hrtime.bigint() - missStart;
const out = {
  lookups: n,
  hits,
  lookupMs: Number(lookupNs) / 1e6,
  perLookupMs: Number(lookupNs) / 1e6 / n,
  missMs: Number(missNs) / 1e6,
  perMissMs: Number(missNs) / 1e6 / n,
  rss: rss(),
  rssStart: startRss
};
const file = process.argv[2];
if (!file) throw new Error("usage: node eval/hotpath.mjs <out.json>");
fs.writeFileSync(file, JSON.stringify(out));

function rss() {
  const status = fs.readFileSync("/proc/self/status", "utf8");
  const match = status.match(/VmRSS:\s+(\d+)/);
  return match ? Number(match[1]) * 1024 : process.memoryUsage().rss;
}
