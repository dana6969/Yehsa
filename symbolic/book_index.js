import fs from "fs";
import path from "path";
import { queryTokens, searchPassages, sourceKind } from "./book_search.js";
import { isDirectRun } from "./direct_run.js";

export { queryTokens, sourceKind };

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
    if (name === "README.md" || name === "spiritual") continue;
    if (name === "tao_te_ching.txt" || name === "kybalion.txt") continue;
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

export function searchBooks(query, limit = 8) {
  const index = loadBookIndex();
  const passages = Array.isArray(index.passages) ? index.passages : [];
  return searchPassages(passages, query, limit);
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
