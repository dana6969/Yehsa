// Node-only list of the approved field notes the meaning index covers. The book chunks
// (war history, Kybalion prose) and scripture are not field notes and are left out here.
import { searchBooks } from "../book_index.js";
import { loadBookIndex } from "../book_index.js";

export const FIELD_SOURCE = /^symbolic_(?:books\/(?:medical|herbology|landscape|survival)\/|memory\/math\/)/;

export function fieldNotes() {
  searchBooks("warm", 1);
  const index = loadBookIndex();
  const seen = new Set();
  const out = [];
  const add = (passage) => {
    if (!passage?.symbol || seen.has(passage.symbol) || !FIELD_SOURCE.test(passage.source || "")) return;
    seen.add(passage.symbol);
    out.push({ symbol: passage.symbol, source: passage.source, text: String(passage.context).replace(/\s+/g, " ").trim() });
  };
  for (const passage of index.passages || []) add(passage);
  for (const passage of liveNotes()) add(passage);
  return out;
}

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function liveNotes() {
  const out = [];
  for (const rel of ["symbolic_books/medical/reference.json", "symbolic_books/herbology/notes.json", "symbolic_books/landscape/notes.json", "symbolic_books/survival/camp.json"]) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    for (const entry of JSON.parse(fs.readFileSync(full, "utf8"))) {
      if (entry?.symbol && entry?.context) out.push({ symbol: entry.symbol, source: rel, context: entry.context });
    }
  }
  return out;
}
