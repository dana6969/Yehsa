// Kiwix ZIM reader in pure JS. Reads only the byte ranges it needs through readAt(),
// so a multi-gigabyte file is never loaded whole. No network.
// Supported: header, MIME list, URL and title pointer lists, directory entries,
// redirects, uncompressed clusters and zstd clusters (via fzstd), extended clusters.
// Not supported: xz/LZMA2 clusters (older ZIMs, before about 2021) and the Xapian
// full-text index. See docs/kiwix-zim.md.

import { decompress as zstdDecompress } from "fzstd";
import { htmlToText } from "./book_import.js";

export const ZIM_MAGIC = 72173914;
const COMPRESSION = { 0: "none", 1: "none", 2: "zlib", 3: "bzip2", 4: "xz", 5: "zstd" };

function u64(view, offset) {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return hi * 0x100000000 + lo;
}

function cstr(bytes, start) {
  let end = start;
  while (end < bytes.length && bytes[end] !== 0) end += 1;
  return { text: new TextDecoder("utf-8").decode(bytes.subarray(start, end)), next: end + 1 };
}

export class ZimError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export async function openZim(readAt, { size = null, clusterCacheSize = 4 } = {}) {
  const head = await readAt(0, 80);
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (head.length < 80 || view.getUint32(0, true) !== ZIM_MAGIC) {
    throw new ZimError("That file is not a Kiwix ZIM file. Nothing was added.", "not-zim");
  }
  const header = {
    major: view.getUint16(4, true),
    minor: view.getUint16(6, true),
    entryCount: view.getUint32(24, true),
    clusterCount: view.getUint32(28, true),
    urlPtrPos: u64(view, 32),
    titlePtrPos: u64(view, 40),
    clusterPtrPos: u64(view, 48),
    mimeListPos: u64(view, 56),
    mainPage: view.getUint32(64, true),
    checksumPos: u64(view, 72),
    size
  };
  if (header.major < 5 || header.major > 6) throw new ZimError(`ZIM version ${header.major} is not supported.`, "version");
  const mimeBytes = await readAt(header.mimeListPos, Math.max(64, Math.min(8192, header.urlPtrPos - header.mimeListPos || 4096)));
  const mimes = [];
  for (let at = 0; at < mimeBytes.length;) {
    const { text, next } = cstr(mimeBytes, at);
    if (!text) break;
    mimes.push(text);
    at = next;
  }
  const clusterCache = new Map();

  async function urlPointer(index) {
    const b = await readAt(header.urlPtrPos + index * 8, 8);
    return u64(new DataView(b.buffer, b.byteOffset, 8), 0);
  }

  // Title order: newer files (libzim 7+) leave titlePtrPos unset and keep the order in
  // X/listing/titleOrdered/v1 (front articles) or v0 (all entries). Older files use the header list.
  const hasHeaderTitles = header.titlePtrPos > 0 && header.titlePtrPos < 0xfffffffffff0;
  let listing = null;

  async function titleList() {
    if (listing) return listing;
    for (const name of ["listing/titleOrdered/v1", "listing/titleOrdered/v0"]) {
      const entry = await findUrl("X", name);
      if (!entry) continue;
      const { bytes } = await content(entry);
      const copy = bytes.slice();
      listing = { count: copy.length >>> 2, view: new DataView(copy.buffer, copy.byteOffset, copy.byteLength) };
      return listing;
    }
    if (hasHeaderTitles) {
      listing = { count: header.entryCount, view: null };
      return listing;
    }
    throw new ZimError("This ZIM has no title index, so it cannot be searched.", "no-title-index");
  }

  async function titleIndex(index) {
    const list = await titleList();
    if (list.view) return list.view.getUint32(index * 4, true);
    const b = await readAt(header.titlePtrPos + index * 4, 4);
    return new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true);
  }

  async function findUrl(namespace, url) {
    const key = `${namespace}${url}`;
    let lo = 0;
    let hi = header.entryCount;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const e = await entryAt(mid);
      const here = `${e.namespace}${e.url}`;
      if (here === key) return e;
      if (here < key) lo = mid + 1;
      else hi = mid;
    }
    return null;
  }

  async function entryAt(index) {
    if (index < 0 || index >= header.entryCount) throw new ZimError("Entry is out of range.", "range");
    const pos = await urlPointer(index);
    let bytes = await readAt(pos, 512);
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const mime = v.getUint16(0, true);
    const namespace = String.fromCharCode(bytes[3]);
    const redirect = mime === 0xffff;
    const fixed = redirect ? 12 : 16;
    let url = cstr(bytes, fixed);
    let title = cstr(bytes, url.next);
    if (title.next > bytes.length) {
      bytes = await readAt(pos, 4096);
      url = cstr(bytes, fixed);
      title = cstr(bytes, url.next);
    }
    const entry = {
      index,
      namespace,
      url: url.text,
      title: title.text || url.text,
      redirect,
      mime: redirect ? null : mimes[mime] || null
    };
    if (redirect) entry.redirectIndex = v.getUint32(8, true);
    else {
      entry.cluster = v.getUint32(8, true);
      entry.blob = v.getUint32(12, true);
    }
    return entry;
  }

  async function clusterBounds(n) {
    const b = await readAt(header.clusterPtrPos + n * 8, 16);
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const start = u64(v, 0);
    const end = n + 1 < header.clusterCount ? u64(v, 8) : header.checksumPos || size;
    return { start, end };
  }

  async function cluster(n) {
    if (clusterCache.has(n)) return clusterCache.get(n);
    const { start, end } = await clusterBounds(n);
    const raw = await readAt(start, end - start);
    const info = raw[0];
    const kind = COMPRESSION[info & 0x0f] || "unknown";
    const extended = (info & 0x10) !== 0;
    let data;
    if (kind === "none") data = raw.subarray(1);
    else if (kind === "zstd") data = zstdDecompress(raw.subarray(1));
    else {
      throw new ZimError(
        kind === "xz"
          ? "This ZIM uses xz compression, which this build cannot open yet. Newer Kiwix files use zstd and do open."
          : `This ZIM uses ${kind} compression, which is not supported.`,
        `compression-${kind}`
      );
    }
    const result = { data, extended, kind };
    clusterCache.set(n, result);
    if (clusterCache.size > clusterCacheSize) clusterCache.delete(clusterCache.keys().next().value);
    return result;
  }

  async function blob(clusterNumber, blobNumber) {
    const { data, extended } = await cluster(clusterNumber);
    const width = extended ? 8 : 4;
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const read = (i) => (extended ? u64(v, i * width) : v.getUint32(i * width, true));
    const first = read(0);
    const count = first / width - 1;
    if (blobNumber >= count) throw new ZimError("Blob is out of range.", "range");
    return data.subarray(read(blobNumber), read(blobNumber + 1));
  }

  async function resolve(entry, depth = 0) {
    let current = entry;
    while (current.redirect && depth < 8) {
      current = await entryAt(current.redirectIndex);
      depth += 1;
    }
    return current;
  }

  async function content(entry) {
    const target = await resolve(entry);
    if (target.redirect) throw new ZimError("Too many redirects.", "redirect");
    return { entry: target, bytes: await blob(target.cluster, target.blob) };
  }

  // Lower bound over the title-ordered list: first entry whose namespace+title >= key.
  async function titleLowerBound(namespace, title) {
    const key = `${namespace}${title}`;
    let lo = 0;
    let hi = (await titleList()).count;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const e = await entryAt(await titleIndex(mid));
      if (`${e.namespace}${e.title}` < key) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const contentNamespaces = header.minor >= 1 ? ["C"] : ["A", "C"];

  async function findTitles(query, limit = 8) {
    const q = String(query || "").trim();
    if (!q) return [];
    const variants = [...new Set([q, q[0].toUpperCase() + q.slice(1), q.toLowerCase(), q.replace(/\b\w/g, (c) => c.toUpperCase())])];
    const found = new Map();
    for (const ns of contentNamespaces) {
      for (const variant of variants) {
        let at = await titleLowerBound(ns, variant);
        const count = (await titleList()).count;
        for (let k = 0; k < limit && at < count; k += 1, at += 1) {
          const e = await entryAt(await titleIndex(at));
          if (e.namespace !== ns || !e.title.toLowerCase().startsWith(variant.toLowerCase())) break;
          if (!found.has(e.index)) found.set(e.index, e);
        }
      }
    }
    return [...found.values()]
      .sort((a, b) => (a.title.toLowerCase() === q.toLowerCase() ? -1 : 0) - (b.title.toLowerCase() === q.toLowerCase() ? -1 : 0) || a.title.length - b.title.length)
      .slice(0, limit);
  }

  async function articleText(entry, maxChars = 20000) {
    const { entry: target, bytes } = await content(entry);
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const text = /html/i.test(target.mime || "") ? htmlToText(raw) : raw;
    return { title: target.title, url: target.url, mime: target.mime, text: text.slice(0, maxChars) };
  }

  async function metadata(name) {
    try {
      const entry = await findUrl("M", name);
      return entry ? new TextDecoder().decode((await content(entry)).bytes) : null;
    } catch {
      return null;
    }
  }

  return { header, mimes, entryAt, content, findUrl, findTitles, articleText, metadata, cluster };
}

// readAt for a whole file already in memory (tests and small files).
export function memoryReader(bytes) {
  return async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length));
}
