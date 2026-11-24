// A downloaded file -> { title, pages: [text] }. PDFs keep their real pages; EPUB chapters,
// web pages and plain text are cut into page-sized parts so a citation can still point somewhere.
// All of it is treated as data: markup is stripped, scripts are dropped, nothing is run.

import { strFromU8, unzipSync } from "fflate";
import { cleanFetched } from "../web/sanitize.js";
import { extractPdfTextAsync } from "./pdf_text.js";

const PART_CHARS = 3500;

function decodeText(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    let out = "";
    for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return out;
  }
}

/**
 * Document text is data. Each paragraph goes through the same cleaner as web pages: invisible
 * characters, links and instruction-like lines ("ignore previous instructions...") are dropped.
 */
export function cleanDocText(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((para) => cleanFetched(para, { maxChars: 200000 }).text)
    .filter(Boolean)
    .join("\n\n");
}

/** Long text into parts of about PART_CHARS, cut at paragraph ends. */
export function partsOf(text, size = PART_CHARS) {
  const paras = String(text || "").split(/\n{2,}/);
  const parts = [];
  let cur = "";
  for (const para of paras) {
    if (cur && cur.length + para.length > size) {
      parts.push(cur.trim());
      cur = "";
    }
    cur += `${para}\n\n`;
    while (cur.length > size * 2) {
      parts.push(cur.slice(0, size).trim());
      cur = cur.slice(size);
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Web page or XHTML -> text with headings and paragraphs on their own lines. */
export function htmlToText(html) {
  let page = String(html || "")
    .replace(/<(script|style|noscript|template|svg|iframe|object|embed|form|nav|header|footer|aside)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const main = /<main\b[\s\S]*?<\/main>/i.exec(page)?.[0] || /<article\b[\s\S]*?<\/article>/i.exec(page)?.[0];
  if (main && main.length > 2000) page = main;
  page = page
    .replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi, (m, inner) => `\n\n${inner.replace(/<[^>]+>/g, " ").trim()}\n\n`)
    .replace(/<(?:br)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|blockquote|section|dd|dt|pre)>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "\n• ");
  page = page.replace(/<[^>]*>/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n");
  return cleanDocText(page).trim();
}

function htmlTitle(html) {
  const raw = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [null, ""])[1];
  return cleanFetched(raw, { html: true, maxChars: 140 }).text.replace(/\s*[|–-]\s[^|–-]*$/, "").trim();
}

function epubText(bytes) {
  const files = unzipSync(bytes, { filter: (f) => f.originalSize < 8 * 1024 * 1024 && /\.(?:xml|opf|x?html?|ncx)$/i.test(f.name) });
  const container = files["META-INF/container.xml"] ? strFromU8(files["META-INF/container.xml"]) : "";
  const opfPath = /full-path="([^"]+)"/.exec(container)?.[1] || Object.keys(files).find((n) => n.endsWith(".opf"));
  const opf = opfPath && files[opfPath] ? strFromU8(files[opfPath]) : "";
  const base = opfPath && opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const manifest = new Map();
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = /\bid="([^"]+)"/.exec(m[0])?.[1];
    const href = /\bhref="([^"]+)"/.exec(m[0])?.[1];
    if (id && href) manifest.set(id, base + decodeURIComponent(href));
  }
  const order = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/gi)].map((m) => manifest.get(m[1])).filter(Boolean);
  const names = order.length ? order : Object.keys(files).filter((n) => /\.x?html?$/i.test(n)).sort();
  const title = cleanFetched(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opf)?.[1] || "", { html: true, maxChars: 140 }).text;
  const pages = [];
  for (const name of names) {
    if (!files[name]) continue;
    for (const part of partsOf(htmlToText(strFromU8(files[name])))) pages.push(part);
    if (pages.length > 3000) break;
  }
  return { title, pages };
}

/**
 * bytes + format ("pdf" | "epub" | "text" | "html") -> { ok, title, pages, pageKind, reason }.
 * pageKind is "page" for PDFs (real page numbers) and "part" for everything else.
 */
export async function documentText(bytes, format, { onProgress = null } = {}) {
  if (format === "pdf") {
    const pdf = await extractPdfTextAsync(bytes, { onProgress });
    return { ...pdf, pages: (pdf.pages || []).map(cleanDocText), pageKind: "page" };
  }
  if (format === "epub") {
    try {
      const book = epubText(bytes);
      if (!book.pages.length) return { ok: false, reason: "That e-book had no readable text.", pages: [] };
      return { ok: true, title: book.title, pages: book.pages, pageKind: "part" };
    } catch {
      return { ok: false, reason: "I couldn't open that e-book.", pages: [] };
    }
  }
  const raw = decodeText(bytes);
  if (format === "html") {
    const text = htmlToText(raw);
    if (text.length < 200) return { ok: false, reason: "That page has too little text to keep as a document.", pages: [] };
    return { ok: true, title: htmlTitle(raw), pages: partsOf(text), pageKind: "part" };
  }
  const pages = partsOf(raw.replace(/\r\n?/g, "\n")).map(cleanDocText).filter(Boolean);
  if (pages.join("").length < 100) return { ok: false, reason: "That file has too little text to keep.", pages: [] };
  return { ok: true, title: "", pages, pageKind: "part" };
}
