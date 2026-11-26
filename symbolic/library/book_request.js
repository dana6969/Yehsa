// R7: what to do with a question about a whole book or document (see docs/doc_intents.js).
// Pure, so the Ask flow and the tests share it:
//   { req, entry }          the book is on this phone: answer from it
//   { req, offer: found }   it was just listed by "download X": offer those Downloads again,
//                           then answer once one is saved
//   { req, search: intent } not on the phone and clearly a document: search for it (nothing
//                           downloads until a tap), then answer once one is saved
//   null                    not a book question: the ordinary Ask path
import { docRequest } from "../docs/doc_intents.js";
import { matchTitle } from "./library.js";

export function planBookRequest(text, { entries = [], recentFound = null } = {}) {
  const req = docRequest(text);
  if (!req) return null;
  const hit = matchTitle(entries, req.target);
  // "What does the Dhammapada say about hatred?" stays with the scripture and manual quoting that
  // already answers it; the whole-book path only takes "about" for documents and imported books.
  if (hit && req.kind === "about" && (hit.entry.kind === "book" || hit.entry.kind === "manual")) return null;
  if (hit) return { req, entry: hit.entry };
  if (recentFound?.candidates?.length) {
    const names = [{ id: "query", title: recentFound.query || "" }, ...recentFound.candidates.map((c) => ({ id: c.id, title: c.title }))];
    if (matchTitle(names, req.target)) return { req, offer: recentFound };
  }
  if (req.needsMatch || req.kind === "open") return null;
  return { req, search: { query: req.target, format: "any", book: true } };
}

/** Can any listed copy actually be downloaded (a real file, under the size cap)? */
export function hasDownloadable(found) {
  return Boolean(found?.candidates?.some((c) => c.downloadable !== false && !c.tooBig));
}

export function pendingLine(req, title, found = null) {
  if (found && !hasDownloadable(found)) {
    const why = found.candidates?.some((c) => c.tooBig) ? "the copies I found are over the 50 MB download limit or are library web pages" : "the copies I found are library web pages, not files I can save";
    return `"${title}" isn't on this phone yet, and ${why}. You can open them in the browser below.${req.kind === "page" ? ` I can't read you page ${req.n} until a copy is saved on this phone.` : ""}`;
  }
  if (req.kind === "page") {
    return `"${title}" isn't on this phone yet, so I can't read you page ${req.n}. Here are copies I can download. Tap Download on one, and I'll show page ${req.n} from its own text as soon as it's saved.`;
  }
  const what = req.kind === "chapters" ? "its chapters" : req.kind === "chapter" ? `chapter ${req.n === -1 ? "the last one" : req.n}` : req.kind === "summary" ? "a summary" : req.kind === "about" ? `what it says about ${req.topic}` : "it";
  return `"${title}" isn't on this phone yet. Tap Download on the one you want, and I'll give you ${what} from its own text as soon as it's saved.`;
}
