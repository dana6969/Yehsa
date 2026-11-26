// Node and Termux: read the field note files from the working directory.
import fs from "fs";
import path from "path";

export const FIELD_NOTE_FILES = [
  "symbolic_books/medical/reference.json",
  "symbolic_books/herbology/notes.json",
  "symbolic_books/landscape/notes.json",
  "symbolic_books/survival/camp.json"
];

export function loadFieldNotes() {
  const out = [];
  for (const rel of FIELD_NOTE_FILES) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")));
    } catch {
      // A missing note file just leaves the vocab smaller.
    }
  }
  return out;
}
