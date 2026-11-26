// R10: spoken words for a search box. Drops a leading "search for", "find", "look up", "go to" and
// trailing punctuation the recognizer adds, so "Search for water filter." searches "water filter".
export function voiceSearchText(text) {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  t = t.replace(/^(?:(?:ok(?:ay)?|hey|yehsa)[, ]+)*/i, "");
  t = t.replace(/^(?:please\s+)?(?:search(?: for)?|find(?: me)?|look up|look for|go to|open|show me)\s+/i, "");
  t = t.replace(/[.!?,;:]+$/g, "").trim();
  return t;
}

// The More list narrowed to a typed or spoken search: every word must appear in the label or hint.
export function filterMoreItems(items, query) {
  const words = voiceSearchText(query).toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return items;
  return items.filter((item) => {
    const hay = `${item.label} ${item.hint || ""} ${item.id}`.toLowerCase();
    return words.every((w) => hay.includes(w) || hay.includes(w.replace(/s$/, "")));
  });
}
