// R11: end-to-end Ask latency in node, in the same order the phone runs a typed question
// (src/phone/YehsaApp.js send): social turn, route intent, routeAsk (R8+), document intent,
// readAssistant, the field notes (lexical, then the meaning embedder, then lexical again with
// meaning), the section lookup (R10+) and the saved-document answer. One GovInfo Constitution and
// one manual are saved as documents, as on Dana's phone. Runs against any checkout:
//   node eval/r11/ask_latency.mjs --root /path/to/checkout --questions q.json --out result.json
// No network: fetch is stubbed. Holdouts are never read.
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const ROOT = path.resolve(arg("root", process.cwd()));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const QFILE = arg("questions", path.join(HERE, "bench_questions.json"));
const OUT = arg("out", null);
const NOEMBED = process.argv.includes("--no-embed");
globalThis.fetch = async () => { throw new Error("offline bench"); };

const t0 = process.hrtime.bigint();
const ms = (a, b) => Number(b - a) / 1e6;
const mod = async (rel) => {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return {};
  return import(pathToFileURL(file).href);
};

const { askField } = await mod("symbolic/phone_field.js");
const { expandParaphrase } = await mod("symbolic/paraphrase.js");
const { parseQuestion } = await mod("symbolic/question_parse.js");
const { routesToSpiritual } = await mod("symbolic/spiritual_route.js");
const meaningNode = NOEMBED ? {} : await mod("symbolic/meaning/meaning_node.js");
const { readAssistant } = await mod("symbolic/assistant_intent.js");
const { socialTurn, newThread, splitCompound, domainOf } = await mod("symbolic/yehsa_voice.js");
const { continueUtterance, isCapabilityQuestion } = await mod("symbolic/chat_turn.js");
const { isLibraryQuestion } = await mod("symbolic/library_answer.js");
const { routeIntent } = await mod("symbolic/routing/route_intent.js");
const { routeAsk } = await mod("symbolic/reasoning/ask_route.js");
const { libraryList } = await mod("symbolic/library/library.js");
const { createDocService } = await mod("symbolic/docs/doc_service.js");
const { documentIntent } = await mod("symbolic/docs/doc_find.js");
const { parseSectionRef } = await mod("symbolic/docs/section_ref.js");
const { getVector } = await mod("symbolic/meaning/vector_cache.js");
const books = JSON.parse(fs.readFileSync(path.join(ROOT, "symbolic_memory/books_index.json"), "utf8"));
const importMs = ms(t0, process.hrtime.bigint());

// Two saved documents (the GovInfo Constitution PDF and a canning manual), downloaded through the
// service's own path with a stubbed fetch, sealed and kept in memory like the phone's files.
const files = new Map();
const secrets = new Map();
let seed = 7;
const blobs = new Map();
const fakeFetch = async (url) => {
  const blob = blobs.get(String(url).split("?")[0]);
  if (!blob) throw new Error("offline bench");
  return new Response(blob.bytes, { status: 200, headers: { "content-type": blob.type } });
};
const documents = createDocService({
  getSecret: async (k) => secrets.get(k) || null,
  setSecret: async (k, v) => { secrets.set(k, v); },
  deleteSecret: async (k) => { secrets.delete(k); },
  readFile: async (k) => files.get(k) || null,
  writeFile: async (k, v) => { files.set(k, v); },
  deleteFile: async (k) => { files.delete(k); },
  fetchImpl: fakeFetch,
  randomBytes: (n) => Uint8Array.from({ length: n }, () => (seed = (seed * 1103515245 + 12345) % 2147483648) & 255)
});
const fixtures = path.join(HERE, "..", "fixtures", "r10");
const pdf = arg("pdf", "/workspace/r10-work/govinfo.pdf");
const GOV = "https://www.govinfo.gov/content/pkg/CDOC-110hdoc50/pdf/CDOC-110hdoc50.pdf";
blobs.set(GOV, { bytes: new Uint8Array(fs.readFileSync(pdf)), type: "application/pdf" });
blobs.set("https://example.org/canning.txt", { bytes: new TextEncoder().encode(fs.readFileSync(path.join(fixtures, "canning_manual.txt"), "utf8")), type: "text/plain" });
const seedLog = [];
for (const c of [
  { title: "CONSTITUTION - GovInfo", url: GOV, source: "govinfo.gov", format: "pdf" },
  { title: "USDA Complete Guide to Home Canning", url: "https://example.org/canning.txt", source: "example.org", format: "txt" }
]) {
  const got = await documents.download(c).catch((e) => ({ ok: false, reason: String(e) }));
  seedLog.push(got.ok ? `${c.title}: ${got.meta.pageCount} pages` : `${c.title}: ${got.reason}`);
}
const docCount = documents.snapshot().catalog.docs.length;

const questions = JSON.parse(fs.readFileSync(QFILE, "utf8"));
const thread = newThread ? newThread() : { turns: 0 };

async function answerOne(text) {
  if (isCapabilityQuestion?.(text)) return { answered: true };
  if (isLibraryQuestion?.(text)) return { answered: true };
  const spiritual = routesToSpiritual(text, parseQuestion(expandParaphrase(text)));
  const lexical = askField(text, books.passages, { session: { consent: false, position: null, waypoints: [] }, spiritualIndex: null, learned: [] });
  let meaning = null;
  if (meaningNode.prepareMeaning) {
    try {
      meaning = await meaningNode.prepareMeaning(text, { replies: [lexical?.text].filter(Boolean) });
    } catch {
      meaning = null;
    }
  }
  if (!meaning) return lexical;
  return askField(text, books.passages, { session: { consent: false, position: null, waypoints: [] }, spiritualIndex: null, learned: [], meaning });
}

async function one(typed) {
  const social = socialTurn ? socialTurn(typed, thread) : null;
  if (social && social.kind !== "ask") return "social";
  const effective = social?.kind === "ask" ? social.ask : typed;
  if (routeIntent?.(effective)) return "route-intent";
  if (routeAsk) {
    const entries = libraryList ? libraryList({ docs: documents.snapshot().catalog.docs, imported: [] }) : [];
    const route = routeAsk(effective, { entries, recentFound: null, docs: documents.snapshot().catalog.docs });
    if (route) return `route:${route.kind}`;
  }
  if (documentIntent?.(effective)) return "doc-find";
  const text = continueUtterance ? continueUtterance(effective, null) : effective;
  const intent = readAssistant(effective, { here: null, hereLabel: "", held: null, waypoints: [] });
  if (intent.kind !== "talk" && intent.type !== "ask-model") return "assistant";
  if (parseSectionRef && documents.section) {
    const ref = parseSectionRef(text);
    if (ref) {
      const part = await documents.section(text, { constitutionPages: null });
      if (part) return "section";
    }
  }
  const parts = splitCompound ? splitCompound(text) : null;
  let found;
  if (parts) {
    for (const p of parts) if (p.domain !== "trip") found = await answerOne(p.text);
  } else if (domainOf?.(text) === "trip") {
    return "trip";
  } else {
    found = await answerOne(text);
  }
  const qv = getVector ? getVector(`q:${text}`) : null;
  const fromDoc = await documents.answer(text, { queryVector: qv, notesAnswered: found?.answered === true });
  return fromDoc ? "doc" : found?.answered ? "notes" : "miss";
}

// Warm the embedder once (the phone loads it on the first question too) so it is not counted per question.
const warm0 = process.hrtime.bigint();
await one("how do I start a fire");
const warmMs = ms(warm0, process.hrtime.bigint());
const times = [];
const paths = {};
for (const q of questions) {
  const a = process.hrtime.bigint();
  const kind = await one(q);
  const t = ms(a, process.hrtime.bigint());
  times.push({ q, t, kind });
  paths[kind] = (paths[kind] || 0) + 1;
}
const sorted = times.map((x) => x.t).sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const out = {
  root: ROOT,
  questions: questions.length,
  docs: docCount,
  seeded: seedLog,
  embedder: !!meaningNode.prepareMeaning,
  importMs: +importMs.toFixed(1),
  firstQuestionMs: +warmMs.toFixed(1),
  medianMs: +pct(0.5).toFixed(2),
  p95Ms: +pct(0.95).toFixed(2),
  maxMs: +sorted[sorted.length - 1].toFixed(2),
  totalMs: +sorted.reduce((a, b) => a + b, 0).toFixed(1),
  paths,
  slowest: [...times].sort((a, b) => b.t - a.t).slice(0, 12).map((x) => ({ q: x.q.slice(0, 70), ms: +x.t.toFixed(1), kind: x.kind }))
};
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ ...out, times }, null, 1));
console.log(JSON.stringify(out, null, 1));
