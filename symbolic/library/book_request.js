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
  return { req, search: { query: req.target, format: "any" } };
}

export function pendingLine(req, title) {
  const what = req.kind === "chapters" ? "its chapters" : req.kind === "chapter" ? `chapter ${req.n === -1 ? "the last one" : req.n}` : req.kind === "summary" ? "a summary" : req.kind === "about" ? `what it says about ${req.topic}` : "it";
  return `"${title}" isn't on this phone yet. Tap Download on the one you want, and I'll give you ${what} from its own text as soon as it's saved.`;
}
