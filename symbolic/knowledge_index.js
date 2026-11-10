import fs from "fs";
import path from "path";
import { searchBooks } from "./book_index.js";
import { recallFromCorpora } from "./knowledge_rank.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MEDICAL_LISTS = [
  ["symbolic_memory/medical_terms_only.txt", "medical_terms_only"],
  ["codesante_en.txt", "codesante_en"],
  ["glutanimate.txt", "glutanimate"]
];
let medicalTerms = null;

function loadMedicalTerms() {
  if (medicalTerms) return medicalTerms;
  const map = new Map();
  for (const [rel, source] of MEDICAL_LISTS) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\n/)) {
      const term = line.trim();
      if (term.length < 2 || term.length > 160) continue;
      const key = term.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          kind: "medical",
          symbol: term,
          text: `Listed name in ${source}. Offline reference only. Not a diagnosis, dose, or substitute for emergency services.`,
          source: rel
        });
      }
    }
  }
  medicalTerms = map;
  return map;
}

export function lookupMedical(term) {
  const key = String(term || "").trim().toLowerCase();
  if (key.length < 2) return null;
  return loadMedicalTerms().get(key) || null;
}

const MEMORY = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "symbolic_memory");

let smallLexical = null;
let websterLexical = null;

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

function loadSmallLexical() {
  if (smallLexical) return smallLexical;
  const map = new Map();
  for (const [key, value] of Object.entries(readObject("wordnet_raw.json"))) remember(map, key, value);
  for (const [key, value] of Object.entries(readObject("dictionary_memory.json"))) remember(map, key, value);
  for (const [key, value] of Object.entries(readObject("full_dictionary.json"))) remember(map, key, value);
  smallLexical = map;
  return map;
}

function loadWebster() {
  if (websterLexical) return websterLexical;
  const map = new Map();
  for (const [key, value] of Object.entries(readObject("webster_raw.json"))) remember(map, key, value);
  websterLexical = map;
  return map;
}

export function lookupHeadword(term) {
  const key = String(term || "").trim().toLowerCase();
  if (!key) return null;
  if (loadSmallLexical().has(key)) return loadSmallLexical().get(key);
  return loadWebster().get(key) || null;
}

export function forEachGloss(fn) {
  const small = loadSmallLexical();
  for (const [key, value] of small) fn(key, value);
  for (const [key, value] of loadWebster()) {
    if (!small.has(key)) fn(key, value);
  }
}

export function lookupLexical(term) {
  return lookupHeadword(term);
}

// Full questions are parsed first. getMappedAction does not call this.
export function recallKnowledge(query) {
  return recallFromCorpora(query, {
    search: searchBooks,
    lookupMedical,
    lookupHeadword,
    forEachGloss,
    lexical: () => {
      const map = new Map();
      forEachGloss((key, value) => map.set(key, value));
      return map;
    }
  });
}
