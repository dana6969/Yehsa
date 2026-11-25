// R13: the phone side of More > Downloaded books. Lists what you downloaded or imported with its
// size on disk, and removes a book from the files and from every index and cache:
//   documents: the sealed body (pages, section/heading index, meaning vectors) and the catalog entry
//   imported books: their passages in imported.json and the background token index (re-registered)
//   ZIM files: the kept .zim
// then the reader's cached copy and saved page, and the cached passage vectors. Learned notes are
// never made from document, library or imported answers (learned_notes NOT_SAVED_KINDS), so there is
// no learned recall tied to a book to drop. Built-in books are never touched.
import { downloadedBooks, removeAllDownloadedBooks, removeDownloadedBook } from "../../symbolic/library/downloaded_books.js";
import { dropVectors } from "../../symbolic/meaning/vector_cache.js";
import { currentImported } from "../../symbolic/imported_registry.js";
import { documents } from "./documents.js";
import { bootImportedBooks, removeAllImported, removeBook } from "./imported_books.js";
import { forgetBook } from "./library_source.js";
import { closeReader, readerBookId } from "./reader_store.js";
import { forgetReaderPlace } from "./ReaderScreen.js";
import { listZims, removeZim } from "./zim_files";

export async function loadDownloadedBooks() {
  await documents.load().catch(() => {});
  await bootImportedBooks().catch(() => {});
  const docs = documents.snapshot().catalog?.docs || [];
  const docBytes = {};
  for (const d of docs) {
    // eslint-disable-next-line no-await-in-loop
    const n = await documents.diskBytes(d.id).catch(() => null);
    if (n != null) docBytes[d.id] = n;
  }
  const zims = await listZims().catch(() => []);
  return downloadedBooks({ docs, docBytes, imported: currentImported(), zims });
}

const deps = {
  removeDoc: (id) => documents.remove(id),
  removeImported: (id) => removeBook(id),
  removeZim: (name) => removeZim(name),
  closeReaderIf: (id) => {
    if (readerBookId() === id) closeReader();
  },
  forgetLibrary: (id) => forgetBook(id),
  forgetPlace: (id) => forgetReaderPlace(id).catch(() => {}),
  dropPassageVectors: () => dropVectors("p:")
};

export function removeOneBook(id) {
  return removeDownloadedBook(id, deps);
}

export async function removeEveryDownloadedBook(list) {
  // Imported books share one file: empty it once instead of rewriting it per book.
  const items = list || [];
  const imported = items.filter((b) => b.kind === "imported");
  if (imported.length) {
    await removeAllImported();
    for (const b of imported) {
      forgetBook(b.id);
      // eslint-disable-next-line no-await-in-loop
      await deps.forgetPlace(b.id);
      deps.closeReaderIf(b.id);
    }
  }
  const got = await removeAllDownloadedBooks(items.filter((b) => b.kind !== "imported"), deps);
  dropVectors("p:");
  return { ...got, removed: got.removed + imported.length };
}
