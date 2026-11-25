// R9: a quoted passage reads cleanly. Words split across a line break ("sur- prising") are joined,
// quote marks that only half survive the page are dropped, and inner double quotes become single
// ones so Yehsa's own quote marks stay balanced. The words themselves are never changed.
const KEEP_HYPHEN = new Set(["self", "well", "half", "non", "ex", "all", "so", "long", "short", "high", "low", "old", "new", "anti", "pre", "post", "semi", "co", "great", "ill", "far", "near", "one", "two", "three", "four", "five", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]);

export function cleanQuote(text) {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  // "sur- prising", "sur-\nprising": a line-break hyphen inside one word.
  t = t.replace(/\b([A-Za-z]{2,})- ([a-z]{2,})\b/g, (all, a, b) => (KEEP_HYPHEN.has(a.toLowerCase()) ? `${a}-${b}` : `${a}${b}`));
  // Curly and straight double quotes: one kind, and none left over at the ends.
  t = t.replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"').replace(/[\u2018\u2019]/g, "'");
  t = t.replace(/^["'\s]+(?=[A-Za-z0-9])/, "").replace(/(?<=[A-Za-z0-9.!?,;:)])["\s]+$/, "");
  const count = (t.match(/"/g) || []).length;
  if (count % 2 === 1) t = t.replace(/"/g, "");
  t = t.replace(/"([^"]*)"/g, "'$1'");
  return t.replace(/\s+([,.;:!?])/g, "$1").trim();
}

/** Yehsa's quote of a passage: one pair of double quotes around the cleaned words. */
export function quoted(text) {
  return `"${cleanQuote(text)}"`;
}
