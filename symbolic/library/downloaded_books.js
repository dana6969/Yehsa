// R13: the "Downloaded books" setting, pure part. What is on this phone that you downloaded or
// imported (removable, with its size on disk), what ships in the app (Built-in, never removable),
// and the removal steps: delete the files and drop the book from every index and cache, so Ask
// stops citing it, the space is freed, and it can be downloaded again normally.
//
// Kinds:
//   doc:<id>       a document you downloaded in Ask (sealed file yehsa-docs/doc-<id>.v1, catalog entry,
//                  its section/heading index and meaning vectors are inside that sealed body)
//   imported:<id>  a book you imported (EPUB/TXT/ZIM article): its passages in yehsa-books/imported.json
//                  and the background token index (imported_registry) built from them
//   zim:<name>     a Kiwix .zim file kept in yehsa-zim/ when you opened it
// Built in (never removed): book:* (assets/books, e.g. the Constitution and Bill of Rights) and atp:*.
// Nothing here is imported by getMappedAction.
import { BUNDLED_BOOKS, MANUALS } from "./library.js";

export function isBuiltInId(id) {
  const s = String(id || "");
  return s.startsWith("book:") || s.startsWith("atp:");
}

export function isRemovableId(id) {
  const s = String(id || "");
  return /^(doc|imported|zim):./.test(s);
}

function utf8Length(text) {
  const s = String(text || "");
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i += 1; }
    else n += 3;
  }
  return n;
}

/** Bytes one imported book takes in imported.json: its entry and its passages. */
export function importedBookBytes(store, bookId) {
  const book = (store?.books || []).find((b) => b.id === bookId);
  if (!book) return 0;
  const notes = (store?.notes || []).filter((n) => n.bookId === bookId);
  return utf8Length(JSON.stringify(book)) + notes.reduce((sum, n) => sum + utf8Length(JSON.stringify(n)) + 1, 0);
}

/**
 * The list the setting shows.
 * docs: the document catalog's docs; docBytes: { [docId]: bytes on disk } (falls back to the download size)
 * imported: the imported store; zims: [{ name, bytes }]
 * Returns { builtIn: [...], downloaded: [...], totalBytes }.
 */
export function downloadedBooks({ docs = [], docBytes = {}, imported = null, zims = [] } = {}) {
  const builtIn = [
    ...BUNDLED_BOOKS.map((b) => ({ id: b.id, title: b.title, kind: "book", builtIn: true, removable: false, label: "Built-in" })),
    ...MANUALS.map((m) => ({ id: m.id, title: m.title, kind: "manual", builtIn: true, removable: false, label: "Built-in" }))
  ];
  const downloaded = [];
  for (const d of docs || []) {
    const onDisk = Number(docBytes?.[d.id]);
    downloaded.push({
      id: `doc:${d.id}`,
      title: d.title || "Document",
      kind: "document",
      detail: [d.source || d.site || null, d.pageCount ? `${d.pageCount} ${d.pageKind === "page" ? "pages" : "parts"}` : null].filter(Boolean).join(" · "),
      bytes: Number.isFinite(onDisk) && onDisk > 0 ? onDisk : Number(d.bytes) || 0,
      removable: true
    });
  }
  for (const b of imported?.books || []) {
    downloaded.push({
      id: `imported:${b.id}`,
      title: b.title || "Book",
      kind: "imported",
      detail: [b.author || null, String(b.format || "").toUpperCase() || null, `${b.notes || 0} passages`].filter(Boolean).join(" · "),
      bytes: importedBookBytes(imported, b.id),
      removable: true
    });
  }
  for (const z of zims || []) {
    if (!z?.name) continue;
    downloaded.push({ id: `zim:${z.name}`, title: z.name, kind: "zim", detail: "Kiwix ZIM file", bytes: Number(z.bytes) || 0, removable: true });
  }
  const totalBytes = downloaded.reduce((sum, b) => sum + (b.bytes || 0), 0);
  return { builtIn, downloaded, totalBytes };
}

/**
 * Remove one downloaded book. deps (all optional except the one the kind needs):
 *   removeDoc(docId), removeImported(bookId), removeZim(name)  -- delete the files and the catalog entry
 *   forgetLibrary(id)       -- the reader's book cache
 *   forgetPlace(id)         -- the reader's saved page
 *   dropPassageVectors()    -- meaning vectors cached for passages (the removed ones go with them)
 *   closeReaderIf(id)       -- close the reader if it shows this book
 * Built-in books are refused.
 */
export async function removeDownloadedBook(id, deps = {}) {
  const s = String(id || "");
  if (isBuiltInId(s)) return { ok: false, reason: "That book is built into Yehsa. It can't be removed." };
  if (!isRemovableId(s)) return { ok: false, reason: "That isn't a downloaded book." };
  const [kind, ...rest] = s.split(":");
  const key = rest.join(":");
  if (kind === "doc") await deps.removeDoc?.(key);
  else if (kind === "imported") await deps.removeImported?.(key);
  else if (kind === "zim") await deps.removeZim?.(key);
  await deps.closeReaderIf?.(s);
  await deps.forgetLibrary?.(s);
  await deps.forgetPlace?.(s);
  await deps.dropPassageVectors?.();
  return { ok: true, id: s };
}

/** Remove every downloaded book (never a built-in one). Returns { ok, removed, failed }. */
export async function removeAllDownloadedBooks(list, deps = {}) {
  let removed = 0;
  const failed = [];
  for (const item of list || []) {
    if (!item?.removable || isBuiltInId(item.id)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const got = await removeDownloadedBook(item.id, deps);
      if (got.ok) removed += 1;
      else failed.push(item.id);
    } catch {
      failed.push(item.id);
    }
  }
  return { ok: failed.length === 0, removed, failed };
}
