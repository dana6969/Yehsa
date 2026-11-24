// What a downloaded file really is, from its first bytes, not from what the site claims.
// Only four kinds are ever read: PDF, EPUB, plain text and a web page. Programs, installers,
// scripts, archives and pictures are refused, whatever their name or content type says.

const BLOCKED_EXT = /\.(?:apk|aab|xapk|exe|msi|dll|so|dex|jar|class|bat|cmd|com|scr|ps1|sh|bash|js|mjs|vbs|py|pl|rb|php|bin|elf|dmg|pkg|deb|rpm|iso|img|zip|rar|7z|gz|tgz|bz2|xz|tar|docm|xlsm|pptm|swf|jpe?g|png|gif|webp|mp[34]|mov|avi|mkv)$/i;
const BLOCKED_TYPE = /^(?:application\/(?:vnd\.android\.package-archive|x-msdownload|x-msdos-program|x-executable|x-elf|x-sharedlib|x-mach-binary|java-archive|x-sh|x-shellscript|javascript|x-javascript|x-dosexec|zip|x-zip-compressed|x-rar-compressed|x-7z-compressed|gzip|x-gzip|x-tar)|text\/(?:javascript|x-shellscript|x-python)|image\/|video\/|audio\/)/i;

/** A link's file kind from its address: "pdf" | "epub" | "text" | "page" | null (refused). */
export function kindFromUrl(url) {
  let path;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  if (/\.pdf$/i.test(path)) return "pdf";
  if (/\.epub$/i.test(path)) return "epub";
  if (/\.txt$/i.test(path)) return "text";
  if (BLOCKED_EXT.test(path)) return null;
  if (/\.(?:docx?|xlsx?|pptx?|odt|rtf|csv)$/i.test(path)) return null; // office files: not read (yet)
  return "page";
}

export function blockedType(type) {
  return BLOCKED_TYPE.test(String(type || "").trim());
}

function startsWith(bytes, text, at = 0) {
  if (bytes.length < at + text.length) return false;
  for (let i = 0; i < text.length; i += 1) if (bytes[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

/**
 * bytes: Uint8Array, type: the content-type header, url: where it came from.
 * Returns { ok: true, format: "pdf"|"epub"|"text"|"html" } or { ok: false, reason }.
 */
export function sniffDocument(bytes, type = "", url = "") {
  const head = bytes.subarray(0, 1024);
  if (blockedType(type)) return { ok: false, reason: "That link is a program, archive or picture, not a document. I don't download those." };
  if (startsWith(head, "MZ") || startsWith(head, "\x7fELF") || startsWith(head, "dex\n") || startsWith(head, "#!")
    || startsWith(head, "\xca\xfe\xba\xbe") || startsWith(head, "\xcf\xfa\xed\xfe") || startsWith(head, "\xfe\xed\xfa")) {
    return { ok: false, reason: "That file is a program, not a document. It was refused and nothing was kept." };
  }
  let pdfAt = -1;
  for (let i = 0; i < Math.min(head.length - 4, 1019); i += 1) {
    if (startsWith(head, "%PDF-", i)) {
      pdfAt = i;
      break;
    }
  }
  if (pdfAt >= 0) return { ok: true, format: "pdf" };
  if (startsWith(head, "PK\x03\x04")) {
    // An EPUB is a zip whose first entry is "mimetype" holding application/epub+zip. Any other zip is refused.
    if (startsWith(head, "mimetype", 30) && startsWith(head, "application/epub+zip", 38)) return { ok: true, format: "epub" };
    return { ok: false, reason: "That file is an archive, not a document. I don't open those." };
  }
  // Text: no NUL bytes in the first KB, and mostly printable.
  let bad = 0;
  for (const b of head) {
    if (b === 0) return { ok: false, reason: "That file isn't a document I can read." };
    if (b < 9 || (b > 13 && b < 32)) bad += 1;
  }
  if (head.length && bad / head.length > 0.05) return { ok: false, reason: "That file isn't a document I can read." };
  const sample = new TextDecoder("utf-8").decode(head).toLowerCase();
  if (/^\s*(?:<!doctype html|<html|<head|<body|<\?xml[^>]*>\s*<html)/.test(sample) || /^text\/html|xhtml/i.test(type) || /<(?:p|div|h1|title)\b/.test(sample)) return { ok: true, format: "html" };
  if (/^text\/plain/i.test(type) || /\.txt$/i.test(url) || sample.trim().length) return { ok: true, format: "text" };
  return { ok: false, reason: "That file is empty." };
}
