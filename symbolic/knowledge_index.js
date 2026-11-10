import fs from "fs";
import path from "path";
import { searchBooks } from "./book_index.js";
import { recallFromCorpora } from "./knowledge_rank.js";
import { forEachGloss as scanGlosses, lookupGloss } from "./gloss_index.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MEDICAL_LISTS = [
  ["symbolic_memory/medical_terms_only.txt", "medical_terms_only"],
  ["codesante_en.txt", "codesante_en"],
  ["glutanimate.txt", "glutanimate"]
];
let medicalTerms = null;

function loadMedicalTerms() {
  if (medicalTerms) return medicalTerms;
  const names = new Map();
  for (const [rel, source] of MEDICAL_LISTS) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\n/)) {
      const term = line.trim();
      if (term.length < 2 || term.length > 160) continue;
      const key = term.toLowerCase();
      if (!names.has(key)) names.set(key, rel);
    }
  }
  medicalTerms = names;
  return names;
}

export function lookupMedical(term) {
  const key = String(term || "").trim().toLowerCase();
  if (key.length < 2) return null;
  const source = loadMedicalTerms().get(key);
  if (!source) return null;
  const label = MEDICAL_LISTS.find(([rel]) => rel === source)?.[1] || source;
  return {
    kind: "medical",
    symbol: key,
    text: `Listed name in ${label}. Offline reference only. Not a diagnosis, dose, or substitute for emergency services.`,
    source
  };
}

export function lookupHeadword(term) {
  return lookupGloss(term);
}

export function forEachGloss(fn) {
  scanGlosses(fn);
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
