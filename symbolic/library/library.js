// R7 (Dana, Nov 24: "I also want access to read these books"): one library for the reader.
// Every book is the same shape, whatever it came from:
//   { id, title, kind, source, pages: [text], chapters: [{ title, page }], pageKind }
// page numbers are 1-based. Sources: the two Army manuals in the app (ATP 3-50.21, ATP 4-02.11),
// the public-domain books bundled in the app, books you imported, and documents you downloaded.
// Pure: no storage, no network. The phone side loads the raw text and calls these builders.

import { splitSentences } from "../web/answer_builder.js";

export const PAGE_CHARS = 2200;

// Public-domain books bundled in the app (assets/books/<file>.ybk, the Project Gutenberg or
// Internet Archive text as published, license included).
export const BUNDLED_BOOKS = [
  { id: "book:tao", file: "tao_te_ching", title: "Tao Te Ching (Tao Teh King)", author: "Lao-tzu, tr. James Legge", aliases: ["tao te ching", "tao teh king", "tao"], headings: "tao" },
  { id: "book:kybalion", file: "the_kybalion", title: "The Kybalion", author: "Three Initiates", aliases: ["kybalion"] },
  { id: "book:gita", file: "bhagavad_gita", title: "Bhagavad Gita (The Song Celestial)", author: "tr. Edwin Arnold", aliases: ["bhagavad gita", "gita", "song celestial"] },
  { id: "book:dhammapada", file: "dhammapada", title: "Dhammapada", author: "tr. F. Max Muller", aliases: ["dhammapada"] },
  { id: "book:kjv", file: "kjv", title: "The Bible, King James Version", author: "", aliases: ["bible", "kjv", "king james"], headings: "kjv" },
  { id: "book:great-war-5", file: "great_war_vol_v", title: "The Story of the Great War, Volume V", author: "", aliases: ["great war", "story of the great war"] },
  { id: "book:hermetica", file: "hermetica_mead_vol2", title: "Thrice-Greatest Hermes, Volume II", author: "G. R. S. Mead", aliases: ["hermes", "hermetica", "thrice greatest hermes"], ocr: true },
  { id: "book:us-constitution", file: "us_constitution", title: "The Constitution of the United States", author: "National Archives transcription", aliases: ["constitution", "us constitution", "u.s. constitution", "united states constitution", "bill of rights", "constitution of the united states"] },
  { id: "book:barddas", file: "barddas", title: "Barddas", author: "ed. J. Williams Ab Ithel", aliases: ["barddas"], ocr: true }
];

export const MANUALS = [
  { id: "atp:atp-3-50.21", pubId: "atp-3-50.21", pub: "ATP 3-50.21", title: "ATP 3-50.21 Survival", aliases: ["atp 3-50.21", "atp 3 50 21", "army survival manual", "survival manual"] },
  { id: "atp:atp-4-02.11", pubId: "atp-4-02.11", pub: "ATP 4-02.11", title: "ATP 4-02.11 Army Emergency Medical Treatment", aliases: ["atp 4-02.11", "atp 4 02 11", "army first aid manual", "first aid manual", "emergency medical treatment"] }
];

// ---------- pages ----------

/** Text -> pages of about PAGE_CHARS, broken between paragraphs (a long paragraph is cut at a sentence). */
export function paginate(text, size = PAGE_CHARS) {
  const paras = String(text || "").replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((p) => p.replace(/[ \t]+\n/g, "\n").trim()).filter(Boolean);
  const pages = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) pages.push(cur.trim());
    cur = "";
  };
  for (let para of paras) {
    while (para.length > size * 1.4) {
      const cut = Math.max(para.lastIndexOf(". ", size), para.lastIndexOf("\n", size));
      const at = cut > size * 0.4 ? cut + 1 : size;
      if (cur) push();
      pages.push(para.slice(0, at).trim());
      para = para.slice(at).trim();
    }
    if (cur && cur.length + para.length + 2 > size) push();
    cur += `${cur ? "\n\n" : ""}${para}`;
  }
  push();
  return pages.length ? pages : [""];
}

// ---------- bundled text books ----------

const KJV_HEAD = /^(?:The (?:First |Second |Third |Fourth |Fifth )?Book of [A-Z].*|The (?:First|Second|Third|Fourth|Fifth) Book of Moses.*|The Gospel According to .*|The Acts of the Apostles|The (?:First |Second |Third )?(?:General )?Epistle .*|The Revelation of .*|The Lamentations of Jeremiah|The Proverbs|Ecclesiastes.*|The Song of Solomon|The Book of Psalms)$/;
const GENERIC_HEAD = /^(?:(?:CHAPTER|Chapter|BOOK|Book|PART|Part|CANTO|Canto|SECTION|Section)\b[ .]*(?:[IVXLC]+|\d+|[A-Z][a-z]+)?\b[.\-—:–]*.*|Ch\. \d+\.)$/;

function gutenbergParts(raw) {
  const text = String(raw || "").replace(/\r\n?/g, "\n");
  const start = /^\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG.*$/m.exec(text);
  const end = /^\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG.*$/m.exec(text);
  if (!start || !end || end.index < start.index) return { front: "", body: text, back: "" };
  return {
    front: text.slice(0, start.index + start[0].length),
    body: text.slice(start.index + start[0].length, end.index),
    back: text.slice(end.index)
  };
}

/** Chapter starts in a plain-text book: a short line set off by blank lines that reads like a heading. */
export function textChapters(body, { headings = null } = {}) {
  const lines = body.split("\n");
  const marks = [];
  const rule = headings === "kjv" ? KJV_HEAD : GENERIC_HEAD;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.length > 80) continue;
    const blankBefore = i === 0 || !lines[i - 1].trim();
    const blankAfter = i + 1 >= lines.length || !lines[i + 1].trim() || headings !== "kjv";
    // The Legge Tao Te Ching opens each chapter "Ch. 1. 1. ..." then "2. 1. ...": chapter, verse.
    const tao = headings === "tao" && blankBefore && /^(?:Ch\. )?\d{1,2}\. 1\. /.test(line);
    if (!(blankBefore && blankAfter) && !tao) continue;
    if (!rule.test(line) && !(tao && headings !== "kjv")) continue;
    // A heading word on its own ("CHAPTER" over a list of chapter names) takes the next line too.
    let title = tao ? `Chapter ${/(\d{1,2})\. 1\. /.exec(line)[1]}` : line;
    if (/^(?:CHAPTER|BOOK|PART|SECTION)\.?$/i.test(title)) continue;
    const next = lines[i + 1]?.trim();
    if (/^(?:CHAPTER|Chapter|BOOK|PART)\s+[IVXLC\d]+\.?$/.test(title) && next === "" && lines[i + 2]?.trim() && lines[i + 2].trim().length < 70 && !/[.]$/.test(lines[i + 2].trim())) {
      title = `${title} ${lines[i + 2].trim()}`;
    }
    marks.push({ line: i, title: title.replace(/\s+/g, " ").slice(0, 90) });
  }
  // A table of contents at the front lists every heading in a run; keep the later, real ones.
  const seen = new Map();
  for (const m of marks) seen.set(m.title.toLowerCase(), m);
  let kept = marks.filter((m) => seen.get(m.title.toLowerCase()) === m);
  // Contents lists: headings with almost nothing under them before the next one are dropped.
  kept = kept.filter((m, k) => {
    const stop = k + 1 < kept.length ? kept[k + 1].line : lines.length;
    return lines.slice(m.line + 1, stop).join(" ").trim().length >= 150;
  });
  return { lines, marks: kept };
}

/**
 * Plain-text books are wrapped at about 70 columns. Prose paragraphs are joined into one line so
 * the phone wraps them and sentences stay whole; verse (short lines) keeps its line breaks.
 */
export function unwrapProse(text) {
  return String(text || "").replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((para) => {
    const lines = para.split("\n");
    if (lines.length < 2) return para;
    const long = lines.filter((l) => l.trim().length >= 55).length;
    if (long < Math.max(1, (lines.length - 1) * 0.6)) return para;
    return lines.map((l) => l.trim()).join(" ").replace(/\s+/g, " ").replace(/(\w)- (\w)/g, "$1-$2");
  }).join("\n\n");
}

/** A bundled or imported plain-text book -> a reader book. */
export function bookFromText({ id, title, kind = "book", source = "", raw, headings = null, author = "" }) {
  const { front, body, back } = gutenbergParts(raw);
  const { lines, marks } = textChapters(body, { headings });
  const pages = [];
  const chapters = [];
  const addPart = (name, text) => {
    const part = paginate(unwrapProse(text));
    if (!part.join("").trim()) return;
    chapters.push({ title: name, page: pages.length + 1 });
    pages.push(...part);
  };
  if (front.trim()) addPart("About this edition", front);
  if (marks.length >= 2) {
    const lead = lines.slice(0, marks[0].line).join("\n");
    if (lead.trim().length > 200) addPart("Opening", lead);
    marks.forEach((m, k) => {
      const stop = k + 1 < marks.length ? marks[k + 1].line : lines.length;
      addPart(m.title, lines.slice(m.line, stop).join("\n"));
    });
  } else {
    // No headings found: parts of about 20 pages, so the list still jumps somewhere useful.
    const all = paginate(unwrapProse(body));
    for (let i = 0; i < all.length; i += 20) {
      chapters.push({ title: `Part ${Math.floor(i / 20) + 1}`, page: pages.length + 1 });
      pages.push(...all.slice(i, i + 20));
    }
  }
  if (back.trim()) addPart("Project Gutenberg License", back);
  return { id, title, author, kind, source, pages: pages.length ? pages : [""], chapters, pageKind: "page" };
}

// ---------- the Army manuals ----------

/** The ATP section pack (assets/atp/atp_sections.json) -> one reader book per manual. */
export function bookFromAtp(pack, pubId) {
  const meta = MANUALS.find((m) => m.pubId === pubId);
  const pub = (pack?.pubs || []).find((p) => p.id === pubId);
  if (!meta || !pub) return null;
  const rows = (pack.sections || []).filter((s) => s.pub === pub.pub);
  const pages = [];
  const chapters = [];
  let chapterKey = null;
  let buf = "";
  const flush = () => {
    if (buf.trim()) pages.push(...paginate(buf));
    buf = "";
  };
  for (const row of rows) {
    const num = String(row.para || "").split("-")[0];
    const key = `${num}|${row.chapter}`;
    if (key !== chapterKey) {
      flush();
      chapterKey = key;
      const label = /^\d+$/.test(num) ? `Chapter ${num}. ${row.chapter}` : /^[A-Z]$/.test(num) ? `Appendix ${num}. ${row.chapter}` : row.chapter;
      chapters.push({ title: label, page: pages.length + 1 });
      buf += `${label.toUpperCase()}\n\n`;
    }
    const head = row.section ? `${row.section}\n\n` : "";
    if (head && !buf.includes(head)) buf += head;
    buf += `${row.para}. ${row.text}\n\n`;
  }
  flush();
  return {
    id: meta.id,
    title: meta.title,
    author: "Headquarters, Department of the Army",
    kind: "manual",
    source: pub.url || "",
    license: pack.license || "",
    pages: pages.length ? pages : [""],
    chapters,
    pageKind: "page"
  };
}

// ---------- imported books and downloaded documents ----------

export function bookFromImported(store, bookId) {
  const book = (store?.books || []).find((b) => b.id === bookId);
  if (!book) return null;
  const notes = (store.notes || []).filter((n) => n.bookId === bookId);
  let text = "";
  let last = null;
  const marks = [];
  for (const note of notes) {
    const heading = note.title && note.title !== book.title ? note.title.replace(`${book.title}: `, "") : null;
    if (heading && heading !== last) {
      marks.push({ title: heading, at: text.length });
      text += `${heading.toUpperCase()}\n\n`;
      last = heading;
    }
    text += `${note.context}\n\n`;
  }
  const pages = [];
  const chapters = [];
  if (marks.length >= 2) {
    marks.forEach((m, k) => {
      chapters.push({ title: m.title, page: pages.length + 1 });
      pages.push(...paginate(text.slice(m.at, k + 1 < marks.length ? marks[k + 1].at : text.length)));
    });
  } else {
    pages.push(...paginate(text));
    chapters.push({ title: book.title, page: 1 });
  }
  return { id: `imported:${bookId}`, title: book.title, author: book.author || "", kind: "imported", source: "Imported on this phone", pages, chapters, pageKind: "page" };
}

const CHAPTERISH = /^(?:(?:chapter|part|section|appendix|annex|book|lesson|unit|module)\s+[\dIVXLC]+\b|[IVXLC]{1,6}\.\s+\S|\d{1,2}\.\s+[A-Z])/i;

/** The chapter list of a downloaded document: its own bookmarks when it has them, else its headings. */
export function docChapters({ outline = [], sections = [], pageCount = 0 } = {}) {
  const fromOutline = (outline || []).filter((o) => o.title && Number.isInteger(o.page) && o.page >= 1 && (!pageCount || o.page <= pageCount));
  const top = fromOutline.filter((o) => o.depth === 0);
  if (top.length >= 2) return top.map((o) => ({ title: o.title, page: o.page }));
  if (fromOutline.length >= 2) return fromOutline.map((o) => ({ title: o.title, page: o.page }));
  const heads = [];
  const seen = new Set();
  for (const s of sections || []) {
    const h = String(s.heading || "").trim();
    if (!h || h.length < 3) continue;
    const key = h.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    heads.push({ title: h, page: s.page });
  }
  const chapterish = heads.filter((h) => CHAPTERISH.test(h.title));
  const list = chapterish.length >= 2 ? chapterish : heads;
  return list.slice(0, 80);
}

export function bookFromDoc(meta, body) {
  if (!meta || !body?.pages) return null;
  const chapters = docChapters({ outline: body.outline, sections: body.sections, pageCount: body.pages.length });
  return {
    id: `doc:${meta.id}`,
    docId: meta.id,
    title: meta.title,
    author: meta.site || "",
    kind: "document",
    source: meta.url,
    pages: body.pages.length ? body.pages : [""],
    chapters: chapters.length ? chapters : [{ title: meta.title, page: 1 }],
    pageKind: meta.pageKind || "page",
    sections: body.sections || []
  };
}

// ---------- the list, and finding a book by name ----------

const STOP = new Set(["the", "a", "an", "of", "and", "for", "to", "in", "on", "my", "that", "this", "book", "books", "manual", "document", "pdf", "file", "copy", "guide", "army", "department", "version", "volume", "vol", "edition", "downloaded", "reader"]);

function words(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9.\- ]+/g, " ").split(/\s+/).map((w) => w.replace(/^[.-]+|[.-]+$/g, "")).filter((w) => w && !STOP.has(w));
}

function codeOf(text) {
  const m = /\b([a-z]{1,5})\s?-?(\d{1,3}(?:[-.]\d{1,3}){1,3})\b/i.exec(String(text || ""));
  return m ? `${m[1]}${m[2]}`.toLowerCase().replace(/[^a-z0-9]/g, "") : null;
}

/**
 * entries: [{ id, title, aliases?, query? }]. Returns { entry, score } for the best match of what the
 * person called it ("kubark", "the survival manual", "ATP 3-50.21"), or null.
 */
export function matchTitle(entries, target) {
  const want = words(target);
  if (!want.length) return null;
  const code = codeOf(target);
  let best = null;
  for (const entry of entries || []) {
    const names = [entry.title, ...(entry.aliases || []), entry.query || ""].filter(Boolean);
    let score = 0;
    for (const name of names) {
      const have = new Set(words(name));
      if (code && codeOf(name) === code) score = Math.max(score, 2);
      const hit = want.filter((w) => have.has(w) || [...have].some((h) => h.length >= 5 && (h.startsWith(w) || w.startsWith(h)))).length;
      const frac = hit / want.length;
      // Most of what was asked must be in the name, and a long name needs more than one stray word.
      const cover = hit / Math.max(1, have.size);
      const s = frac >= 0.6 ? frac + Math.min(0.3, cover * 0.3) : 0;
      score = Math.max(score, s);
    }
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best && best.score >= 0.6 ? best : null;
}

/** The library list: manuals, bundled books, imported books, downloaded documents. */
export function libraryList({ docs = [], imported = null } = {}) {
  const out = [];
  for (const m of MANUALS) out.push({ id: m.id, title: m.title, kind: "manual", group: "Army manuals", aliases: m.aliases });
  for (const b of BUNDLED_BOOKS) out.push({ id: b.id, title: b.title, kind: "book", group: "Books in the app", aliases: b.aliases, author: b.author });
  for (const b of imported?.books || []) out.push({ id: `imported:${b.id}`, title: b.title, kind: "imported", group: "Books you imported", aliases: [], author: b.author || "" });
  for (const d of docs || []) out.push({ id: `doc:${d.id}`, docId: d.id, title: d.title, kind: "document", group: "Downloaded documents", aliases: [], query: d.query || "", pageCount: d.pageCount });
  return out;
}

// ---------- chapters, summaries ----------

const ORDINAL = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const ROMAN = { i: 1, v: 5, x: 10, l: 50, c: 100 };

export function chapterNumber(word) {
  const w = String(word || "").toLowerCase().replace(/^(\d+)(?:st|nd|rd|th)$/, "$1");
  if (w === "last") return -1;
  if (/^\d+$/.test(w)) return Number(w);
  if (ORDINAL[w]) return ORDINAL[w];
  if (/^[ivxlc]+$/.test(w)) {
    let n = 0;
    for (let i = 0; i < w.length; i += 1) {
      const v = ROMAN[w[i]];
      const next = ROMAN[w[i + 1]] || 0;
      n += v < next ? -v : v;
    }
    return n || null;
  }
  return null;
}

/** The chapters a person means by "chapter 1": front matter (cover, contents, preface) is skipped. */
export function contentChapters(book) {
  const front = /^(?:cover|title page|contents|table of contents|preface|foreword|introduction to this edition|about this edition|opening|acknowledg\w*|summary of change|distribution|project gutenberg license|glossary|references|index|bibliography)\b/i;
  const list = (book?.chapters || []).filter((c) => !front.test(c.title));
  return list.length ? list : book?.chapters || [];
}

/** Chapter n (1-based, -1 for last) -> { chapter, index, from, to } (pages, 1-based, inclusive). */
export function chapterRange(book, n) {
  const all = book.chapters || [];
  const content = contentChapters(book);
  // "Chapter 3" names the chapter numbered 3 when the titles carry numbers.
  let pick = null;
  if (n > 0) pick = content.find((c) => new RegExp(`^(?:chapter|part|book|section)\\s+(?:${n}|${toRoman(n)})\\b`, "i").test(c.title)) || content[n - 1] || null;
  else if (n === -1) pick = content[content.length - 1] || null;
  if (!pick) return null;
  const index = all.indexOf(pick);
  const next = all.slice(index + 1).find((c) => c.page > pick.page);
  return { chapter: pick, index, from: pick.page, to: next ? next.page - 1 : book.pages.length };
}

function toRoman(n) {
  const table = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  let left = n;
  for (const [v, s] of table) while (left >= v) { out += s; left -= v; }
  return out;
}

const STOPWORDS = new Set("a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours also may must shall one two upon unto thou thee thy ye hath".split(" "));

function contentWords(text) {
  return String(text || "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

/**
 * An extractive summary: in each chapter (up to `parts` of them), the one sentence that best carries
 * the book's own frequent words. Word for word, with the page. Same book, same summary, every time.
 */
export function summarizeBook(book, { parts = 8, chapterRange: only = null } = {}) {
  const from = only ? only.from : 1;
  const to = only ? only.to : book.pages.length;
  const freq = new Map();
  for (let p = from; p <= to; p += 1) for (const w of contentWords(book.pages[p - 1])) freq.set(w, (freq.get(w) || 0) + 1);
  let spans;
  if (only) {
    const len = to - from + 1;
    const k = Math.min(parts, Math.max(1, Math.ceil(len / 2)));
    spans = Array.from({ length: k }, (_, i) => ({ title: null, from: from + Math.floor((i * len) / k), to: from + Math.floor(((i + 1) * len) / k) - 1 }));
  } else {
    const content = contentChapters(book);
    const all = book.chapters || [];
    const ranges = content.map((c) => {
      const idx = all.indexOf(c);
      const next = all.slice(idx + 1).find((x) => x.page > c.page);
      return { title: c.title, from: c.page, to: next ? next.page - 1 : book.pages.length };
    });
    if (ranges.length > parts) {
      const step = ranges.length / parts;
      spans = Array.from({ length: parts }, (_, i) => ranges[Math.floor(i * step)]);
    } else spans = ranges.length ? ranges : [{ title: null, from, to }];
  }
  const lines = [];
  for (const span of spans) {
    let best = null;
    for (let p = span.from; p <= Math.min(span.to, span.from + 30); p += 1) {
      for (const s of splitSentences(book.pages[p - 1] || "")) {
        if (s.length < 60 || s.length > 320) continue;
        const ws = contentWords(s);
        if (ws.length < 6) continue;
        const score = ws.reduce((n, w) => n + Math.log(1 + (freq.get(w) || 0)), 0) / Math.sqrt(ws.length) - (p - span.from) * 0.01;
        if (!best || score > best.score) best = { text: s, page: p, score };
      }
    }
    if (best && !lines.some((l) => l.text === best.text)) lines.push({ title: span.title, text: best.text, page: best.page });
  }
  return lines;
}
