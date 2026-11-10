// One fresh process. Prints nothing but writes a JSON result file.
import fs from "fs";
import { loadRegressionV1 } from "./regression/v1/load.mjs";
import { judge } from "./score.mjs";
import { ask } from "../symbolic/ask.js";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const ids = new Set(String(args.get("--ids") || "").split(",").filter(Boolean));
const out = args.get("--out");
if (!out || ids.size === 0) throw new Error("usage: node eval/worker.mjs --ids a,b --out file.json");

const questions = loadRegressionV1().questions.filter((question) => ids.has(question.id));
if (questions.length !== ids.size) {
  throw new Error(`worker missing questions: wanted ${ids.size}, found ${questions.length}`);
}
const rssStart = rss();
let peak = rssStart;
const items = [];
for (const question of questions) {
  const started = process.hrtime.bigint();
  const result = ask(question.prompt);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const memory = rss();
  if (memory > peak) peak = memory;
  const verdict = judge(question, result);
  items.push({
    id: question.id,
    category: question.category,
    slice: question.slice || null,
    paraphraseOf: question.paraphraseOf || null,
    ms: round(ms),
    rss: memory,
    pass: verdict.pass,
    wrongConfident: verdict.wrongConfident,
    abstained: verdict.abstained,
    reason: verdict.reason,
    text: excerpt(result?.text)
  });
}
fs.writeFileSync(out, JSON.stringify({
  pid: process.pid,
  rssStart,
  rssEnd: rss(),
  peak,
  items
}));

function rss() {
  const status = fs.readFileSync("/proc/self/status", "utf8");
  const match = status.match(/VmRSS:\s+(\d+)/);
  return match ? Number(match[1]) * 1024 : process.memoryUsage().rss;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function excerpt(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > 180 ? `${flat.slice(0, 177)}...` : flat;
}
