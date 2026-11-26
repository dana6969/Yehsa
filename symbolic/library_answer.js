// "What do you have for army manuals?" is a question about Yehsa's own library, not a field topic.
// It gets a plain list of what is on this phone, never a field note picked by a stray word.

const LIBRARY = /\b(?:what|which)\b[^?]{0,40}\b(?:do you have|have you got|you got|is (?:on|in) (?:this|the|your)|are (?:on|in) (?:this|the|your)|do you hold|do you carry|do you know)\b[^?]{0,40}\b(?:army|military|field|survival|first aid)?\s*(?:manuals?|books?|library|sources?|references?|publications?|pubs|atps?|field manuals?|fms?|documents?)\b/i;
const LIBRARY_SHORT = /^\s*(?:list|show|tell me)\b[^?]{0,20}\b(?:your |the )?(?:army |military |field |survival )?(?:manuals?|books?|library|sources?)\b|^\s*(?:what(?:'s| is) in )?(?:your |the )?(?:library|manuals?)\s*\??\s*$|\b(?:army|military|field) manuals?\b[^?]{0,20}\b(?:do you have|you have|on (?:this|the) phone)\b|\bdo you have (?:any |the )?(?:army|military|field|survival) manuals?\b/i;

const LIBRARY_WHICH = /\b(?:what|which)\s+(?:army |military |field |survival )?(?:manuals?|books?|sources?|references?|publications?)\s+(?:do you have|have you got|are (?:on|in)|do you (?:hold|carry|use))\b/i;

export function isLibraryQuestion(text) {
  const raw = String(text || "");
  return LIBRARY.test(raw) || LIBRARY_SHORT.test(raw) || LIBRARY_WHICH.test(raw);
}

function monthYear(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * pack: the ATP pack (assets/atp/atp_sections.json) or null. counts: { books, learned } on this phone.
 * Returns an answer-shaped result (kind "about", so no opener or follow-up is added).
 */
export function libraryAnswer(pack, { books = 0, learned = 0 } = {}) {
  const lines = ["Here is what I carry on this phone. It all works offline."];
  const pubs = pack?.pubs || [];
  if (pubs.length) {
    lines.push("Army manuals (US Government, approved for public release):");
    for (const pub of pubs) {
      const sections = (pack.sections || []).filter((section) => section.pub === pub.pub);
      const chapters = [...new Set(sections.map((section) => section.chapter).filter(Boolean))];
      const shown = chapters.slice(0, 8).join(", ");
      lines.push(`• ${pub.pub}, ${pub.title}${pub.date ? ` (${monthYear(pub.date)})` : ""}: ${sections.length} paragraphs${shown ? `. Chapters: ${shown}${chapters.length > 8 ? `, and ${chapters.length - 8} more` : ""}` : ""}.`);
    }
  } else {
    lines.push("The Army manual pack (ATP 3-50.21 Survival and ATP 4-02.11 First Aid) did not load on this phone.");
  }
  lines.push("• Field notes on first aid, water, fire, shelter, food, plants, navigation, weather, hunting and the home, with a picture guide and a dictionary.");
  if (books > 0) lines.push(`• ${books} book${books === 1 ? "" : "s"} you imported.`);
  if (learned > 0) lines.push(`• ${learned} note${learned === 1 ? "" : "s"} you kept from looking things up.`);
  lines.push("Ask a question in plain words. When a manual covers it, I quote it by paragraph, like \"ATP 3-50.21, para 4-81\".");
  return { answered: true, text: lines.join("\n"), kind: "about", symbol: "library", confident: true };
}
