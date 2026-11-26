// R9: a quote from the texts has to be about what was asked. A book's title ("Romans", "Acts",
// "Kings") is not the subject of a question unless the question is plainly about scripture, and
// every quoted passage must contain one of the question's own subject words.
// No file access, so the phone uses the same check.
import { queryTokens, textHasToken } from "./book_search.js";

// Bible books and named texts whose names are ordinary words too.
export const BOOK_TITLE_WORDS = new Set(("genesis exodus leviticus numbers deuteronomy joshua judges ruth samuel kings chronicles ezra "
  + "nehemiah esther job psalm psalms proverbs ecclesiastes song songs solomon isaiah jeremiah lamentations ezekiel daniel hosea joel amos "
  + "obadiah jonah micah nahum habakkuk zephaniah haggai zechariah malachi matthew mark luke john acts romans corinthians galatians "
  + "ephesians philippians colossians thessalonians timothy titus philemon hebrews james peter jude revelation revelations").split(" "));

const SCRIPTURE_CONTEXT = /\b(verse|verses|chapter|chapters|epistle|epistles|paul|apostle|apostles|bible|biblical|scripture|scriptures|gospel|gospels|kjv|testament|book of|letter to the|psalm|psalms|\d{1,3}:\d{1,3})\b/i;

// Words that frame a question, not its subject.
const FRAME = new Set("what does say says said about tell show text texts quote quotes line lines passage passages mean means meaning teach teaches think thought".split(" "));

export function scriptureContext(raw) {
  const text = String(raw || "");
  if (SCRIPTURE_CONTEXT.test(text)) return true;
  // "What does Romans say about sin?", "according to Acts": the book itself is asked about.
  const m = text.match(/\b(?:what (?:does|do|did)|according to|in the book of)\s+(?:the\s+)?(?:first |second |1 |2 )?([a-z]+)\b(?:\s+(?:say|says|teach|tell))?/i);
  return Boolean(m && BOOK_TITLE_WORDS.has(m[1].toLowerCase()) && (/\b(?:say|says|teach|tell)\b/i.test(text) || /according to|book of/i.test(text)));
}

/** The question's subject words. A book-title word counts only when the question is about scripture. */
export function subjectTerms(raw) {
  const context = scriptureContext(raw);
  return queryTokens(String(raw || "").replace(/[?]/g, " "))
    .filter((t) => !FRAME.has(t))
    .filter((t) => context || !BOOK_TITLE_WORDS.has(t));
}

/** True when a book-title word in the question is only that: a word, with no scripture context. */
export function titleWordOnly(raw, token) {
  return BOOK_TITLE_WORDS.has(String(token || "").toLowerCase()) && !scriptureContext(raw);
}

/** Keep the passages whose own words contain a subject word of the question. */
const STRUCTURE = new Set("chapter chapters verse verses epistle epistles book books bible scripture scriptures gospel gospels testament kjv psalm psalms letter".split(" "));

export function onSubject(raw, passages) {
  const context = scriptureContext(raw);
  // In a question about a book of scripture, the book and "chapter" are where to look, not the subject.
  const terms = subjectTerms(raw).filter((t) => !(context && (BOOK_TITLE_WORDS.has(t) || STRUCTURE.has(t) || /^\d+$/.test(t))));
  if (!terms.length) return context ? [...(passages || [])] : [];
  return (passages || []).filter((p) => terms.some((t) => textHasToken(String(p?.text || ""), t)));
}
