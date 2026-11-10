// Decide when a question is about the texts, not a field note.
// No file access, so the phone shell can use the same check.

export function isFieldLightQuestion(raw) {
  return /\b(daylight|sunlight|hours of light|summer light|winter dark|arctic|tundra|headlamp|camp(?:site)? light|field light|night light)\b/i.test(String(raw || ""));
}

export function isSpiritualQuestion(raw) {
  const text = String(raw || "");
  if (isFieldLightQuestion(text)) return false;
  if (/\b(life-threatening|tourniquet|splint|dehydration|frostbite)\b/i.test(text)) return false;
  if (/\b(meaning of life|purpose of life|why are we here|why do we live|what is the soul|what is god|what is the tao|afterlife|scripture|spiritual)\b/i.test(text)) return true;
  if (/\bwhat is light\b/i.test(text)) return true;
  if (/\bwhat is (?:a |the )?(?:soul|spirit|heaven|salvation)\b/i.test(text)) return true;
  return false;
}

export function routesToSpiritual(raw, parsed) {
  if (isFieldLightQuestion(raw)) return false;
  if (/\b(life-threatening|tourniquet|splint|dehydration|frostbite)\b/i.test(String(raw || ""))) return false;
  return isSpiritualQuestion(raw) || parsed?.domain === "spiritual";
}
