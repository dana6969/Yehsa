// Import your own books: EPUB and plain text, parsed on the device.
// Imported notes are kept apart from the approved field notes, carry the book title as
// their source, can be deleted book by book, and rank below every approved note.
// Nothing here opens a network connection.

import { unzipSync, strFromU8 } from "fflate";
import { searchPassages, queryTokens } from "./book_search.js";
import { modelDangerWarning } from "./model_link.js";

export const IMPORT_TRUST = "imported";
export const NOTE_TARGET_CHARS = 900;
export const NOTE_MAX_CHARS = 1400;
export const BOOK_NOTE_CAP = 6000;
export const MAX_BOOK_BYTES = 60 * 1024 * 1024;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", deg: "°" };

export function decodeEntities(text) {
  return String(text || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

// XHTML to plain paragraphs. Headings become their own lines marked with "# ".
export function htmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<(script|style|svg|math|nav)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (m, inner) => `\n\n# ${inner.replace(/<[^>]+>/g, " ")}\n\n`);
  s = s.replace(/<(br|hr)\b[^>]*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|tr|blockquote|section|article|dd|dt|pre|table|ul|ol)>/gi, "\n\n");
  s = s.replace(/<li\b[^>]*>/gi, "\n• ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s.split(/\n{2,}/).map((para) => para.replace(/[ \t\r\f\v\u00a0]+/g, " ").replace(/\s*\n\s*/g, " ").trim()).filter(Boolean).join("\n\n");
}

function attr(tag, name) {
  const m = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3]) : null;
}

function resolvePath(base, href) {
  const clean = decodeURIComponent(String(href || "").split("#")[0]);
  if (!clean) return null;
  const parts = (base ? base.split("/").slice(0, -1) : []).concat(clean.split("/"));
  const out = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function bytesOf(raw) {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (typeof raw === "string") return new TextEncoder().encode(raw);
  return new Uint8Array();
}

export function decodeText(raw) {
  const bytes = bytesOf(raw);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(start));
}

export function parseTxt(name, raw) {
  const bytes = bytesOf(raw);
  if (!bytes.length) return { ok: false, reason: "That file is empty. Nothing was added." };
  if (bytes.length > MAX_BOOK_BYTES) return { ok: false, reason: "That file is over 60 MB. Nothing was added." };
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let zeros = 0;
  for (const b of sample) if (b === 0) zeros += 1;
  if (zeros > sample.length / 20 && !(sample[0] === 0xff || sample[0] === 0xfe)) {
    return { ok: false, reason: "That file is not plain text. Nothing was added." };
  }
  const text = decodeText(bytes).replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const firstLine = lines.find((line) => line.trim())?.trim() || "";
  const gutenberg = text.match(/^Title:\s*(.+)$/m);
  const title = (gutenberg?.[1] || String(name || "").replace(/\.[^.]+$/, "") || firstLine.slice(0, 80) || "Imported text").trim();
  const author = (text.match(/^Author:\s*(.+)$/m) || [])[1] || null;
  // Plain text keeps single newlines inside paragraphs; blank lines split them.
  const body = text.split(/\n\s*\n/).map((para) => {
    const trimmed = para.replace(/\s+/g, " ").trim();
    if (/^(chapter|part|book|section)\s+[\divxlc]+\b/i.test(trimmed) && trimmed.length < 90) return `# ${trimmed}`;
    return trimmed;
  }).filter(Boolean).join("\n\n");
  if (!body.trim()) return { ok: false, reason: "That file has no readable text. Nothing was added." };
  return { ok: true, format: "txt", title: title.slice(0, 120), author, text: body, bytes: bytes.length };
}

export function parseEpub(name, raw) {
  const bytes = bytesOf(raw);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return { ok: false, reason: "That file is not an EPUB (EPUB is a zip file). Nothing was added." };
  }
  if (bytes.length > MAX_BOOK_BYTES) return { ok: false, reason: "That EPUB is over 60 MB. Nothing was added." };
  let files;
  try {
    // Images and fonts are skipped so a big illustrated book does not fill memory.
    files = unzipSync(bytes, { filter: (file) => /\.(x?html?|xml|opf|ncx)$/i.test(file.name) || file.name === "mimetype" });
  } catch {
    return { ok: false, reason: "That EPUB could not be opened. It may be damaged. Nothing was added." };
  }
  const read = (path) => (files[path] ? strFromU8(files[path]) : null);
  if (Object.keys(files).some((path) => /^META-INF\/encryption\.xml$/i.test(path))) {
    const enc = read("META-INF/encryption.xml") || "";
    if (/EncryptedData/i.test(enc) && !/obfuscation|font/i.test(enc)) {
      return { ok: false, reason: "That EPUB is copy-protected (DRM). Yehsa cannot read it. Nothing was added." };
    }
  }
  const container = read("META-INF/container.xml");
  let opfPath = container ? attr((container.match(/<rootfile\b[^>]*>/i) || [""])[0], "full-path") : null;
  if (!opfPath || !files[opfPath]) opfPath = Object.keys(files).find((path) => /\.opf$/i.test(path)) || null;
  let order = [];
  let title = null;
  let author = null;
  if (opfPath) {
    const opf = read(opfPath) || "";
    title = decodeEntities(((opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i) || [])[1] || "").replace(/<[^>]+>/g, "").trim()) || null;
    author = decodeEntities(((opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i) || [])[1] || "").replace(/<[^>]+>/g, "").trim()) || null;
    const manifest = new Map();
    for (const tag of opf.match(/<item\b[^>]*>/gi) || []) {
      const id = attr(tag, "id");
      const href = attr(tag, "href");
      const type = attr(tag, "media-type") || "";
      if (id && href) manifest.set(id, { path: resolvePath(opfPath, href), type });
    }
    for (const tag of opf.match(/<itemref\b[^>]*>/gi) || []) {
      const entry = manifest.get(attr(tag, "idref"));
      if (entry && /html/i.test(entry.type || entry.path) && files[entry.path]) order.push(entry.path);
    }
  }
  if (!order.length) order = Object.keys(files).filter((path) => /\.x?html?$/i.test(path)).sort();
  if (!order.length) return { ok: false, reason: "That EPUB has no chapters Yehsa can read. Nothing was added." };
  const parts = [];
  for (const path of order) {
    const text = htmlToText(read(path));
    if (text) parts.push(text);
  }
  const text = parts.join("\n\n");
  if (!text.trim()) return { ok: false, reason: "That EPUB has no readable text. Nothing was added." };
  return {
    ok: true,
    format: "epub",
    title: (title || String(name || "").replace(/\.[^.]+$/, "") || "Imported book").slice(0, 120),
    author,
    text,
    bytes: bytes.length
  };
}

export function parseBook(name, raw) {
  const lower = String(name || "").toLowerCase();
  const bytes = bytesOf(raw);
  if (lower.endsWith(".epub") || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return parseEpub(name, bytes);
  if (lower.endsWith(".zim")) return { ok: false, reason: "ZIM files open from the Kiwix section, not as a book." };
  if (lower.endsWith(".txt") || lower.endsWith(".text") || lower.endsWith(".md") || !/\.[a-z0-9]{2,5}$/.test(lower)) return parseTxt(name, bytes);
  return { ok: false, reason: "Only EPUB and TXT books can be imported. Nothing was added." };
}

function slug(text) {
  return String(text || "book").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "book";
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += Math.max(1, Math.floor(text.length / 4096))) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// Split into notes: paragraphs packed up to ~900 chars, never crossing a heading.
export function splitNotes(book) {
  const bookId = book.id || `book-${slug(book.title)}-${hashString(book.text || "")}`;
  const notes = [];
  let heading = null;
  let buffer = [];
  let size = 0;
  const flush = () => {
    if (!buffer.length) return;
    const text = buffer.join(" ").trim();
    if (text.length >= 40 && notes.length < BOOK_NOTE_CAP) {
      const index = notes.length;
      notes.push({
        id: `${bookId}#${index}`,
        bookId,
        symbol: `${slug(book.title)}_${index}`,
        title: heading ? `${book.title}: ${heading}` : book.title,
        context: text,
        source: `Imported book: ${book.title}`,
        trust: IMPORT_TRUST
      });
    }
    buffer = [];
    size = 0;
  };
  for (const para of String(book.text || "").split(/\n\n+/)) {
    if (para.startsWith("# ")) {
      flush();
      heading = para.slice(2).trim().slice(0, 80) || heading;
      continue;
    }
    let rest = para;
    while (rest.length > NOTE_MAX_CHARS) {
      const cut = rest.lastIndexOf(". ", NOTE_TARGET_CHARS) > 200 ? rest.lastIndexOf(". ", NOTE_TARGET_CHARS) + 1 : NOTE_TARGET_CHARS;
      flush();
      buffer.push(rest.slice(0, cut));
      flush();
      rest = rest.slice(cut).trim();
    }
    if (size + rest.length > NOTE_TARGET_CHARS && size > 0) flush();
    buffer.push(rest);
    size += rest.length + 1;
  }
  flush();
  return { bookId, notes, capped: notes.length >= BOOK_NOTE_CAP };
}

export function emptyImported() {
  return { version: 1, books: [], notes: [] };
}

export function addBook(store, parsed, now = new Date()) {
  const current = store || emptyImported();
  if (!parsed?.ok) return { store: current, added: false, reason: parsed?.reason || "Nothing was added." };
  const { bookId, notes, capped } = splitNotes(parsed);
  if (!notes.length) return { store: current, added: false, reason: "That book had no passages long enough to keep. Nothing was added." };
  if (current.books.some((book) => book.id === bookId)) {
    return { store: current, added: false, reason: `${parsed.title} is already imported.` };
  }
  const book = {
    id: bookId,
    title: parsed.title,
    author: parsed.author || null,
    format: parsed.format,
    bytes: parsed.bytes || 0,
    notes: notes.length,
    capped,
    addedAt: now.toISOString(),
    trust: IMPORT_TRUST
  };
  return {
    store: { ...current, books: [...current.books, book], notes: [...current.notes, ...notes] },
    added: true,
    book,
    reason: `${book.title}: ${notes.length} passages added${capped ? " (the first part only; the book is very long)" : ""}. Marked as your import, below Yehsa's checked notes.`
  };
}

export function deleteBook(store, bookId) {
  const current = store || emptyImported();
  return {
    ...current,
    books: current.books.filter((book) => book.id !== bookId),
    notes: current.notes.filter((note) => note.bookId !== bookId)
  };
}

export function openImported(raw) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || !Array.isArray(data.books) || !Array.isArray(data.notes)) return emptyImported();
    const ids = new Set(data.books.map((book) => book.id));
    return {
      version: 1,
      books: data.books.map((book) => ({ ...book, trust: IMPORT_TRUST })),
      notes: data.notes.filter((note) => ids.has(note.bookId)).map((note) => ({ ...note, trust: IMPORT_TRUST, source: String(note.source || "").startsWith("Imported book: ") ? note.source : `Imported book: ${note.source || "unknown"}` }))
    };
  } catch {
    return emptyImported();
  }
}

// --- Background token index -------------------------------------------------
// Built in small slices with a yield between them, so the screen stays responsive.
// The Ask path only reads the finished index; it never builds one.

function noteTokens(note) {
  return new Set(queryTokens(`${note.title} ${note.context}`));
}

export async function buildImportIndex(store, { sliceSize = 200, yieldFn, onProgress } = {}) {
  const pause = yieldFn || (() => new Promise((resolve) => setTimeout(resolve, 0)));
  const postings = new Map();
  const notes = store?.notes || [];
  for (let start = 0; start < notes.length; start += sliceSize) {
    const end = Math.min(notes.length, start + sliceSize);
    for (let i = start; i < end; i += 1) {
      for (const token of noteTokens(notes[i])) {
        let list = postings.get(token);
        if (!list) postings.set(token, (list = []));
        list.push(i);
      }
    }
    onProgress?.(end, notes.length);
    if (end < notes.length) await pause();
  }
  return { size: notes.length, postings };
}

function stem(token) {
  return token.length > 3 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
}

function candidates(index, store, tokens) {
  if (!index?.postings) return store?.notes || [];
  const seen = new Set();
  for (const token of tokens) {
    for (const form of new Set([token, stem(token), `${token}s`])) {
      for (const i of index.postings.get(form) || []) seen.add(i);
    }
  }
  return [...seen].slice(0, 2000).map((i) => store.notes[i]).filter(Boolean);
}

const CARE_WORDS = /\b(bleed|bleeding|blood|tourniquet|wound|burn|burns|cpr|chok|choking|unconscious|breathing|snake|snakebite|venom|frostbite|hypotherm|heat ?stroke|poison|overdose|allerg|anaphyla|seizure|stroke|heart attack|chest pain|fracture|splint|shock|drown|dose|dosage|medicine|medication|pill|infection|fever|pregnan|baby|infant)\w*/i;

export function isCareQuestion(question) {
  return CARE_WORDS.test(String(question || ""));
}

// Lowest-trust retrieval. Caller only uses this after safety, approved notes and learned notes miss.
export function retrieveImported(question, store, index) {
  if (!store?.notes?.length) return null;
  const tokens = queryTokens(question);
  if (!tokens.length) return null;
  const pool = candidates(index, store, tokens).filter((note) => !modelDangerWarning(note.context));
  const hits = searchPassages(pool, question, 3);
  const need = tokens.length === 1 ? 30 : 45;
  const best = hits.find((hit) => hit.score >= need);
  if (!best) return null;
  return best;
}

export function formatImported(hit, { care = false } = {}) {
  const book = String(hit.source || "").replace(/^Imported book: /, "");
  const body = String(hit.context || "").replace(/\s+/g, " ").trim().slice(0, 700);
  const warn = care
    ? " This is from a book you imported, not a checked care note. For an emergency, follow Yehsa's emergency steps and call for help first."
    : "";
  return `From your book "${book}" (your import, not checked by Yehsa): ${body}${warn}`;
}
