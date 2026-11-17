// Web and phone builds: the same field note files, bundled by Metro instead of read with fs.
export function loadFieldNotes() {
  return [
    require("../symbolic_books/medical/reference.json"),
    require("../symbolic_books/herbology/notes.json"),
    require("../symbolic_books/landscape/notes.json"),
    require("../symbolic_books/survival/camp.json")
  ];
}
