// Packaged dictionary for the Expo shell. The full Webster and medical lists stay on disk.
// This module has no Node filesystem calls, so Metro can bundle it.

import { PHONE_LEXICAL, PHONE_LEXICAL_META } from "../symbolic_memory/phone_lexical.js";
import { PHONE_MEDICAL, PHONE_MEDICAL_META } from "../symbolic_memory/phone_medical.js";

let lexicalMap = null;

export const phoneCorpusMeta = {
  scope: PHONE_LEXICAL_META.scope,
  headwords: PHONE_LEXICAL_META.headwords,
  medicalNames: PHONE_MEDICAL_META.names,
  rule: PHONE_LEXICAL_META.rule,
  honest: PHONE_LEXICAL_META.honest,
  medicalHonest: PHONE_MEDICAL_META.honest,
  fullCorporaRemain: PHONE_LEXICAL_META.fullCorporaRemain === true,
  websterBundled: false
};

export function phoneLexical() {
  if (!lexicalMap) lexicalMap = new Map(Object.entries(PHONE_LEXICAL));
  return lexicalMap;
}

export function lookupPhoneMedical(term) {
  const key = String(term || "").trim().toLowerCase();
  if (key.length < 2) return null;
  return PHONE_MEDICAL[key] || null;
}

export const phoneCorpus = {
  meta: phoneCorpusMeta,
  lexical: phoneLexical,
  lookupMedical: lookupPhoneMedical
};
