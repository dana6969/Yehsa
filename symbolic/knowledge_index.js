import fs from "fs";
import path from "path";
import { queryTokens, searchBooks, sourceKind } from "./book_index.js";

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

function clip(text, limit) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1).trimEnd()}…`;
}

function addHit(bag, hit) {
  if (!hit || !hit.symbol || !hit.text || !(hit.score > 0)) return;
  const key = `${hit.kind}:${String(hit.symbol).toLowerCase()}`;
  const prev = bag.get(key);
  if (!prev || hit.score > prev.score) bag.set(key, hit);
}

function collectKnowledge(query) {
  const phrase = String(query || "").trim().toLowerCase();
  const tokens = queryTokens(phrase);
  const longest = tokens.slice().sort((a, b) => b.length - a.length)[0] || "";
  const bag = new Map();

  for (const passage of searchBooks(phrase, 8)) {
    const kind = sourceKind(passage.source);
    addHit(bag, {
      kind,
      symbol: passage.symbol,
      text: clip(passage.context, 320),
      title: passage.title || "",
      source: passage.source || "",
      score: passage.score
    });
  }

  const medicalKeys = [phrase, ...tokens];
  for (const key of medicalKeys) {
    const hit = lookupMedical(key);
    if (!hit) continue;
    // Name lists are not field notes. Keep them as a weak hint, under real glosses.
    const nameOnly = /Listed name in /.test(hit.text);
    const exact = key === phrase ? 20 : (key === longest ? 12 : 4);
    addHit(bag, {
      kind: "medical",
      symbol: hit.symbol,
      text: clip(hit.text, 320),
      title: "",
      source: hit.source,
      score: (nameOnly ? 6 : 42) + exact
    });
  }

  if (phrase || tokens.length) {
    for (const [key, text] of loadLexical()) {
      const related = key === phrase || tokens.includes(key) || (longest && key.includes(longest));
      if (!related) continue;
      let score = 18;
      if (key === phrase) score += 70;
      else if (key === longest) score += 46;
      else if (tokens.includes(key)) score += 22;
      else if (longest && key.includes(longest)) score += 28;
      else score += 8;
      const gloss = String(text).toLowerCase();
      const namedInQuestion = key === phrase || tokens.includes(key);
      if (!namedInQuestion && longest && !gloss.includes(longest)) {
        // A nearby headword that never mentions the subject of the question.
        score -= 22;
      }
      addHit(bag, {
        kind: "dictionary",
        symbol: key,
        text: clip(text, 320),
        title: "",
        source: "lexical-headword",
        score
      });
    }
  }

  return [...bag.values()]
    .filter((hit) => hit.score >= 20)
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
    .slice(0, 5);
}

function synthesize(hits) {
  const best = hits[0];
  const lead = `${best.symbol}: ${best.text}`;
  const rest = hits.slice(1, 4).map((hit) => `${hit.symbol} (${hit.kind}): ${clip(hit.text, 160)}`);
  if (rest.length === 0) return lead;
  return `${lead}\nAlso: ${rest.join(" | ")}`;
}

export function recallKnowledge(query) {
  const raw = String(query || "").trim();
  if (raw.length < 2) return null;
  // Ranked read across the small book index and dictionary headwords.
  // getMappedAction does not call this.
  const hits = collectKnowledge(raw);
  if (hits.length === 0) return null;
  const best = hits[0];
  const answer = synthesize(hits);
  return {
    kind: best.kind,
    symbol: best.symbol,
    text: answer,
    title: best.title,
    source: best.source,
    hits,
    answer
  };
}
