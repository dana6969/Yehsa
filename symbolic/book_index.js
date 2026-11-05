import fs from "fs";
import path from "path";
import { isDirectRun } from "./direct_run.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BOOKS_DIR = path.join(ROOT, "symbolic_books");
const MEMORY_DIR = path.join(ROOT, "symbolic_memory");
const INDEX_PATH = path.join(MEMORY_DIR, "books_index.json");
const MAX_PASSAGES_PER_SOURCE = 180;
const MAX_CONTEXT = 480;

let cached = null;

function isJunk(text) {
  const value = String(text || "").trim();
  if (value.length < 20) return true;
  if (/^404\b/i.test(value)) return true;
  if (/<!doctype|<html\b|<title>\s*404|<\/?[a-z][^>]*>/i.test(value)) return true;
  return false;
}

function listBookFiles(dir, prefix) {
  const found = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === "README.md") continue;
    const full = path.join(dir, name);
    const rel = `${prefix}/${name}`;
    if (fs.statSync(full).isDirectory()) found.push(...listBookFiles(full, rel));
    else if (name.endsWith(".txt") || name.endsWith(".json")) found.push({ full, source: rel });
  }
  return found;
}

function readText(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function gutenbergTitle(text, fallback) {
  const match = text.match(/Project Gutenberg eBook of ([^\n*]+)/i);
  if (!match) return fallback;
  return match[1].replace(/\s+/g, " ").trim();
}

function gutenbergBody(text) {
  const start = text.search(/\*\*\*\s*START OF THE PROJECT GUTENBERG/i);
  const end = text.search(/\*\*\*\s*END OF THE PROJECT GUTENBERG/i);
  if (start >= 0 && end > start) {
    const lineEnd = text.indexOf("\n", start);
    return text.slice(lineEnd > 0 ? lineEnd + 1 : start, end);
  }
  return text;
}

function slug(value) {
  return String(value || "book")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "book";
}

function chunkText(text) {
  const body = gutenbergBody(text).replace(/\r/g, "");
  let parts = body
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 80 && !isJunk(part));
  if (parts.length === 0) {
    const flat = body.replace(/\s+/g, " ").trim();
    parts = [];
    for (let i = 0; i < flat.length && parts.length < MAX_PASSAGES_PER_SOURCE; i += MAX_CONTEXT) {
      const slice = flat.slice(i, i + MAX_CONTEXT).trim();
      if (!isJunk(slice)) parts.push(slice);
    }
  }
  return parts.slice(0, MAX_PASSAGES_PER_SOURCE).map((part) => part.slice(0, MAX_CONTEXT));
}

function pushPassage(passages, seen, passage) {
  if (!passage?.symbol || isJunk(passage.context)) return;
  if (seen.has(passage.symbol)) return;
  seen.add(passage.symbol);
  passages.push({
    symbol: passage.symbol,
    context: String(passage.context).replace(/\s+/g, " ").trim().slice(0, MAX_CONTEXT),
    title: passage.title,
    source: passage.source
  });
}

function readVerseFile(file, title, source, passages, seen) {
  if (!fs.existsSync(file)) return { file: source, status: "missing" };
  let data;
  try {
    data = JSON.parse(readText(file));
  } catch (err) {
    return { file: source, status: "unreadable", reason: err.message };
  }
  if (!Array.isArray(data)) return { file: source, status: "skipped", reason: "not a verse array" };
  let added = 0;
  for (const entry of data) {
    if (!entry || typeof entry.symbol !== "string") continue;
    const before = passages.length;
    pushPassage(passages, seen, {
      symbol: entry.symbol,
      context: entry.context,
      title,
      source
    });
    if (passages.length > before) added += 1;
  }
  return { file: source, status: added ? "indexed" : "empty", title, passages: added };
}

function readNdjson(file) {
  const entries = [];
  for (const line of readText(file).split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // Combined queue has occasional broken lines; skip those.
    }
  }
  return entries;
}

export function buildBookIndex() {
  const passages = [];
  const seen = new Set();
  const sources = [];

  sources.push(readVerseFile(
    path.join(MEMORY_DIR, "full_book_verses.json"),
    "Local book verses",
    "symbolic_memory/full_book_verses.json",
    passages,
    seen
  ));
  sources.push(readVerseFile(
    path.join(MEMORY_DIR, "tao_te_ching.json"),
    "Tao Te Ching",
    "symbolic_memory/tao_te_ching.json",
    passages,
    seen
  ));

  const memoryVerseDirs = ["math", "medical"].map((name) => ({
    dir: path.join(MEMORY_DIR, name),
    prefix: `symbolic_memory/${name}`
  }));
  for (const { dir, prefix } of memoryVerseDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith(".json")).sort()) {
      sources.push(readVerseFile(
        path.join(dir, name),
        name.replace(/\.json$/, ""),
        `${prefix}/${name}`,
        passages,
        seen
      ));
    }
  }

  if (fs.existsSync(BOOKS_DIR)) {
    const files = listBookFiles(BOOKS_DIR, "symbolic_books");
    for (const { full, source } of files) {
      const name = path.basename(full);
      const raw = readText(full);
      if (isJunk(raw) || /^404\b/i.test(raw.trim())) {
        sources.push({ file: source, status: "unavailable", reason: "file is a 404 or empty download placeholder" });
        continue;
      }
      if (name.endsWith(".json")) {
        sources.push(readVerseFile(full, name.replace(/\.json$/, ""), source, passages, seen));
        continue;
      }
      const title = gutenbergTitle(raw, name.replace(/\.txt$/, ""));
      const chunks = chunkText(raw);
      const id = slug(title);
      let added = 0;
      chunks.forEach((context, index) => {
        const before = passages.length;
        pushPassage(passages, seen, {
          symbol: `${id}_${index + 1}`,
          context,
          title,
          source
        });
        if (passages.length > before) added += 1;
      });
      sources.push({
        file: source,
        status: added ? "indexed" : "empty",
        title,
        passages: added,
        note: name.replace(/\.txt$/, "") === slug(title) ? undefined : `filename does not match detected title "${title}"`
      });
    }
  }

  const queuePath = path.join(MEMORY_DIR, "book_queue", "combined_queue.json");
  if (process.env.YEHSA_INDEX_BOOK_QUEUE === "1" && fs.existsSync(queuePath)) {
    let added = 0;
    let skipped = 0;
    for (const entry of readNdjson(queuePath)) {
      if (!entry || typeof entry.symbol !== "string" || isJunk(entry.context) || seen.has(entry.symbol)) {
        skipped += 1;
        continue;
      }
      const before = passages.length;
      pushPassage(passages, seen, {
        symbol: entry.symbol,
        context: entry.context,
        title: "book_queue",
        source: "symbolic_memory/book_queue/combined_queue.json"
      });
      if (passages.length > before) added += 1;
    }
    sources.push({
      file: "symbolic_memory/book_queue/combined_queue.json",
      status: added ? "indexed" : "skipped",
      passages: added,
      skipped,
      note: "NDJSON queue. HTML and 404 lines are ignored. Symbols already taken from book files are not repeated."
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    passageCount: passages.length,
    sources,
    passages
  };
}

export function writeBookIndex(index = buildBookIndex()) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  return index;
}

export function loadBookIndex() {
  if (cached) return cached;
  if (fs.existsSync(INDEX_PATH)) {
    try {
      cached = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
      return cached;
    } catch (err) {
      console.warn(`books_index.json unreadable (${err.message}); rebuilding in memory`);
    }
  }
  cached = buildBookIndex();
  return cached;
}

const QUERY_STOP = new Set([
  "the", "and", "for", "with", "what", "how", "does", "about", "from", "that", "this",
  "are", "was", "who", "why", "can", "you", "your", "not", "use", "using"
]);

export function queryTokens(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((word) => word.length > 2 && !QUERY_STOP.has(word));
}

export function sourceKind(source) {
  const value = String(source || "").toLowerCase();
  if (value.includes("herbology")) return "herbology";
  if (value.includes("survival")) return "survival";
  if (value.includes("medical")) return "medical";
  if (value.includes("math")) return "math";
  return "book";
}

function domainWeight(source) {
  const kind = sourceKind(source);
  if (kind === "herbology") return 55;
  if (kind === "survival") return 48;
  if (kind === "medical") return 42;
  if (kind === "math") return 42;
  return 0;
}

function scorePassage(passage, phrase, tokens) {
  const symbol = String(passage.symbol || "").toLowerCase();
  const title = String(passage.title || "").toLowerCase();
  const context = String(passage.context || "").toLowerCase();
  const head = `${symbol} ${title}`;
  const phraseInHead = phrase.length > 2 && head.includes(phrase);
  const phraseInBody = phrase.length > 2 && context.includes(phrase);
  const tokensInHead = tokens.filter((token) => head.includes(token));
  const tokensInBody = tokens.filter((token) => context.includes(token));
  if (!phraseInHead && !phraseInBody && tokensInHead.length === 0 && tokensInBody.length === 0) return 0;
  const longest = tokens.slice().sort((a, b) => b.length - a.length)[0];
  let score = domainWeight(passage.source);
  if (symbol === phrase || title === phrase) score += 80;
  if (longest && (symbol === longest || title === longest || symbol.startsWith(`${longest}_`) || symbol.includes(longest))) {
    score += 24;
  }
  if (phraseInHead) score += 40;
  if (phraseInBody) score += context.indexOf(phrase) < 96 ? 28 : 10;
  score += tokensInHead.length * 16;
  score += Math.min(tokensInBody.length, 3) * 6;
  if (tokens.length > 1 && tokens.every((token) => head.includes(token) || context.includes(token))) score += 18;
  if (tokens.length > 1 && longest && !head.includes(longest) && !context.includes(longest)) {
    score -= tokensInHead.length > 0 ? 8 : 30;
  }
  // A gloss that only mentions the phrase in passing, under an unrelated headword.
  if ((phraseInBody || tokensInBody.length) && tokensInHead.length === 0 && !phraseInHead) score -= 25;
  return score > 0 ? score : 0;
}

export function searchBooks(query, limit = 8) {
  const phrase = String(query || "").trim().toLowerCase();
  if (phrase.length < 2) return [];
  const tokens = queryTokens(phrase);
  const index = loadBookIndex();
  const passages = Array.isArray(index.passages) ? index.passages : [];
  const ranked = [];
  for (const passage of passages) {
    const score = scorePassage(passage, phrase, tokens);
    if (score > 0) ranked.push({ ...passage, score });
  }
  ranked.sort((a, b) => b.score - a.score || String(a.symbol).localeCompare(String(b.symbol)));
  return ranked.slice(0, limit);
}

export function lookupBook(query) {
  return searchBooks(query, 1)[0] || null;
}

if (isDirectRun(import.meta.url)) {
  const index = writeBookIndex();
  console.log(`Book index written: ${index.passageCount} passages`);
  for (const source of index.sources) {
    console.log(`- ${source.status}\t${source.file}\t${source.title || ""}\t${source.reason || source.note || ""}`);
  }
}
