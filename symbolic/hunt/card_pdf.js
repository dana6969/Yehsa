// A printable family card as a plain PDF, built here with no native code. Letter size, Helvetica,
// the card's fields with their labels, and any saved photos (JPEG, embedded as they are).
// It is made on the phone from what is in the card and goes nowhere until the person shares or prints it.

import { FAMILY_FIELDS } from "./kit.js";

const W = 612;
const H = 792;
const MARGIN = 54;

// Helvetica advance widths, characters 32 to 126, in 1/1000 em.
const WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

export function textWidth(text, size) {
  let units = 0;
  for (const ch of String(text)) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? WIDTHS[code - 32] : 556;
  }
  return (units * size) / 1000;
}

// Keeps what a base Helvetica page can show. Anything else becomes a question mark rather than breaking the file.
export function pdfSafe(text) {
  return String(text ?? "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\n\x20-\x7e]/g, "?");
}

export function wrapLine(text, size, maxWidth) {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size) <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

const escapeText = (text) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export function base64ToBytes(b64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(b64 || "").replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? chars.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? chars.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.slice(0, o);
}

// Width, height and colour components from a JPEG's start-of-frame marker. Null for anything else.
export function jpegInfo(bytes) {
  if (!bytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue; }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if ((marker >= 0xc0 && marker <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], components: bytes[i + 9] };
    }
    i += 2 + length;
  }
  return null;
}

function ascii(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/**
 * card: { fields, photos: ["data:image/jpeg;base64,..."] }. Returns { bytes, pages, photos } where
 * photos is how many were embedded. Empty cards return null.
 */
export function familyCardPdf(card, { when = new Date() } = {}) {
  const filled = FAMILY_FIELDS.filter((field) => String(card?.fields?.[field.id] || "").trim());
  if (filled.length === 0) return null;

  const images = [];
  for (const uri of card.photos || []) {
    const match = /^data:image\/jpeg;base64,(.+)$/.exec(String(uri));
    if (!match) continue;
    const bytes = base64ToBytes(match[1]);
    const info = jpegInfo(bytes);
    if (info && [1, 3].includes(info.components) && info.width > 0 && info.height > 0) images.push({ bytes, ...info });
    if (images.length >= 6) break;
  }

  // Lay the content out into pages of drawing operations.
  const pages = [];
  let ops = [];
  let y = H - MARGIN;
  const newPage = () => { pages.push({ ops, images: new Set() }); ops = []; y = H - MARGIN; };
  const text = (font, size, x, baseline, value) => ops.push(`BT /${font} ${size} Tf ${x.toFixed(1)} ${baseline.toFixed(1)} Td (${escapeText(pdfSafe(value))}) Tj ET`);
  const room = (needed) => { if (y - needed < MARGIN + 20) newPage(); };

  text("F2", 20, MARGIN, y - 18, "Family emergency card");
  y -= 30;
  text("F1", 10, MARGIN, y - 8, `Made with Yehsa on ${when.toISOString().slice(0, 10)}. Keep it somewhere safe and dry. Check it twice a year.`);
  y -= 26;
  ops.push(`0.6 w ${MARGIN} ${y} m ${W - MARGIN} ${y} l S`);
  y -= 18;

  for (const field of filled) {
    const body = String(card.fields[field.id]).trim().split("\n").flatMap((line) => wrapLine(line, 11, W - MARGIN * 2));
    room(14 + 14 * Math.min(body.length, 3));
    text("F2", 10, MARGIN, y - 10, field.label.toUpperCase());
    y -= 16;
    for (const line of body) {
      room(14);
      text("F1", 11, MARGIN, y - 11, line);
      y -= 14;
    }
    y -= 8;
  }

  const embedded = [];
  if (images.length) {
    const size = 120;
    const perRow = Math.floor((W - MARGIN * 2 + 10) / (size + 10));
    room(size + 30);
    text("F2", 10, MARGIN, y - 10, "PHOTOS");
    y -= 18;
    let col = 0;
    images.forEach((image, index) => {
      if (col === perRow) { col = 0; y -= size + 10; room(size + 10); }
      const scale = Math.min(size / image.width, size / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      const x = MARGIN + col * (size + 10);
      ops.push(`q ${w.toFixed(1)} 0 0 ${h.toFixed(1)} ${x.toFixed(1)} ${(y - h).toFixed(1)} cm /Im${index} Do Q`);
      embedded.push({ index, page: pages.length }); // zero-based: the page being filled
      col += 1;
    });
    y -= size + 10;
  }
  pages.push({ ops, images: new Set() });
  for (const entry of embedded) pages[entry.page].images.add(entry.index);

  // Objects: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then images, then per page content and page.
  const objects = [];
  const add = (parts) => { objects.push(parts); return objects.length; };
  add(ascii("<< /Type /Catalog /Pages 2 0 R >>"));
  add(null);
  add(ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  add(ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  const imageIds = images.map((image) => add(concat([
    ascii(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /${image.components === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`),
    image.bytes,
    ascii("\nendstream")
  ])));
  const pageIds = [];
  for (const page of pages) {
    const stream = ascii(page.ops.join("\n"));
    const contentId = add(concat([ascii(`<< /Length ${stream.length} >>\nstream\n`), stream, ascii("\nendstream")]));
    const xobjects = [...page.images].map((index) => `/Im${index} ${imageIds[index]} 0 R`).join(" ");
    const pageId = add(ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ""} >> /Contents ${contentId} 0 R >>`));
    pageIds.push(pageId);
  }
  objects[1] = ascii(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);

  const chunks = [ascii("%PDF-1.4\n")];
  const offsets = [];
  let length = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const piece = concat([ascii(`${index + 1} 0 obj\n`), body, ascii("\nendobj\n")]);
    chunks.push(piece);
    length += piece.length;
  });
  const xrefAt = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  chunks.push(ascii(xref));
  return { bytes: concat(chunks), pages: pages.length, photos: images.length };
}

export function bytesToBase64(bytes) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[c & 63] : "=";
  }
  return out;
}
