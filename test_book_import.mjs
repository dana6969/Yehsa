import assert from "node:assert/strict";
import test from "node:test";
import { zipSync, strToU8 } from "fflate";
import { zstdCompressSync } from "node:zlib";
import {
  addBook, buildImportIndex, deleteBook, emptyImported, formatImported, openImported, parseBook, parseEpub, parseTxt, retrieveImported, splitNotes
} from "./symbolic/book_import.js";
import { registerImported } from "./symbolic/imported_registry.js";
import { askField } from "./symbolic/phone_field.js";
import { openZim, memoryReader, ZIM_MAGIC } from "./symbolic/zim_reader.js";
import books from "./symbolic_memory/books_index.json" with { type: "json" };

const passages = books.passages || books;

function makeEpub({ drm = false } = {}) {
  const chapter = (title, body) => `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><style>p{}</style></head><body><h1>${title}</h1>${body}</body></html>`;
  const files = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(`<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`),
    "OEBPS/content.opf": strToU8(`<package><metadata><dc:title>Northwoods Canoe Craft</dc:title><dc:creator>A. Paddler</dc:creator></metadata>
      <manifest><item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/two.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="c2"/><itemref idref="c1"/></spine></package>`),
    "OEBPS/text/one.xhtml": strToU8(chapter("Portage", "<p>A portage yoke spreads the canoe weight across both shoulders &amp; lets you carry it between lakes. Pad the yoke with closed-cell foam.</p>")),
    "OEBPS/text/two.xhtml": strToU8(chapter("Birch bark", "<p>Birch bark canoe seams are sealed with spruce gum mixed with charcoal and a little fat, heated and pressed into the seam.</p><p>Re-gum the seams every season.</p>"))
  };
  if (drm) files["META-INF/encryption.xml"] = strToU8("<encryption><EncryptedData><CipherData/></EncryptedData></encryption>");
  return zipSync(files);
}

test("an EPUB is unzipped and parsed on the device in spine order, with title and author", () => {
  const parsed = parseEpub("canoe.epub", makeEpub());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.title, "Northwoods Canoe Craft");
  assert.equal(parsed.author, "A. Paddler");
  assert.ok(parsed.text.indexOf("Birch bark") < parsed.text.indexOf("Portage"));
  assert.match(parsed.text, /shoulders & lets/);
  assert.doesNotMatch(parsed.text, /<p>|p\{\}/);
  assert.equal(parseEpub("x.epub", makeEpub({ drm: true })).ok, false);
  assert.equal(parseEpub("x.epub", strToU8("not a zip")).ok, false);
  assert.equal(parseBook("x.pdf", strToU8("%PDF")).ok, false);
});

test("TXT is split into notes under headings, marked with the book title, and deletable", () => {
  const body = ["Title: Lake Fishing Notes", "", "CHAPTER 1", "", "Walleye feed at dusk along rocky points where the wind pushes bait. Use a jig tipped with a minnow.", "", "CHAPTER 2", "", "Lake trout go deep in summer and hold below the thermocline. Troll slowly with a heavy spoon."].join("\n");
  const parsed = parseTxt("fish.txt", strToU8(body));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.title, "Lake Fishing Notes");
  const { notes } = splitNotes(parsed);
  assert.equal(notes.length, 2);
  assert.match(notes[0].title, /CHAPTER 1/);
  assert.ok(notes.every((note) => note.source === "Imported book: Lake Fishing Notes" && note.trust === "imported"));
  const added = addBook(emptyImported(), parsed);
  assert.equal(added.added, true);
  assert.equal(addBook(added.store, parsed).added, false, "a second import of the same book is refused");
  const both = addBook(added.store, parseEpub("canoe.epub", makeEpub())).store;
  assert.equal(both.books.length, 2);
  const after = deleteBook(both, added.book.id);
  assert.equal(after.books.length, 1);
  assert.ok(after.notes.every((note) => note.bookId !== added.book.id));
  const reopened = openImported(JSON.stringify(after));
  assert.equal(reopened.notes.length, after.notes.length);
});

test("imported books answer only when checked notes miss, and never override care notes", async () => {
  const store = addBook(addBook(emptyImported(), parseEpub("canoe.epub", makeEpub())).store, parseTxt("bad.txt", strToU8(
    "Title: Bad Old Remedies\n\nFor a snakebite, cut the wound and suck out the venom quickly, then apply ice.\n\nFor frostbite, rub the frozen skin hard with snow until it turns red again."
  ))).store;
  const index = await buildImportIndex(store, { sliceSize: 1 });
  assert.equal(index.size, store.notes.length);
  const hit = retrieveImported("how do I seal birch bark canoe seams", store, index);
  assert.ok(hit);
  assert.match(formatImported(hit), /From your book "Northwoods Canoe Craft"/);

  const asked = askField("how do I seal birch bark canoe seams", passages, { imported: store, importedIndex: index });
  assert.equal(asked.kind, "imported");
  assert.equal(asked.trust, "imported");
  assert.match(asked.text, /your import, not checked by Yehsa/);

  // Safety and checked notes come first, and dangerous imported text is never quoted.
  for (const question of ["should I cut and suck a snakebite", "can I rub frostbite with snow", "how do I treat frostbite"]) {
    const withBook = askField(question, passages, { imported: store, importedIndex: index });
    const without = askField(question, passages, { imported: null });
    assert.equal(withBook.text, without.text, question);
    assert.notEqual(withBook.kind, "imported", question);
  }
  assert.equal(retrieveImported("snakebite cut suck venom", store, index), null);
  registerImported(null);
});

// --- ZIM -------------------------------------------------------------------
function buildZim({ compression = 5, minor = 1 } = {}) {
  const enc = new TextEncoder();
  const articles = [
    { ns: "C", url: "Hypothermia", title: "Hypothermia", html: "<html><body><h1>Hypothermia</h1><p>Hypothermia is a drop in core body temperature below 35 C.</p></body></html>" },
    { ns: "C", url: "Kindling", title: "Kindling", html: "<html><body><p>Kindling is small dry wood used to start a fire.</p></body></html>" },
    { ns: "M", url: "Title", title: "Title", raw: "Test Wiki" }
  ];
  const blobs = articles.map((a) => enc.encode(a.html || a.raw));
  const offsets = [];
  let at = (blobs.length + 1) * 4;
  for (const b of blobs) { offsets.push(at); at += b.length; }
  offsets.push(at);
  const clusterData = new Uint8Array(at);
  const dv = new DataView(clusterData.buffer);
  offsets.forEach((o, i) => dv.setUint32(i * 4, o, true));
  let p = (blobs.length + 1) * 4;
  for (const b of blobs) { clusterData.set(b, p); p += b.length; }
  const body = compression === 5 ? new Uint8Array(zstdCompressSync(clusterData)) : clusterData;
  const cluster = new Uint8Array(1 + body.length);
  cluster[0] = compression;
  cluster.set(body, 1);
  const mimes = enc.encode("text/html\0text/plain\0\0");
  const entries = articles.map((a, i) => {
    const u = enc.encode(`${a.url}\0${a.title}\0`);
    const e = new Uint8Array(16 + u.length);
    const v = new DataView(e.buffer);
    v.setUint16(0, a.html ? 0 : 1, true);
    e[2] = 0; e[3] = a.ns.charCodeAt(0);
    v.setUint32(4, 0, true); v.setUint32(8, 0, true); v.setUint32(12, i, true);
    e.set(u, 16);
    return e;
  });
  // url order: C/Hypothermia, C/Kindling, M/Title (already sorted); title order same.
  const header = 80;
  const mimePos = header;
  const urlPtrPos = mimePos + mimes.length;
  const titlePtrPos = urlPtrPos + entries.length * 8;
  const entriesPos = titlePtrPos + entries.length * 4;
  let entryAt = entriesPos;
  const entryOffsets = entries.map((e) => { const o = entryAt; entryAt += e.length; return o; });
  const clusterPtrPos = entryAt;
  const clusterPos = clusterPtrPos + 8;
  const checksumPos = clusterPos + cluster.length;
  const out = new Uint8Array(checksumPos + 16);
  const v = new DataView(out.buffer);
  v.setUint32(0, ZIM_MAGIC, true); v.setUint16(4, 6, true); v.setUint16(6, minor, true);
  v.setUint32(24, entries.length, true); v.setUint32(28, 1, true);
  const set64 = (o, n) => { v.setUint32(o, n, true); v.setUint32(o + 4, 0, true); };
  set64(32, urlPtrPos); set64(40, titlePtrPos); set64(48, clusterPtrPos); set64(56, mimePos);
  v.setUint32(64, 0, true); v.setUint32(68, 0xffffffff, true); set64(72, checksumPos);
  out.set(mimes, mimePos);
  entryOffsets.forEach((o, i) => set64(urlPtrPos + i * 8, o));
  entries.forEach((_, i) => v.setUint32(titlePtrPos + i * 4, i, true));
  entries.forEach((e, i) => out.set(e, entryOffsets[i]));
  set64(clusterPtrPos, clusterPos);
  out.set(cluster, clusterPos);
  return out;
}

test("a Kiwix ZIM with zstd clusters is read by range, searched by title, and turned into text", async () => {
  const file = buildZim({ compression: 5 });
  let maxRead = 0;
  const reader = memoryReader(file);
  const zim = await openZim(async (o, l) => { maxRead = Math.max(maxRead, l); return reader(o, l); }, { size: file.length });
  assert.equal(zim.header.entryCount, 3);
  assert.equal(await zim.metadata("Title"), "Test Wiki");
  const hits = await zim.findTitles("hypo");
  assert.equal(hits[0].title, "Hypothermia");
  const article = await zim.articleText(hits[0]);
  assert.match(article.text, /core body temperature/);
  assert.doesNotMatch(article.text, /<p>/);
  const plain = await openZim(memoryReader(buildZim({ compression: 1 })));
  assert.match((await plain.articleText((await plain.findTitles("kindling"))[0])).text, /small dry wood/);
  const xz = await openZim(memoryReader(buildZim({ compression: 4 })));
  const xzHit = (await xz.findTitles("Kindling"))[0];
  await assert.rejects(() => xz.articleText(xzHit), /xz compression/);
  await assert.rejects(() => openZim(memoryReader(strToU8("not a zim file at all, just text padding".repeat(4)))), /not a Kiwix ZIM/);
});
