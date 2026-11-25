// R8: what the reasoner reads, in one shape: { id, title, pageKind, chunks: [{ id, page, text }],
// readerId, docId, version }. From a saved document's sealed body, a reader book, or field notes.
import { buildSections } from "../docs/doc_sections.js";

export function sourceFromDoc(meta, body) {
  if (!meta || !body) return null;
  const sections = body.sections?.length ? body.sections : buildSections(body.pages || []);
  return {
    id: `doc:${meta.id}`,
    docId: meta.id,
    readerId: `doc:${meta.id}`,
    title: meta.title,
    pageKind: meta.pageKind || "page",
    version: `${sections.length}:${meta.sections || ""}`,
    chunks: sections.map((s) => ({ id: s.id, page: s.page, text: `${s.heading ? `${s.heading}. ` : ""}${s.text}` }))
  };
}

export function sourceFromBook(book) {
  if (!book?.pages?.length) return null;
  const sections = book.sections?.length ? book.sections : buildSections(book.pages);
  return {
    id: book.id,
    docId: book.docId || null,
    readerId: book.id,
    title: book.title,
    pageKind: book.pageKind || "page",
    version: `${book.pages.length}`,
    chunks: sections.map((s) => ({ id: s.id, page: s.page, text: s.text }))
  };
}

/** The field notes (books_index passages) as one source; "page" is the passage number. */
export function sourceFromNotes(passages, title = "Yehsa's field notes") {
  const list = (passages || []).filter((p) => p?.context);
  if (!list.length) return null;
  return {
    id: "notes:field",
    readerId: null,
    title,
    pageKind: "note",
    version: `${list.length}`,
    chunks: list.map((p, i) => ({ id: p.symbol || `n${i}`, page: i + 1, text: p.context }))
  };
}
