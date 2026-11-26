// R14: a catalog page is not a file. A Library of Congress item (loc.gov/item/<id>/) or an Internet
// Archive item (archive.org/details/<id>) is a landing page; the book itself is a PDF listed in the
// item's own JSON. resolveItem asks that JSON (loc.gov ?fo=json, archive.org /metadata/<id>) for
// the real PDF, its size and the item's clean title, so the app downloads the file itself instead of
// opening a browser to a Cloudflare check and a "Download: PDF / Go" form. Only the item address is
// fetched (no query words, no cookies), through fetch_guard. If no file resolves, the result stays a
// web page that opens in the browser, and it is not offered as a download.
import { guardedFetch } from "../web/fetch_guard.js";

const META_LIMITS = { maxBytes: 4 * 1024 * 1024, timeoutMs: 20000, maxRedirects: 3 };

function parse(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** { kind: "loc" | "ia", id } for a catalog item page, else null. */
export function catalogItem(url) {
  const u = parse(url);
  if (!u || u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let m;
  if (host === "loc.gov" && (m = /^\/(?:item|resource)\/([a-z0-9._-]+)\/?$/i.exec(u.pathname))) return { kind: "loc", id: m[1] };
  if (host === "archive.org" && (m = /^\/(?:details|download)\/([A-Za-z0-9._-]+)\/?$/.exec(u.pathname))) return { kind: "ia", id: m[1] };
  return null;
}

/** Catalog and library landing pages: never downloaded as a page; a file must resolve. */
export function isLandingPage(url) {
  if (catalogItem(url)) return true;
  const u = parse(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (/(?:^|\.)loc\.gov$/.test(host) && /^\/(?:item|resource|search|collections?)\b/i.test(u.pathname)) return true;
  if (host === "archive.org" && /^\/(?:details|search)\b/i.test(u.pathname)) return true;
  return /(?:^|\.)(?:hathitrust\.org|worldcat\.org|openlibrary\.org|goodreads\.com|books\.google\.[a-z.]+)$/.test(host);
}

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

function cleanText(v) {
  return String(first(v) || "").replace(/\s+/g, " ").replace(/[\s/.,;:]+$/, "").trim();
}

/** "4", "v. 4", "Vol. IV" -> 4 (null when not a volume). */
export function volumeOf(text) {
  const t = String(text || "");
  const m = /\b(?:vol(?:ume)?s?\.?|v\.)\s*([0-9]{1,3}|[ivxl]{1,6})\b/i.exec(t) || /^\s*([0-9]{1,3})\s*$/.exec(t) || /vol(?:ume)?([0-9]{1,3})(?:[^0-9]|$)/i.exec(t);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  if (/^\d+$/.test(raw)) return Number(raw);
  const R = { i: 1, v: 5, x: 10, l: 50 };
  let n = 0;
  for (let i = 0; i < raw.length; i += 1) n += R[raw[i]] < (R[raw[i + 1]] || 0) ? -R[raw[i]] : R[raw[i]];
  return n || null;
}

function sizeOf(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** loc.gov item JSON -> { pdfs: [{ url, size }], title }. Pure, for tests. */
export function locFiles(data) {
  const pdfs = [];
  const seen = new Set();
  const add = (url, size) => {
    const u = String(url || "");
    if (!/^https:\/\//i.test(u) || !/\.pdf(?:$|[?#])/i.test(u) || seen.has(u)) return;
    seen.add(u);
    pdfs.push({ url: u, size: sizeOf(size) });
  };
  for (const r of data?.resources || []) {
    for (const group of r?.files || []) {
      for (const f of Array.isArray(group) ? group : [group]) {
        if (/pdf/i.test(String(f?.mimetype || "")) || /\.pdf(?:$|[?#])/i.test(String(f?.url || ""))) add(f.url, f.size);
      }
    }
    if (typeof r?.pdf === "string") add(r.pdf, null);
  }
  const item = data?.item || {};
  const title = cleanText(item.title || data?.title || "");
  return { pdfs, title, volume: volumeOf(cleanText(item.part_of_title || "")) || null };
}

/** archive.org metadata JSON -> { pdfs: [{ url, size, text }], title, volume }. Pure, for tests. */
export function iaFiles(data, id) {
  const pdfs = [];
  for (const f of data?.files || []) {
    const name = String(f?.name || "");
    if (!/\.pdf$/i.test(name) || /(?:^|\/)__/.test(name)) continue;
    pdfs.push({
      url: `https://archive.org/download/${encodeURIComponent(id)}/${name.split("/").map(encodeURIComponent).join("/")}`,
      size: sizeOf(f.size),
      text: /text pdf/i.test(String(f.format || ""))
    });
  }
  // A Text PDF (searchable) first, then the biggest.
  pdfs.sort((a, b) => Number(b.text) - Number(a.text) || (b.size || 0) - (a.size || 0));
  const meta = data?.metadata || {};
  return { pdfs, title: cleanText(meta.title), volume: volumeOf(cleanText(meta.volume)) || volumeOf(id) };
}

/** loc.gov item page HTML (when the JSON API is behind a bot check) -> { pdfs, title }. Pure. */
export function locFilesFromHtml(html) {
  const text = String(html || "");
  const pdfs = [];
  const seen = new Set();
  const re = /https:\/\/tile\.loc\.gov\/storage-services\/[^"'<>\s]+?\.pdf\b/g;
  let m;
  while ((m = re.exec(text))) {
    const u = m[0].replace(/&amp;/g, "&");
    if (!seen.has(u)) {
      seen.add(u);
      pdfs.push({ url: u, size: null });
    }
  }
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(text) || /<title>([^<]+?)(?:\s*\|\s*Library of Congress)?\s*<\/title>/i.exec(text);
  const title = og ? og[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') : "";
  return { pdfs, title: cleanText(title), volume: null };
}

/**
 * The real file behind a catalog item page.
 * Returns { ok: true, url, format: "pdf", size, title, volume, via } or { ok: false, reason }.
 */
export async function resolveItem({ fetchImpl, url }) {
  const item = catalogItem(url);
  if (!item) return { ok: false, reason: "not-a-catalog-item" };
  const api = item.kind === "loc" ? `https://www.loc.gov/item/${item.id}/?fo=json` : `https://archive.org/metadata/${encodeURIComponent(item.id)}`;
  const got = await guardedFetch({ fetchImpl, url: api, group: "open", kind: "json", limits: META_LIMITS });
  let files = null;
  if (got.ok) {
    try {
      const data = JSON.parse(got.text);
      files = item.kind === "loc" ? locFiles(data) : iaFiles(data, item.id);
    } catch {
      files = null;
    }
  }
  // loc.gov's JSON is often behind a bot check; the item page itself lists the PDF link.
  if ((!files || !files.pdfs.length) && item.kind === "loc") {
    const page = await guardedFetch({ fetchImpl, url: `https://www.loc.gov/item/${item.id}/`, group: "open", kind: "html", limits: META_LIMITS });
    if (page.ok) files = locFilesFromHtml(page.text);
  }
  if (!files) return { ok: false, reason: got.ok ? "The item's details weren't readable." : got.reason };
  // loc.gov: the whole-book PDF is the biggest one (single-page PDFs are listed too).
  const pick = item.kind === "loc" ? [...files.pdfs].sort((a, b) => (b.size || 0) - (a.size || 0))[0] : files.pdfs[0];
  if (!pick) return { ok: false, reason: "That item has no PDF file I can download.", title: files.title || null, volume: files.volume || null };
  return { ok: true, url: pick.url, format: "pdf", size: pick.size, title: files.title || null, volume: files.volume || null, via: url };
}
