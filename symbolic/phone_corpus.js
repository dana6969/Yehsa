// Packaged dictionary for the Expo shell. The full Webster and medical lists stay on disk.
// This module has no Node filesystem calls, so Metro can bundle it.
// The pack is the same merge npm run ask reads. Glosses are not shortened.

import { PHONE_LEXICAL_PACK, PHONE_LEXICAL_META } from "../symbolic_memory/phone_lexical.js";
import { PHONE_MEDICAL_PACK, PHONE_MEDICAL_META } from "../symbolic_memory/phone_medical.js";

const MEDICAL_LABEL = {
  m: ["medical_terms_only", "symbolic_memory/medical_terms_only.txt"],
  c: ["codesante_en", "codesante_en.txt"],
  g: ["glutanimate", "glutanimate.txt"]
};

const NAME_TEXT = "Listed name in ";
const NAME_TAIL = ". Offline reference only. Not a diagnosis, dose, or substitute for emergency services.";

let lexicalMap = null;
let medicalMap = null;

function linesOf(pack) {
  return String(pack || "").length ? String(pack).split("\n") : [];
}

export const phoneCorpusMeta = {
  scope: PHONE_LEXICAL_META.scope,
  headwords: PHONE_LEXICAL_META.headwords,
  medicalNames: PHONE_MEDICAL_META.names,
  rule: PHONE_LEXICAL_META.rule,
  honest: PHONE_LEXICAL_META.honest,
  medicalHonest: PHONE_MEDICAL_META.honest,
  fieldNoteHonest: PHONE_LEXICAL_META.fieldNoteHonest,
  fieldNotesComplete: PHONE_LEXICAL_META.fieldNotesComplete === true,
  fieldNotes: PHONE_LEXICAL_META.fieldNotes,
  fullCorporaRemain: PHONE_LEXICAL_META.fullCorporaRemain === true,
  websterBundled: PHONE_LEXICAL_META.websterBundled === true,
  sources: PHONE_LEXICAL_META.sources
};

export function phoneLexical() {
  if (lexicalMap) return lexicalMap;
  const map = new Map();
  for (const line of linesOf(PHONE_LEXICAL_PACK)) {
    const pair = JSON.parse(line);
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || !pair[0]) continue;
    if (typeof pair[1] !== "string" || !pair[1]) continue;
    map.set(pair[0], pair[1]);
  }
  lexicalMap = map;
  return lexicalMap;
}

function loadMedical() {
  if (medicalMap) return medicalMap;
  const map = new Map();
  for (const line of linesOf(PHONE_MEDICAL_PACK)) {
    const row = JSON.parse(line);
    if (!Array.isArray(row) || row.length !== 3) continue;
    const [key, symbol, code] = row;
    if (typeof key !== "string" || !MEDICAL_LABEL[code] || typeof symbol !== "string") continue;
    map.set(key, { symbol, code });
  }
  medicalMap = map;
  return medicalMap;
}

export function lookupPhoneMedical(term) {
  const key = String(term || "").trim().toLowerCase();
  if (key.length < 2) return null;
  const hit = loadMedical().get(key);
  if (!hit) return null;
  const [label, source] = MEDICAL_LABEL[hit.code];
  return {
    kind: "medical",
    symbol: hit.symbol,
    text: `${NAME_TEXT}${label}${NAME_TAIL}`,
    source
  };
}

export function phoneMedicalSize() {
  return loadMedical().size;
}

export const phoneCorpus = {
  meta: phoneCorpusMeta,
  lexical: phoneLexical,
  lookupMedical: lookupPhoneMedical
};
