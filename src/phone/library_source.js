// The reader's books, loaded on this phone when one is opened or asked about: the Army manuals
// (assets/atp), the bundled public-domain books (assets/books), books you imported, and
// documents you downloaded (their sealed text). Nothing here touches the network.
import { BUNDLED_BOOKS, bookFromAtp, bookFromDoc, bookFromImported, bookFromText, libraryList } from "../../symbolic/library/library.js";
import { currentImported } from "../../symbolic/imported_registry.js";
import { loadAtpPack } from "./atp_pack.js";
import { readBookAsset } from "./book_assets";
import { documents } from "./documents.js";

const cache = new Map();
let docsSeen = null;

function dropDocsIfChanged() {
  const docs = documents.snapshot().catalog?.docs || [];
  const imported = currentImported()?.books || [];
  // R13: imported books are in the key too, so removing one drops its cached reader copy.
  const key = `${docs.map((d) => `${d.id}:${d.title}:${d.sections}`).join("|")}#${imported.map((b) => b.id).join("|")}`;
  if (key !== docsSeen) {
    for (const id of [...cache.keys()]) if (id.startsWith("doc:") || id.startsWith("imported:")) cache.delete(id);
    docsSeen = key;
  }
}

export async function libraryEntries() {
  await documents.load().catch(() => {});
  dropDocsIfChanged();
  return libraryList({ docs: documents.snapshot().catalog?.docs || [], imported: currentImported() });
}

async function build(id) {
  if (id.startsWith("atp:")) {
    const pack = await loadAtpPack();
    return pack ? bookFromAtp(pack, id.slice(4)) : null;
  }
  if (id.startsWith("book:")) {
    const b = BUNDLED_BOOKS.find((x) => x.id === id);
    if (!b) return null;
    const raw = await readBookAsset(b.file);
    return raw ? bookFromText({ id: b.id, title: b.title, author: b.author, raw, headings: b.headings, source: "Bundled public-domain text" }) : null;
  }
  if (id.startsWith("imported:")) return bookFromImported(currentImported(), id.slice(9));
  if (id.startsWith("doc:")) {
    await documents.load().catch(() => {});
    const docId = id.slice(4);
    const meta = (documents.snapshot().catalog?.docs || []).find((d) => d.id === docId);
    const body = meta ? await documents.body(docId) : null;
    return bookFromDoc(meta, body);
  }
  return null;
}

/** The book for a library id, or null. Cached for the session. */
export async function loadBook(id) {
  dropDocsIfChanged();
  if (cache.has(id)) return cache.get(id);
  const job = build(String(id || "")).catch(() => null);
  cache.set(id, job);
  const book = await job;
  if (!book) cache.delete(id);
  return book;
}

/** The library list from what is loaded right now (no waiting), for matching a name in Ask. */
export function libraryEntriesNow() {
  return libraryList({ docs: documents.snapshot().catalog?.docs || [], imported: currentImported() });
}

/** R13: drop one book from the reader's session cache (after it is removed from the phone). */
export function forgetBook(id) {
  cache.delete(String(id || ""));
  docsSeen = null;
}
