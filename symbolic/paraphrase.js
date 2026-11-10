// Field wording folded onto the words the notes already use.
// The raw question is kept for premise checks. This is not a learned model.

const PHRASES = [
  [/\bdrying out\b/g, "dehydration"],
  [/\bdried out\b/g, "dehydration"],
  [/\bparched\b/g, "dehydration"],
  [/\bwhistle blasts?\b/g, "distress signal"],
  [/\bdistress signal\b/g, "distress signal"],
  [/\bbroken bones?\b/g, "splint"],
  [/\bfrostbitten\b/g, "frostbite"],
  [/\bfrozen (?:skin|fingers|toes|feet|hands)\b/g, "frostbite"],
  [/\bboil(?:ing|ed)?\b/g, "boil"],
  [/\btreat(?:ing)? water\b/g, "boil water"]
];

export function expandParaphrase(input) {
  let text = String(input || "");
  for (const [pattern, replacement] of PHRASES) text = text.replace(pattern, replacement);
  return text;
}
