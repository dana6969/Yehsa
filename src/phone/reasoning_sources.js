// R8: the sources the reasoner reads on this phone: saved documents (their sealed text), the
// books and manuals in the app, and the field notes. Loaded only for a named-document question or
// a broad synthesis question, never at launch and never on getMappedAction's path.
import { BUNDLED_BOOKS, MANUALS } from "../../symbolic/library/library.js";
import { sourceFromBook, sourceFromDoc, sourceFromNotes } from "../../symbolic/reasoning/sources.js";
import { documents } from "./documents.js";
import { loadBook } from "./library_source.js";

export function savedDocs() {
  return documents.snapshot().catalog?.docs || [];
}

/** One saved document as a source, or { empty: true } when it has no readable text. */
export async function docSource(meta) {
  const body = await documents.body(meta.id);
  if (!body?.pages?.length || !body.pages.some((p) => String(p || "").trim().length > 40)) return { empty: true };
  return sourceFromDoc(meta, body);
}

export async function allSources(fieldPassages, { onStep = null } = {}) {
  await documents.load().catch(() => {});
  const out = [];
  for (const meta of savedDocs()) {
    onStep?.(meta.title);
    // eslint-disable-next-line no-await-in-loop
    const s = await docSource(meta).catch(() => null);
    if (s && !s.empty) out.push(s);
  }
  for (const entry of [...MANUALS, ...BUNDLED_BOOKS]) {
    onStep?.(entry.title);
    // eslint-disable-next-line no-await-in-loop
    const book = await loadBook(entry.id).catch(() => null);
    const s = sourceFromBook(book);
    if (s) out.push(s);
  }
  const notes = sourceFromNotes(fieldPassages);
  if (notes) out.push(notes);
  return out;
}
