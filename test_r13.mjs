// R13: More > Downloaded books. Remove one or all downloaded books: the files go, every index and
// cache drops them (Ask stops citing them, the space is freed), built-in books stay, and a removed
// book can be downloaded again.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { createDocService } from "./symbolic/docs/doc_service.js";
import { addBook, buildImportIndex, deleteBook, emptyImported, parseBook, retrieveImported } from "./symbolic/book_import.js";
import { currentImportIndex, currentImported, registerImported } from "./symbolic/imported_registry.js";
import { downloadedBooks, importedBookBytes, isBuiltInId, removeAllDownloadedBooks, removeDownloadedBook } from "./symbolic/library/downloaded_books.js";
import { dropVectors, getVector, putVector } from "./symbolic/meaning/vector_cache.js";
import { withPlace, withoutPlace, emptyReaderPrefs } from "./symbolic/library/reader_prefs.js";
import { savesAsLearned } from "./symbolic/learned_notes.js";
import { BUNDLED_BOOKS } from "./symbolic/library/library.js";

const src = (f) => fs.readFileSync(f, "utf8");
const CANNING = src("eval/fixtures/r10/canning_manual.txt");
const URL1 = "https://example.org/canning.txt";

function memoryDocs({ embed = null } = {}) {
  const files = new Map();
  const secrets = new Map();
  let seed = 11;
  const fetchImpl = async (url) => {
    if (String(url).split("?")[0] !== URL1) throw new Error("offline");
    return new Response(new TextEncoder().encode(CANNING), { status: 200, headers: { "content-type": "text/plain" } });
  };
  const service = createDocService({
    getSecret: async (k) => secrets.get(k) || null,
    setSecret: async (k, v) => { secrets.set(k, v); },
    deleteSecret: async (k) => { secrets.delete(k); },
    readFile: async (k) => files.get(k) || null,
    writeFile: async (k, v) => { files.set(k, v); },
    deleteFile: async (k) => { files.delete(k); },
    fileSize: async (k) => (files.has(k) ? files.get(k).length : null),
    fetchImpl,
    embed,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => (seed = (seed * 1103515245 + 12345) % 2147483648) & 255)
  });
  return { service, files };
}

const candidate = { title: "USDA Complete Guide to Home Canning", url: URL1, source: "example.org", format: "txt" };

test("removing a downloaded document deletes its sealed file and Ask stops citing it", async () => {
  const { service, files } = memoryDocs();
  const got = await service.download(candidate);
  assert.equal(got.ok, true);
  const id = got.meta.id;
  assert.ok(files.has(`doc-${id}.v1`));
  const bytes = await service.diskBytes(id);
  assert.ok(bytes > 1000, "size on disk is the sealed file");
  const before = await service.answer("what does the home canning guide say about headspace for meat", { notesAnswered: false });
  assert.ok(before, "the document answers before removal");
  const list = downloadedBooks({ docs: service.snapshot().catalog.docs, docBytes: { [id]: bytes } });
  assert.equal(list.downloaded.length, 1);
  assert.equal(list.downloaded[0].bytes, bytes);
  assert.equal(list.totalBytes, bytes);

  const calls = [];
  const out = await removeDownloadedBook(`doc:${id}`, {
    removeDoc: (x) => service.remove(x),
    forgetLibrary: (x) => calls.push(["library", x]),
    forgetPlace: (x) => calls.push(["place", x]),
    closeReaderIf: (x) => calls.push(["reader", x]),
    dropPassageVectors: () => calls.push(["vectors"])
  });
  assert.equal(out.ok, true);
  assert.equal(files.has(`doc-${id}.v1`), false, "the sealed body (pages, sections, vectors) is gone");
  assert.equal(service.snapshot().catalog.docs.length, 0, "the catalog entry is gone");
  assert.equal(await service.answer("what does the home canning guide say about headspace for meat"), null, "Ask no longer cites it");
  assert.equal(await service.section("chapter 3 of the canning guide"), null);
  assert.equal(await service.body(id), null);
  assert.deepEqual(calls.map((c) => c[0]).sort(), ["library", "place", "reader", "vectors"]);
  assert.equal(downloadedBooks({ docs: service.snapshot().catalog.docs }).totalBytes, 0);

  // Download it again normally.
  const again = await service.download(candidate);
  assert.equal(again.ok, true);
  assert.notEqual(again.already, true);
  assert.ok(await service.answer("what does the home canning guide say about headspace for meat"));
});

test("a document removed while its meaning vectors are being built is not written back", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let first = true;
  const embed = async (texts) => {
    if (first) { first = false; await gate; }
    return { model: "fake", vectors: texts.map(() => [1, 0, 0]) };
  };
  const { service, files } = memoryDocs({ embed });
  const got = await service.download(candidate);
  const id = got.meta.id;
  await service.remove(id);
  release();
  assert.equal(await got.vectorsDone, false);
  assert.equal(files.has(`doc-${id}.v1`), false);
  const reindexed = await service.reindex(id);
  assert.equal(reindexed.ok, false);
  assert.equal(files.has(`doc-${id}.v1`), false);
});

test("removing an imported book drops its passages, the token index and its size", async () => {
  const text = "THE BEEKEEPER'S HANDBOOK\n\n" + Array.from({ length: 12 }, (_, i) => `Chapter ${i + 1}. The queen bee lays eggs in the brood comb; a smoker calms the hive before the frames are lifted and the honey super is checked for capped cells number ${i}.`).join("\n\n");
  const parsed = parseBook("beekeeper.txt", new TextEncoder().encode(text));
  assert.equal(parsed.ok, true);
  const added = addBook(emptyImported(), parsed);
  assert.equal(added.added, true);
  const store = added.store;
  registerImported(store, await buildImportIndex(store, { yieldFn: async () => {} }));
  assert.ok(retrieveImported("beekeeper smoker", currentImported(), currentImportIndex()));
  const bookBytes = importedBookBytes(store, added.book.id);
  assert.ok(bookBytes > text.length * 0.5);
  const list = downloadedBooks({ imported: store });
  assert.equal(list.downloaded[0].id, `imported:${added.book.id}`);
  assert.equal(list.totalBytes, bookBytes);

  await removeDownloadedBook(`imported:${added.book.id}`, {
    removeImported: async (bookId) => {
      const next = deleteBook(currentImported(), bookId);
      registerImported(next, await buildImportIndex(next, { yieldFn: async () => {} }));
    }
  });
  assert.equal(currentImported().books.length, 0);
  assert.equal(currentImported().notes.length, 0);
  assert.equal(retrieveImported("beekeeper smoker", currentImported(), currentImportIndex()), null);
  assert.equal(downloadedBooks({ imported: currentImported() }).totalBytes, 0);
  // Import it again normally.
  assert.equal(addBook(currentImported(), parsed).added, true);
  registerImported(emptyImported(), null);
});

test("built-in books are listed as Built-in and can't be removed; bundled corpora stay", async () => {
  const list = downloadedBooks({});
  const con = list.builtIn.find((b) => b.id === "book:us-constitution");
  assert.ok(con, "the Constitution (with the Bill of Rights) is listed");
  assert.equal(con.removable, false);
  assert.equal(con.label, "Built-in");
  assert.ok(list.builtIn.every((b) => !b.removable && isBuiltInId(b.id)));
  assert.equal(list.builtIn.length, BUNDLED_BOOKS.length + 2);
  let touched = false;
  const refused = await removeDownloadedBook("book:us-constitution", { removeDoc: () => { touched = true; }, removeImported: () => { touched = true; } });
  assert.equal(refused.ok, false);
  assert.equal(touched, false);
  const all = await removeAllDownloadedBooks([...list.builtIn, { id: "zim:wikimed.zim", kind: "zim", removable: true, bytes: 5 }], { removeZim: () => {} });
  assert.equal(all.removed, 1);
  for (const b of BUNDLED_BOOKS) assert.ok(fs.existsSync(`assets/books/${b.file}.ybk`), `${b.file} still ships`);
});

test("caches tied to a removed book are dropped: passage vectors and the reader's saved page", () => {
  putVector("p:some removed passage", [1, 2]);
  putVector("q:a question", [3, 4]);
  dropVectors("p:");
  assert.equal(getVector("p:some removed passage"), null);
  assert.deepEqual(getVector("q:a question"), [3, 4]);
  const prefs = withPlace(withPlace(emptyReaderPrefs(), "doc:abc", 12), "book:kjv", 40);
  const next = withoutPlace(prefs, "doc:abc");
  assert.equal(next.places["doc:abc"], undefined);
  assert.equal(next.places["book:kjv"].page, 40);
  // Learned notes are never made from document, library or imported answers: nothing to drop there.
  for (const kind of ["document", "library", "imported", "doc-reasoned"]) assert.equal(savesAsLearned(kind), false);
});

test("the setting is reached from More and from More > Library, and wired to every cleanup", () => {
  const nav = src("src/phone/nav_model.js");
  assert.match(nav, /\{ id: "downloads", label: "Downloaded books"/);
  assert.match(nav, /downloads: "Downloaded books"/);
  const app = src("src/phone/YehsaApp.js");
  assert.match(app, /stackOpen\("downloads"\)[\s\S]{0,200}<DownloadedBooksPane/);
  assert.match(app, /label="Downloaded books: sizes and remove"[^\n]*openScreen\("downloads"\)/);
  const pane = src("src/phone/DownloadedBooksPane.js");
  assert.match(pane, /Alert\.alert/);
  assert.match(pane, /Remove all downloaded books/);
  assert.match(pane, /Built-in/);
  const phone = src("src/phone/downloaded_books.js");
  for (const step of ["documents.remove", "removeBook", "removeZim", "forgetBook", "forgetReaderPlace", 'dropVectors("p:")', "closeReader"]) assert.ok(phone.includes(step), step);
  assert.match(src("src/phone/library_source.js"), /export function forgetBook/);
  assert.match(src("src/phone/doc_files.native.js"), /async fileSize\(name\)/);
});
