// Loads your imported books at start-up and builds their search index in the background.
// The Ask path reads the finished index from imported_registry.js; it never waits on this.
import { addBook, buildImportIndex, deleteBook, emptyImported, openImported, parseBook } from "../../symbolic/book_import.js";
import { currentImported, registerImported } from "../../symbolic/imported_registry.js";
import { readImportedRaw, writeImportedRaw } from "./book_store";

let booting = null;
let indexing = { done: 0, total: 0, running: false };
const progressListeners = new Set();

function emitProgress() {
  for (const fn of progressListeners) fn({ ...indexing });
}

export function onIndexProgress(fn) {
  progressListeners.add(fn);
  fn({ ...indexing });
  return () => progressListeners.delete(fn);
}

async function reindex(store) {
  registerImported(store, null);
  indexing = { done: 0, total: store.notes.length, running: true };
  emitProgress();
  const index = await buildImportIndex(store, {
    onProgress: (done, total) => {
      indexing = { done, total, running: done < total };
      emitProgress();
    }
  });
  // Only register if nothing changed while indexing.
  if (currentImported() === store) registerImported(store, index);
  indexing = { done: store.notes.length, total: store.notes.length, running: false };
  emitProgress();
}

export function bootImportedBooks() {
  if (!booting) {
    booting = (async () => {
      const raw = await readImportedRaw();
      const store = raw ? openImported(raw) : emptyImported();
      reindex(store);
      return store;
    })().catch(() => emptyImported());
  }
  return booting;
}

async function save(store) {
  await writeImportedRaw(JSON.stringify(store));
  reindex(store);
  return store;
}

export async function importBookBytes(name, bytes) {
  const current = currentImported() || (await bootImportedBooks());
  const parsed = parseBook(name, bytes);
  const result = addBook(current, parsed);
  if (result.added) await save(result.store);
  return result;
}

export async function importParsed(parsed) {
  const current = currentImported() || (await bootImportedBooks());
  const result = addBook(current, parsed);
  if (result.added) await save(result.store);
  return result;
}

export async function removeBook(bookId) {
  const current = currentImported() || (await bootImportedBooks());
  return save(deleteBook(current, bookId));
}

/** R13: remove every imported book (the file shrinks to an empty store, the index empties). */
export async function removeAllImported() {
  await bootImportedBooks();
  return save(emptyImported());
}
