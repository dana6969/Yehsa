// R7: answers about one whole book or document, from its own text: the chapter list, chapter n,
// a quoted summary with pages, what it says about a topic, or opening it in the reader.
// Deterministic: the same question about the same book gives the same answer every time.

import { buildSections } from "../docs/doc_sections.js";
import { docAnswer } from "../docs/doc_store.js";
import { chapterRange, contentChapters, summarizeBook } from "./library.js";

const MAX_LIST = 40;

function pageLabel(book, page) {
  return `${book.pageKind === "page" || !book.pageKind ? "page" : book.pageKind} ${page}`;
}

function done(book, { text, sections, reader, chapterLinks = null, kind }) {
  return {
    answered: true,
    voiced: true,
    text,
    sections,
    kind: "library",
    libraryKind: kind,
    symbol: null,
    source: book.kind === "document" ? `Downloaded document: ${book.title}` : `Library: ${book.title}`,
    docId: book.docId || null,
    reader,
    chapterLinks,
    citations: [],
    confident: false
  };
}

function bookSections(book) {
  if (!book._sections) book._sections = book.sections?.length ? book.sections : buildSections(book.pages);
  return book._sections;
}

const UNVERIFIED_DOC = "Quoted from a document you downloaded. Yehsa has not checked it.";

export function chaptersAnswer(book) {
  const list = book.chapters || [];
  const shown = list.slice(0, MAX_LIST);
  const lines = shown.map((c, i) => `${i + 1}. ${c.title} (${pageLabel(book, c.page)})`);
  const more = list.length > shown.length ? `\n…and ${list.length - shown.length} more in the reader.` : "";
  const head = `"${book.title}" has ${list.length} ${list.length === 1 ? "part" : "chapters and parts"}, ${book.pages.length} pages:`;
  const tail = book.kind === "document" ? UNVERIFIED_DOC : "Tap a chapter to open it in the reader.";
  return done(book, {
    kind: "chapters",
    text: `${head}\n\n${lines.join("\n")}${more}\n\n${tail}`,
    sections: [{ title: null, text: head }, { title: "Chapters", text: `${lines.join("\n")}${more}` }, { title: null, text: tail }],
    reader: { bookId: book.id, page: 1, title: book.title },
    chapterLinks: shown.map((c) => ({ label: c.title, bookId: book.id, page: c.page }))
  });
}

function excerpt(book, from, to, chars = 900) {
  let text = "";
  for (let p = from; p <= to && text.length < chars; p += 1) text += `${text ? "\n\n" : ""}${book.pages[p - 1] || ""}`;
  if (text.length <= chars) return text.trim();
  const cut = text.lastIndexOf(". ", chars);
  return `${text.slice(0, cut > chars * 0.5 ? cut + 1 : chars).trim()} …`;
}

export function chapterAnswer(book, n) {
  const range = chapterRange(book, n);
  if (!range) {
    const count = contentChapters(book).length;
    const text = `"${book.title}" doesn't have a chapter ${n === -1 ? "that I can call the last" : n}. I found ${count} chapters. Ask for its chapters to see the list.`;
    return done(book, { kind: "chapter-missing", text, sections: [{ title: null, text }], reader: { bookId: book.id, page: 1, title: book.title } });
  }
  const { chapter, from, to } = range;
  const head = `${chapter.title}, from "${book.title}" (${pageLabel(book, from)}${to > from ? ` to ${to}` : ""}). It begins:`;
  const body = `"${excerpt(book, from, to)}"`;
  const tail = book.kind === "document" ? UNVERIFIED_DOC : "The whole chapter is in the reader.";
  return done(book, {
    kind: "chapter",
    text: `${head}\n\n${body}\n\n${tail}`,
    sections: [{ title: null, text: head }, { title: null, text: body }, { title: null, text: tail }],
    reader: { bookId: book.id, page: from, title: book.title }
  });
}

export function summaryAnswer(book, { chapter = null } = {}) {
  const range = chapter ? chapterRange(book, chapter) : null;
  const lines = summarizeBook(book, { parts: 8, chapterRange: range });
  if (!lines.length) {
    const text = `I couldn't pull a summary out of "${book.title}". Its text may be too broken up. You can still read it in the reader.`;
    return done(book, { kind: "summary-empty", text, sections: [{ title: null, text }], reader: { bookId: book.id, page: 1, title: book.title } });
  }
  const head = `A summary of "${book.title}" in its own words: one key line from ${range ? "each part of the chapter" : lines.length > 1 ? `${lines.length} of its chapters` : "the text"}, with the page.`;
  const body = lines.map((l) => `• ${l.title ? `${l.title}: ` : ""}"${l.text}" (${pageLabel(book, l.page)})`).join("\n");
  const tail = `${book.kind === "document" ? UNVERIFIED_DOC : "These are quotes, not my wording."} The whole text is in the reader.`;
  return done(book, {
    kind: "summary",
    text: `${head}\n\n${body}\n\n${tail}`,
    sections: [{ title: null, text: head }, { title: null, text: body }, { title: null, text: tail }],
    reader: { bookId: book.id, page: lines[0].page, title: book.title }
  });
}

export function aboutAnswer(book, topic) {
  const meta = { id: book.docId || book.id, title: book.title, url: book.source || "", pageKind: book.pageKind || "page", fetchedAt: null };
  const got = docAnswer([{ meta, body: { sections: bookSections(book) } }], topic, { onlyDoc: meta.id });
  if (!got) {
    const text = `I looked through "${book.title}" and didn't find it saying anything about ${topic}.`;
    return done(book, { kind: "about-none", text, sections: [{ title: null, text }], reader: { bookId: book.id, page: 1, title: book.title } });
  }
  const page = got.citations?.[0]?.page || 1;
  if (book.kind !== "document") {
    // Not a downloaded document: say where it is from, keep the quotes and pages.
    const opener = `From "${book.title}":`;
    got.text = got.text.replace(/^From downloaded document "[^"]*":/, opener).replace(/Unverified: quoted from a document you downloaded\. Yehsa has not checked it\./, "Quoted from the book.");
    got.sections = got.sections.map((s) => ({ ...s, text: s.text.replace(/Unverified: quoted from a document you downloaded\. Yehsa has not checked it\./, "Quoted from the book.") }));
    got.source = `Library: ${book.title}`;
    got.docId = null;
    got.opener = opener;
  }
  return { ...got, reader: { bookId: book.id, page, title: book.title } };
}

function pageText(text, chars = 1600) {
  const t = String(text || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length <= chars) return t;
  const cut = t.lastIndexOf(". ", chars);
  return `${t.slice(0, cut > chars * 0.5 ? cut + 1 : chars).trim()} …`;
}

/**
 * R14: page n of a book, quoted from its own text. A downloaded document's pages are the PDF's
 * own pages (page n = the PDF's page n); a book in the app is split into reader pages.
 */
export function pageAnswer(book, n, { open = false } = {}) {
  const total = book.pages?.length || 0;
  const unit = book.kind === "document" ? "page" : "reader page";
  if (!Number.isInteger(n) || n < 1 || n > total) {
    const text = `"${book.title}" has ${total} ${total === 1 ? "page" : "pages"} on this phone, so there's no page ${n}. Ask for a page from 1 to ${total}.`;
    return done(book, { kind: "page-missing", text, sections: [{ title: null, text }], reader: { bookId: book.id, page: Math.max(1, Math.min(total, 1)), title: book.title } });
  }
  const body = pageText(book.pages[n - 1]);
  const where = book.kind === "document" ? `page ${n} of ${total} in the downloaded copy` : `${unit} ${n} of ${total}`;
  if (body.replace(/\s+/g, "").length < 20) {
    const text = `Page ${n} of "${book.title}" has no readable text on this phone (it may be a scanned picture of the page). Open it in the reader to see what is there.`;
    return done(book, { kind: "page-empty", text, sections: [{ title: null, text }], reader: { bookId: book.id, page: n, title: book.title, auto: open } });
  }
  const head = `Page ${n} of "${book.title}" (${where}):`;
  const quote = `"${body}"`;
  const tail = `${book.kind === "document" ? UNVERIFIED_DOC : "Quoted from the book."} Source: ${book.title}, ${unit} ${n}.`;
  const got = done(book, {
    kind: "page",
    text: `${head}\n\n${quote}\n\n${tail}`,
    sections: [{ title: null, text: head }, { title: null, text: quote }, { title: null, text: tail }],
    reader: { bookId: book.id, page: n, title: book.title, auto: open }
  });
  got.citations = [{ title: book.title, page: n }];
  return got;
}

export function openAnswer(book, page = 1) {
  const text = `Opening "${book.title}" in the reader.`;
  return done(book, { kind: "open", text, sections: [{ title: null, text }], reader: { bookId: book.id, page, title: book.title, auto: true } });
}

/** req from docRequest(). */
export function libraryAnswer(req, book) {
  if (!req || !book) return null;
  if (req.kind === "chapters") return chaptersAnswer(book);
  if (req.kind === "chapter") return chapterAnswer(book, req.n);
  if (req.kind === "summary") return summaryAnswer(book);
  if (req.kind === "about") return aboutAnswer(book, req.topic);
  if (req.kind === "open") return openAnswer(book);
  if (req.kind === "page") return pageAnswer(book, req.n, { open: Boolean(req.open) });
  return null;
}
