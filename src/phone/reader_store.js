// Who has the reader open: Ask ("open the Kybalion", "Open in reader at page 12"), the Library
// screen, and Me, Learned, Documents all open the same full-screen reader.
import { useEffect, useState } from "react";

let state = null; // { bookId, page } or { library: true }
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(state);
}

export function openReader(bookId, page = null) {
  state = { bookId, page, at: Date.now() };
  emit();
}

export function openLibrary() {
  state = { library: true, at: Date.now() };
  emit();
}

/** R13: the book the reader shows now, or null. */
export function readerBookId() {
  return state?.bookId || null;
}

export function closeReader() {
  state = null;
  emit();
}

export function useReaderState() {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => listeners.delete(setS);
  }, []);
  return s;
}
