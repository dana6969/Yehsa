// Okapi BM25 over the same prose corpora Ask reads.
// Field passages in books_index.json, then the dictionary merge
// (WordNet stub, dictionary_memory, full_dictionary, Webster; first gloss wins).
// Medical name lists are labels, not passages, and are not indexed.
// k1 and b are the usual Okapi defaults. They were not fit to this question set.
// A query with a best score of 0 abstains. Otherwise the top passage is the reply.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildQuestions } from "./questions.mjs";
import { judge } from "./score.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const K1 = 1.2;
const B = 0.75;
const STOP = new Set(`a an the of to in on for with from by and or not is are was were be been being
do does did how what when where who why who whom which who into over under about than then so if at as
i you we they me my your our it this that these those can could should would will just please tell explain
there here am`.split(/\s+/));

export function selfCheckBm25() {
  const index = buildIndex([
    { text: "willow bark salicin is described as an analgesic" },
    { text: "a watershed drains to one stream" },
    { text: "unrelated moss note" }
  ]);
  const hit = search(index, "What is salicin in willow bark?", 1)[0];
  if (!hit || !hit.text.includes("salicin")) throw new Error("bm25 self-check failed");
  const none = search(index, "zzzz-qqqq-ploverish", 1);
  if (none.length) throw new Error("bm25 self-check should abstain");
}

export function loadCorpora() {
  const docs = [];
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, "symbolic_memory/books_index.json"), "utf8"));
  for (const passage of index.passages || []) {
    docs.push({
      source: "field",
      text: `${passage.symbol || ""} ${passage.context || ""}`.replace(/\s+/g, " ").trim()
    });
  }
  const lexical = new Map();
  for (const file of ["wordnet_raw.json", "dictionary_memory.json", "full_dictionary.json", "webster_raw.json"]) {
    for (const [key, value] of Object.entries(readObject(file))) remember(lexical, key, value);
  }
  for (const [key, gloss] of lexical) {
    docs.push({ source: "dictionary", text: `${key} ${gloss}`.replace(/\s+/g, " ").trim() });
  }
  return docs;
}

export function buildIndex(docs) {
  const df = new Map();
  const postings = new Map();
  const lengths = new Array(docs.length);
  let total = 0;
  for (let i = 0; i < docs.length; i += 1) {
    const counts = new Map();
    for (const token of tokenize(docs[i].text)) counts.set(token, (counts.get(token) || 0) + 1);
    let length = 0;
    for (const count of counts.values()) length += count;
    lengths[i] = length;
    total += length;
    for (const [term, tf] of counts) {
      df.set(term, (df.get(term) || 0) + 1);
      let list = postings.get(term);
      if (!list) {
        list = [];
        postings.set(term, list);
      }
      list.push([i, tf]);
    }
  }
  return {
    docs,
    df,
    postings,
    lengths,
    avgdl: docs.length ? total / docs.length : 0,
    n: docs.length
  };
}

export function search(index, query, k = 1) {
  const counts = new Map();
  for (const token of tokenize(query)) counts.set(token, (counts.get(token) || 0) + 1);
  const scores = new Map();
  for (const [term, qtf] of counts) {
    const list = index.postings.get(term);
    if (!list) continue;
    const df = index.df.get(term) || 0;
    const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
    for (const [docId, tf] of list) {
      const denom = tf + K1 * (1 - B + B * index.lengths[docId] / index.avgdl);
      const add = idf * ((tf * (K1 + 1)) / denom) * qtf;
      scores.set(docId, (scores.get(docId) || 0) + add);
    }
  }
  const ranked = [...scores.entries()].filter(([, score]) => score > 0);
  ranked.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return ranked.slice(0, k).map(([docId, score]) => ({
    score,
    text: index.docs[docId].text,
    source: index.docs[docId].source
  }));
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((token) => token.length > 1 && !STOP.has(token));
}

function readObject(file) {
  const full = path.join(ROOT, "symbolic_memory", file);
  if (!fs.existsSync(full)) return {};
  const text = fs.readFileSync(full, "utf8").trim();
  if (!text || /^404\b/i.test(text)) return {};
  const data = JSON.parse(text);
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function remember(map, key, value) {
  if (typeof key !== "string" || !key.trim()) return;
  const text = Array.isArray(value)
    ? value.filter((item) => typeof item === "string").join(" ").trim()
    : (typeof value === "string" ? value.trim() : "");
  if (!text) return;
  const id = key.trim().toLowerCase();
  if (!map.has(id)) map.set(id, text);
}

function rss() {
  const status = fs.readFileSync("/proc/self/status", "utf8");
  const match = status.match(/VmRSS:\s+(\d+)/);
  return match ? Number(match[1]) * 1024 : process.memoryUsage().rss;
}

function excerpt(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > 180 ? `${flat.slice(0, 177)}...` : flat;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  selfCheckBm25();
  const out = process.argv[2];
  if (!out) throw new Error("usage: node eval/bm25.mjs <out.json>");
  const rssStart = rss();
  const started = process.hrtime.bigint();
  const index = buildIndex(loadCorpora());
  const indexMs = Number(process.hrtime.bigint() - started) / 1e6;
  const rssIndexed = rss();
  let peak = rssIndexed;
  const questions = buildQuestions();
  const items = [];
  for (const question of questions) {
    const t0 = process.hrtime.bigint();
    const top = search(index, question.prompt, 3);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const memory = rss();
    if (memory > peak) peak = memory;
    const top1 = judge(question, top[0] ? { answered: true, text: top[0].text } : { answered: false, text: null });
    const joined = top.map((hit) => hit.text).join(" ");
    const top3 = judge(question, top.length ? { answered: true, text: joined } : { answered: false, text: null });
    items.push({
      id: question.id,
      category: question.category,
      slice: question.slice || null,
      ms: Math.round(ms * 100) / 100,
      top1: { pass: top1.pass, wrongConfident: top1.wrongConfident, abstained: top1.abstained, reason: top1.reason, text: excerpt(top[0]?.text) },
      top3: { pass: top3.pass, wrongConfident: top3.wrongConfident, abstained: top3.abstained }
    });
  }
  fs.writeFileSync(out, JSON.stringify({
    k1: K1,
    b: B,
    documents: index.n,
    fieldDocuments: index.docs.filter((doc) => doc.source === "field").length,
    dictionaryDocuments: index.docs.filter((doc) => doc.source === "dictionary").length,
    indexMs: Math.round(indexMs),
    rssStart,
    rssIndexed,
    rssEnd: rss(),
    peak,
    items
  }));
}
