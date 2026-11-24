// R7: the reader's library, whole-book answers, document intents, and the reader's saved place.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { BUNDLED_BOOKS, MANUALS, bookFromAtp, bookFromDoc, bookFromText, chapterRange, docChapters, libraryList, matchTitle, paginate, summarizeBook, unwrapProse } from "./symbolic/library/library.js";
import { chapterAnswer, chaptersAnswer, libraryAnswer, summaryAnswer } from "./symbolic/library/library_answer.js";
import { docRequest } from "./symbolic/docs/doc_intents.js";
import { planBookRequest } from "./symbolic/library/book_request.js";
import { chapterAt, emptyReaderPrefs, findPages, readReaderPrefs, withPlace, withSize } from "./symbolic/library/reader_prefs.js";
import { buildQuestions } from "./eval/questions.mjs";
import { DEV_SET } from "./eval/dev_set.mjs";
import { PARAPHRASE_SET } from "./eval/paraphrase_set.mjs";
import { loadRegressionV1 } from "./eval/regression/v1/load.mjs";

const book = (file) => {
  const b = BUNDLED_BOOKS.find((x) => x.file === file);
  return bookFromText({ ...b, raw: fs.readFileSync(`assets/books/${file}.ybk`, "utf8") });
};
const pack = JSON.parse(fs.readFileSync("assets/atp/atp_sections.json", "utf8"));

test("every bundled book is in the app, keeps its license, and splits into chapters and pages", () => {
  for (const b of BUNDLED_BOOKS) {
    const raw = fs.readFileSync(`assets/books/${b.file}.ybk`, "utf8");
    assert.ok(raw.length > 20000, b.file);
    const bk = bookFromText({ ...b, raw });
    assert.ok(bk.pages.length >= 20, `${b.file} pages`);
    assert.ok(bk.chapters.length >= 3, `${b.file} chapters`);
    assert.ok(bk.chapters.every((c, i) => c.page >= 1 && c.page <= bk.pages.length && (i === 0 || c.page >= bk.chapters[i - 1].page)), b.file);
    assert.ok(bk.pages.every((p) => p.length <= 2200 * 1.5), `${b.file} page size`);
  }
  const k = book("the_kybalion");
  assert.equal(k.chapters.filter((c) => /^CHAPTER /.test(c.title)).length, 15);
  assert.ok(k.chapters.some((c) => /Gutenberg License/.test(c.title)));
  assert.ok(book("tao_te_ching").chapters.filter((c) => /^Chapter \d+$/.test(c.title)).length >= 60);
});

test("prose is unwrapped so sentences stay whole; verse keeps its lines", () => {
  const prose = "This is a long line of wrapped prose that goes on for quite a while and\nthen continues on the next line of the very same paragraph of the book text.";
  assert.equal(unwrapProse(prose).includes("\n"), false);
  const verse = "Short line one\nShort line two\nShort line three";
  assert.equal(unwrapProse(verse), verse);
  assert.deepEqual(paginate("a\n\nb"), ["a\n\nb"]);
});

test("both Army manuals open as books with their chapters", () => {
  for (const m of MANUALS) {
    const bk = bookFromAtp(pack, m.pubId);
    assert.ok(bk, m.pubId);
    assert.ok(bk.chapters.length >= 5, m.pubId);
    assert.ok(bk.pages.length >= 20, m.pubId);
  }
  const survival = bookFromAtp(pack, "atp-3-50.21");
  assert.match(chapterRange(survival, 1).chapter.title, /^Chapter 1\. Overview/);
  assert.match(chapterRange(survival, 3).chapter.title, /^Chapter 3\. Water/);
});

test("a downloaded document's chapters come from its bookmarks, else its headings", () => {
  const outline = [{ title: "Chapter 1 - Overview", page: 3, depth: 0 }, { title: "Chapter 2 - Water", page: 9, depth: 0 }, { title: "Sub", page: 4, depth: 1 }];
  assert.deepEqual(docChapters({ outline, pageCount: 20 }), [{ title: "Chapter 1 - Overview", page: 3 }, { title: "Chapter 2 - Water", page: 9 }]);
  const sections = [{ heading: "Introduction", page: 1 }, { heading: "Chapter I. Methods", page: 2 }, { heading: "Chapter II. Rapport", page: 5 }];
  assert.deepEqual(docChapters({ sections }).map((c) => c.title), ["Chapter I. Methods", "Chapter II. Rapport"]);
  const meta = { id: "d1", title: "KUBARK Counterintelligence Interrogation", url: "https://example.org/kubark.pdf", pageKind: "page" };
  const pages = Array.from({ length: 6 }, (_, i) => `Page ${i + 1}. The interrogator builds rapport with the source before questioning begins, and the questioning follows a plan written in advance.`);
  const bk = bookFromDoc(meta, { pages, sections: buildFakeSections(pages), outline: [{ title: "I. Introduction", page: 1, depth: 0 }, { title: "II. Rapport", page: 4, depth: 0 }] });
  assert.equal(bk.id, "doc:d1");
  const ch = chaptersAnswer(bk);
  assert.match(ch.text, /II\. Rapport \(page 4\)/);
  assert.match(ch.text, /Yehsa has not checked it/);
  assert.deepEqual(ch.reader, { bookId: "doc:d1", page: 1, title: meta.title });
});

function buildFakeSections(pages) {
  return pages.map((text, i) => ({ id: `p${i + 1}s0`, page: i + 1, heading: "", text }));
}

test("whole-book answers are quoted, page-cited, and the same every time", () => {
  const k = book("the_kybalion");
  const a = summaryAnswer(k);
  const b = summaryAnswer(book("the_kybalion"));
  assert.equal(a.text, b.text);
  assert.match(a.text, /\(page \d+\)/);
  const lines = summarizeBook(k);
  assert.ok(lines.length >= 5);
  for (const l of lines) assert.ok(k.pages[l.page - 1].includes(l.text), "each summary line is word for word from its page");
  const c1 = chapterAnswer(k, 1);
  assert.match(c1.text, /^CHAPTER I THE HERMETIC PHILOSOPHY/);
  assert.equal(c1.reader.page, chapterRange(k, 1).from);
  assert.match(chapterAnswer(k, 40).text, /doesn't have a chapter 40/);
  assert.equal(libraryAnswer({ kind: "open", target: "kybalion" }, k).reader.auto, true);
});

test("document intents: summary, chapters, chapter n, about, open", () => {
  const cases = [
    ["Give me a summary of kubark", { kind: "summary", target: "kubark" }],
    ["summarize kubark", { kind: "summary", target: "kubark" }],
    ["Give me chapters of kubark", { kind: "chapters", target: "kubark" }],
    ["What are the chapters of FM 21-76?", { kind: "chapters", target: "FM 21-76" }],
    ["Table of contents of ATP 3-50.21", { kind: "chapters", target: "ATP 3-50.21" }],
    ["first chapter of kubark", { kind: "chapter", n: 1, target: "kubark" }],
    ["chapter 3 of the kybalion", { kind: "chapter", n: 3, target: "kybalion" }],
    ["What does kubark say about rapport?", { kind: "about", target: "kubark", topic: "rapport" }],
    ["open the kybalion", { kind: "open", target: "kybalion" }],
    ["read the bible", { kind: "open", target: "bible" }]
  ];
  for (const [q, want] of cases) {
    const got = docRequest(q);
    assert.ok(got, q);
    for (const [k, v] of Object.entries(want)) assert.equal(got[k], v, `${q}: ${k}`);
  }
  for (const q of ["how do I remove a tick", "download kubark", "what is the chapter on fire about"]) assert.equal(planBookRequest(q, { entries: libraryList({}) }), null, q);
});

test("a book request answers from the book on the phone, offers the Download just listed, or searches; never the web answer path", () => {
  const docs = [{ id: "d1", title: "KUBARK Counterintelligence Interrogation", query: "kubark" }];
  const entries = libraryList({ docs });
  assert.equal(planBookRequest("Give me a summary of kubark", { entries }).entry.id, "doc:d1");
  assert.equal(planBookRequest("chapters of the army survival manual", { entries }).entry.id, "atp:atp-3-50.21");
  assert.equal(planBookRequest("open the bible", { entries }).entry.id, "book:kjv");
  const found = { query: "kubark", candidates: [{ id: "c1", title: "CIA Kubark 1-60" }] };
  assert.equal(planBookRequest("Give me a summary of kubark", { entries: libraryList({}), recentFound: found }).offer, found);
  assert.deepEqual(planBookRequest("chapters of FM 21-76", { entries: libraryList({}) }).search, { query: "FM 21-76", format: "any" });
  assert.equal(planBookRequest("read the sky", { entries }), null);
  assert.equal(planBookRequest("summary of how to purify water", { entries }), null);
  assert.equal(planBookRequest("What does the Dhammapada say about hatred?", { entries }), null, "scripture quoting keeps it");
  assert.ok(matchTitle(entries, "ATP 3-50.21"));
  assert.equal(matchTitle(entries, "how to purify water"), null);
});

test("no eval, dev, paraphrase or frozen v1 question is taken by the book path", () => {
  const entries = libraryList({});
  const { questions } = loadRegressionV1();
  const all = [
    ...buildQuestions().map((q) => q.prompt),
    ...DEV_SET.map((q) => q.prompt),
    ...PARAPHRASE_SET.map((q) => q.prompt),
    ...questions.map((q) => q.prompt || q.question)
  ].filter(Boolean);
  assert.ok(all.length > 900);
  const taken = all.filter((q) => planBookRequest(q, { entries }));
  assert.deepEqual(taken, []);
});

test("the reader keeps your place and text size, and finds words across pages", () => {
  let p = emptyReaderPrefs();
  p = withPlace(p, "book:kjv", 120, 1);
  p = withSize(withSize(p, 1), 1);
  const back = readReaderPrefs(JSON.stringify(p));
  assert.equal(back.places["book:kjv"].page, 120);
  assert.equal(back.size, 24);
  assert.equal(withSize({ ...p, size: 28 }, 1).size, 28);
  assert.deepEqual(readReaderPrefs("garbage"), emptyReaderPrefs());
  const pages = ["alpha", "beta Gamma", "gamma ray", "delta"];
  assert.deepEqual(findPages(pages, "gamma", 3), [3, 2]);
  assert.deepEqual(findPages(pages, "g"), []);
  assert.equal(chapterAt([{ page: 1 }, { page: 5 }], 4), 0);
  assert.equal(chapterAt([{ page: 1 }, { page: 5 }], 5), 1);
});

test("the app wires it: book requests before document search, the reader mounted, books bundled offline", () => {
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.ok(app.indexOf("planBookRequest(effective") > 0 && app.indexOf("planBookRequest(effective") < app.indexOf("documentIntent(effective)"));
  assert.match(app, /<ReaderScreen \/>/);
  assert.match(app, /Open in reader at page \$\{item\.reader\.page\}/);
  assert.match(app, /onSaved=\{item\.pendingDoc/);
  assert.match(app, /label="Open the reader" onPress=\{openLibrary\}/);
  assert.match(fs.readFileSync("metro.config.js", "utf8"), /"ybk"/);
  const assets = fs.readFileSync("src/phone/book_assets.native.js", "utf8");
  for (const b of BUNDLED_BOOKS) assert.match(assets, new RegExp(`assets/books/${b.file}\\.ybk`));
  for (const f of ["symbolic/library/library.js", "symbolic/library/library_answer.js", "symbolic/library/book_request.js", "symbolic/docs/doc_intents.js", "src/phone/library_source.js", "src/phone/ReaderScreen.js"]) {
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /\bfetch\(|XMLHttpRequest|WebSocket/, f);
  }
  const reader = fs.readFileSync("src/phone/ReaderScreen.js", "utf8");
  for (const s of ["Contents", "Find", "A−", "A+", "Previous", "Next", "Go to page", "saveReaderPrefs"]) assert.ok(reader.includes(s), s);
});
