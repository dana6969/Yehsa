// Headword locations on disk. Glosses are read when a question asks for them.
// The full dictionary files are not parsed into a retained object.
import fs from "fs";
import path from "path";

const MEMORY = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "symbolic_memory");
const FILES = ["wordnet_raw.json", "dictionary_memory.json", "full_dictionary.json", "webster_raw.json"];

let locations = null;

function reader(fd) {
  const buf = Buffer.alloc(128 * 1024);
  let filePos = 0;
  let index = 0;
  let length = 0;
  return {
    next() {
      if (index >= length) {
        filePos += length;
        length = fs.readSync(fd, buf, 0, buf.length, filePos);
        index = 0;
        if (length <= 0) return null;
      }
      const at = filePos + index;
      const code = buf[index];
      index += 1;
      return { code, at };
    }
  };
}

function readString(next) {
  let raw = "";
  let contentStart = 0;
  let contentEnd = 0;
  let started = false;
  while (true) {
    const item = next();
    if (!item) return null;
    if (!started) {
      contentStart = item.at;
      contentEnd = item.at;
      started = true;
    }
    if (item.code === 0x22) return { raw, contentStart, contentEnd };
    if (item.code === 0x5c) {
      const escaped = next();
      if (!escaped) return null;
      raw += String.fromCharCode(item.code, escaped.code);
      contentEnd = escaped.at + 1;
      continue;
    }
    raw += String.fromCharCode(item.code);
    contentEnd = item.at + 1;
  }
}

function skipSpace(next) {
  let item = next();
  while (item && (item.code === 0x20 || item.code === 0x09 || item.code === 0x0a || item.code === 0x0d)) item = next();
  return item;
}

function readArray(next, startAt) {
  let depth = 1;
  let inString = false;
  let escape = false;
  let end = startAt;
  while (depth > 0) {
    const item = next();
    if (!item) return null;
    end = item.at + 1;
    if (inString) {
      if (escape) escape = false;
      else if (item.code === 0x5c) escape = true;
      else if (item.code === 0x22) inString = false;
      continue;
    }
    if (item.code === 0x22) inString = true;
    else if (item.code === 0x5b) depth += 1;
    else if (item.code === 0x5d) depth -= 1;
  }
  return end;
}

function indexFile(file, map) {
  const fd = fs.openSync(file, "r");
  try {
    const input = reader(fd);
    const next = () => input.next();
    while (true) {
      const item = next();
      if (!item) break;
      if (item.code !== 0x22) continue;
      const key = readString(next);
      if (!key) break;
      const colon = skipSpace(next);
      if (!colon || colon.code !== 0x3a) continue;
      const value = skipSpace(next);
      if (!value) break;
      const id = JSON.parse(`"${key.raw}"`).trim().toLowerCase();
      if (!id || map.has(id)) {
        if (value.code === 0x22) readString(next);
        else if (value.code === 0x5b) readArray(next, value.at);
        continue;
      }
      if (value.code === 0x22) {
        const text = readString(next);
        if (!text) break;
        map.set(id, { file, start: text.contentStart, end: text.contentEnd, array: false });
      } else if (value.code === 0x5b) {
        const end = readArray(next, value.at);
        if (end == null) break;
        map.set(id, { file, start: value.at, end, array: true });
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

function ensure() {
  if (locations) return locations;
  locations = new Map();
  for (const name of FILES) {
    const file = path.join(MEMORY, name);
    if (fs.existsSync(file)) indexFile(file, locations);
  }
  return locations;
}

function decode(loc) {
  const fd = fs.openSync(loc.file, "r");
  try {
    const size = loc.end - loc.start;
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, loc.start);
    const raw = buf.toString("utf8");
    const parsed = loc.array ? JSON.parse(raw) : JSON.parse(`"${raw}"`);
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string").join(" ").trim();
    return typeof parsed === "string" ? parsed.trim() : "";
  } finally {
    fs.closeSync(fd);
  }
}

export function lookupGloss(term) {
  const key = String(term || "").trim().toLowerCase();
  if (!key) return null;
  const loc = ensure().get(key);
  if (!loc) return null;
  return decode(loc) || null;
}

function visitFile(file, fn) {
  const fd = fs.openSync(file, "r");
  try {
    const input = reader(fd);
    const next = () => input.next();
    while (true) {
      const item = next();
      if (!item) break;
      if (item.code !== 0x22) continue;
      const key = readString(next);
      if (!key) break;
      const colon = skipSpace(next);
      if (!colon || colon.code !== 0x3a) continue;
      const value = skipSpace(next);
      if (!value) break;
      let text = "";
      if (value.code === 0x22) {
        const body = readString(next);
        if (!body) break;
        text = JSON.parse(`"${body.raw}"`).trim();
      } else if (value.code === 0x5b) {
        const end = readArray(next, value.at);
        if (end == null) break;
        const size = end - value.at;
        const buf = Buffer.alloc(size);
        fs.readSync(fd, buf, 0, size, value.at);
        const parsed = JSON.parse(buf.toString("utf8"));
        text = Array.isArray(parsed) ? parsed.filter((part) => typeof part === "string").join(" ").trim() : "";
      }
      const id = JSON.parse(`"${key.raw}"`).trim().toLowerCase();
      if (id && text) fn(id, text);
    }
  } finally {
    fs.closeSync(fd);
  }
}

export function forEachGloss(fn) {
  const seen = new Set();
  for (const name of FILES) {
    const file = path.join(MEMORY, name);
    if (!fs.existsSync(file)) continue;
    visitFile(file, (key, text) => {
      if (seen.has(key)) return;
      seen.add(key);
      fn(key, text);
    });
  }
}
