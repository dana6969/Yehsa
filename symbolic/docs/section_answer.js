// R10: the answer for a question that names a part of a document ("what's my second amendment",
// "article 1 section 8", "chapter 3 of the canning guide"): the text under that exact heading, quoted
// first, with its page, an Open-in-reader target, and for an amendment the date it was ratified.
import { findSection, parseSectionRef, sectionQuote } from "./section_ref.js";

export const CONSTITUTION_BOOK_ID = "book:us-constitution";
export const CONSTITUTION_TITLE = "The Constitution of the United States (National Archives transcription)";
const DOWNLOAD_OFFER = "No copy of the Constitution is downloaded on this phone, so this is the National Archives text Yehsa carries. To keep the official GovInfo edition too, ask: \"download the Constitution from GovInfo\".";

/** Is this a lookup of a part of a document, not a field question that happens to say "section"? */
export function sectionLookup(question, ref = parseSectionRef(question)) {
  if (!ref) return false;
  if (ref.constitution || ref.kind === "amendment" || ref.kind === "preamble" || ref.kind === "bill-of-rights") return true;
  const q = String(question || "").toLowerCase();
  if (/\b(?:what does|what's in|whats in|what is in|says?|read(?: me)?|show me|quote|text of|wording of|words of)\b/.test(q)) return true;
  return q.trim().split(/\s+/).length <= 6;
}

function ratifiedLine(ref, found, fallback) {
  if (ref.kind !== "amendment" && ref.kind !== "bill-of-rights") return null;
  const date = found.ratified || fallback?.ratified || null;
  if (!date) return null;
  const billOfRights = ref.kind === "bill-of-rights" || ref.n <= 10;
  const from = "";
  return billOfRights
    ? `Ratified ${date}, as part of the Bill of Rights, the first ten amendments${from}.`
    : `Ratified ${date}${from}.`;
}

const norm = (t) => String(t || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/(^| )\d{1,2}(?= |$)/g, "").replace(/ +/g, " ").trim();

/**
 * R11: does the downloaded copy carry the same words under that heading? The first ten words of the
 * National Archives text must open the copy's text there. Notes and annotations around it do not matter.
 */
export function sameSectionText(docText, canonicalText) {
  const words = norm(canonicalText).split(" ").slice(0, 10).join(" ");
  if (words.length < 12) return false;
  return norm(docText).slice(0, 900).includes(words);
}

/**
 * source: { title, url, bookId, docId, pages, bundled }. fallbackPages: the bundled Constitution's
 * pages, for a ratification date the download does not print. Returns an answer or null.
 */
export function sectionAnswer(question, source, { ref = parseSectionRef(question), fallbackPages = null, canonicalPages = null } = {}) {
  if (!ref || !source?.pages) return null;
  const located = findSection(source.pages, ref);
  if (!located) return null;
  let found = located;
  let canonical = false;
  // R11: a downloaded Constitution (GovInfo, the House Manual) prints notes and annotations around and
  // between the clauses. The quote is the National Archives text; the copy gives the page and the
  // reader link, only when its heading has the same words. Otherwise the caller uses the bundled text.
  if (!source.bundled && canonicalPages) {
    const canon = findSection(canonicalPages, ref);
    if (!canon || !sameSectionText(located.text, canon.text)) return null;
    found = { ...located, text: canon.text, ratified: canon.ratified || located.ratified || null };
    canonical = true;
  }
  const fallback = fallbackPages && !found.ratified && ref.kind === "amendment" ? findSection(fallbackPages, ref) : null;
  const { text: quoteText, more } = sectionQuote(found.text, ref.kind === "bill-of-rights" ? 420 : 900);
  const where = source.bundled
    ? `From the U.S. Constitution on this phone (National Archives transcription), page ${found.page}`
    : `From downloaded document "${source.title}", page ${found.page}`;
  const heading = ref.kind === "bill-of-rights" ? "the Bill of Rights, beginning with Amendment I" : ref.label;
  const lines = [`${where}: ${heading}`, `"${quoteText}" [1]${canonical ? "[2]" : ""}${more ? " (continues in the reader)" : ""}`];
  const rat = ratifiedLine(ref, found, fallback);
  const usedFallback = Boolean(rat && !found.ratified && fallback?.ratified);
  if (rat) lines.push(`${rat} [${usedFallback || canonical ? 2 : 1}]`);
  if (ref.kind === "bill-of-rights") lines.push("Ask for any one by number, for example \"the fourth amendment\".");
  let cite = `[1] "${source.title}", page ${found.page}${source.url ? `. ${source.url}` : ""}`;
  if (canonical) cite += `\n[2] "${CONSTITUTION_TITLE}" (the wording quoted). https://www.archives.gov/founding-docs`;
  else if (usedFallback) cite += `\n[2] "${CONSTITUTION_TITLE}", page ${fallback.page}. https://www.archives.gov/founding-docs`;
  lines.push(`Sources:\n${cite}`);
  if (source.bundled && ref.constitution) lines.push(DOWNLOAD_OFFER);
  const text = lines.join("\n\n");
  return {
    answered: true,
    voiced: true,
    kind: "document",
    offerDomain: "document",
    symbol: null,
    text,
    source: source.bundled ? CONSTITUTION_TITLE : `Downloaded document: ${source.title}`,
    docId: source.docId || null,
    section: { ref, heading: found.heading, page: found.page },
    reader: { bookId: source.bookId, page: found.page, title: source.title },
    citations: [{ n: 1, sourceId: source.bookId, sourceName: source.title, ref: `page ${found.page}`, title: source.title, url: source.url || null, page: found.page, docId: source.docId || null }],
    confident: true,
    noOffer: true
  };
}

/** Which downloaded documents to look in, best first. entries: [{ meta, body }]. */
const CONSTITUTION_KINDS = new Set(["amendment", "article", "preamble", "bill-of-rights"]);
const isConstitution = (e) => /constitution/i.test(e?.meta?.title || "") || /constitution of the united states/i.test(String((e?.body?.pages || []).slice(0, 12).join(" ")));

export function sectionCandidates(entries, ref, named = null) {
  const list = entries.filter((e) => e?.body?.pages?.length);
  if (named) return list.filter((e) => e.meta.id === named);
  if (ref.constitution) return list.filter(isConstitution);
  return list;
}

/** The section answer from downloaded documents (entries), then the bundled Constitution, or null. */
export function documentSectionAnswer(question, { entries = [], named = null, constitutionPages = null } = {}) {
  const ref = parseSectionRef(question);
  if (!ref || !sectionLookup(question, ref)) return null;
  for (const e of sectionCandidates(entries, ref, named)) {
    const got = sectionAnswer(question, { title: e.meta.title, url: e.meta.url, bookId: `doc:${e.meta.id}`, docId: e.meta.id, pages: e.body.pages }, {
      ref,
      fallbackPages: ref.constitution ? constitutionPages : null,
      canonicalPages: ref.constitution || (CONSTITUTION_KINDS.has(ref.kind) && isConstitution(e)) ? constitutionPages : null
    });
    if (got) return got;
  }
  // "article 1 section 8" with no downloaded document that has it: the Constitution on the phone.
  if ((ref.constitution || ref.kind === "article") && constitutionPages && (!named || ref.constitution)) {
    const got = sectionAnswer(question, { title: CONSTITUTION_TITLE, url: "https://www.archives.gov/founding-docs", bookId: CONSTITUTION_BOOK_ID, pages: constitutionPages, bundled: true }, { ref });
    // A Constitution is downloaded but its page did not match: no offer to download another.
    if (got && sectionCandidates(entries, ref, named).length) got.text = got.text.replace(`\n\n${DOWNLOAD_OFFER}`, "");
    return got;
  }
  return null;
}
