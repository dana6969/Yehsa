import fs from "fs";
import path from "path";
import { lookupBook } from "./book_index.js";

const MEMORY = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "symbolic_memory");

let lexical = null;

function readObject(file) {
  const full = path.join(MEMORY, file);
  if (!fs.existsSync(full)) return {};
  const text = fs.readFileSync(full, "utf8").trim();
  if (!text || /^404\b/i.test(text)) return {};
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (err) {
    console.warn(`Skipping ${file}: ${err.message}`);
    return {};
  }
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

function loadLexical() {
  if (lexical) return lexical;
  const map = new Map();
  // Smaller committed glosses win over the large Webster dumps.
  for (const [key, value] of Object.entries(readObject("wordnet_raw.json"))) remember(map, key, value);
  for (const [key, value] of Object.entries(readObject("dictionary_memory.json"))) remember(map, key, value);
  for (const [key, value] of Object.entries(readObject("full_dictionary.json"))) remember(map, key, value);
  for (const [key, value] of Object.entries(readObject("webster_raw.json"))) remember(map, key, value);
  lexical = map;
  return map;
}

export function lookupLexical(term) {
  const key = String(term || "").trim().toLowerCase();
  if (!key) return null;
  return loadLexical().get(key) || null;
}

export function recallKnowledge(query) {
  const raw = String(query || "").trim();
  if (raw.length < 2) return null;
  const lexicalHit = lookupLexical(raw);
  if (lexicalHit) return { kind: "dictionary", symbol: raw.toLowerCase(), text: lexicalHit };
  const bookHit = lookupBook(raw);
  if (bookHit) return { kind: "book", symbol: bookHit.symbol, text: bookHit.context, title: bookHit.title, source: bookHit.source };
  const words = raw.toLowerCase().split(/[^a-z0-9_-]+/).filter((word) => word.length > 3);
  for (const word of words) {
    const text = lookupLexical(word);
    if (text) return { kind: "dictionary", symbol: word, text };
  }
  return null;
}
