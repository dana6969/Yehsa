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
  const waterSafety = /\b(?:treat(?:ing)?|purif\w*|disinfect\w*|safer|unsafe|cloudy|creek|charcoal|boil(?:ing)?)\b(?:\W+\w+){0,4}\W+water\b/i.test(text)
    || /\bwater\b(?:\W+\w+){0,4}\W+(?:safer|unsafe|cloudy|boil(?:ing)?)\b/i.test(text);
  if (waterSafety) text = text.replace(/\b(?<!boil\s)(?:drink(?:ing)?\s+)?water\b/gi, "boil water");
  if (/\bright(?:[-\s]+angled)?\s+triangle\b/i.test(text) && !/\bhypotenuse\b/i.test(text)) text = `${text} hypotenuse`;
  if (/\b(?:eat|taste|tasting)\b/i.test(text) && /\bplant\b/i.test(text) && !/\bidentif/i.test(text)) text = `${text} identified`;
  return text;
}
