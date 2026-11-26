// The reader remembers your place in each book and your text size, on this phone only.
// Pure: the caller passes the storage (AsyncStorage on the phone).
export const READER_KEY = "yehsa.reader.v1";
export const TEXT_SIZES = [14, 16, 18, 21, 24, 28];
export const DEFAULT_SIZE = 18;
const MAX_BOOKS = 200;

export function emptyReaderPrefs() {
  return { size: DEFAULT_SIZE, places: {} };
}

export function readReaderPrefs(raw) {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return emptyReaderPrefs();
    const size = TEXT_SIZES.includes(v.size) ? v.size : DEFAULT_SIZE;
    const places = {};
    for (const [id, p] of Object.entries(v.places || {})) {
      if (typeof id === "string" && Number.isInteger(p?.page) && p.page >= 1) places[id] = { page: p.page, at: Number(p.at) || 0 };
    }
    return { size, places };
  } catch {
    return emptyReaderPrefs();
  }
}

export function withPlace(prefs, bookId, page, now = Date.now()) {
  const places = { ...prefs.places, [bookId]: { page, at: now } };
  const ids = Object.keys(places);
  if (ids.length > MAX_BOOKS) {
    ids.sort((a, b) => places[a].at - places[b].at).slice(0, ids.length - MAX_BOOKS).forEach((id) => delete places[id]);
  }
  return { ...prefs, places };
}

/** R13: forget the saved page for a removed book. */
export function withoutPlace(prefs, bookId) {
  if (!prefs?.places || !(bookId in prefs.places)) return prefs;
  const places = { ...prefs.places };
  delete places[bookId];
  return { ...prefs, places };
}

export function withSize(prefs, step) {
  const i = Math.max(0, TEXT_SIZES.indexOf(prefs.size));
  const next = TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, i + step))];
  return { ...prefs, size: next };
}

/** Pages containing the words, in order from `from` (1-based), wrapping. Case-insensitive. */
export function findPages(pages, query, from = 1) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = [];
  for (let k = 0; k < pages.length; k += 1) {
    const i = (from - 1 + k) % pages.length;
    if (String(pages[i] || "").toLowerCase().includes(q)) hits.push(i + 1);
  }
  return hits;
}

/** The chapter a page is in (index into chapters), or -1. */
export function chapterAt(chapters, page) {
  let at = -1;
  (chapters || []).forEach((c, i) => {
    if (c.page <= page) at = i;
  });
  return at;
}

export async function loadReaderPrefs(storage) {
  try {
    return readReaderPrefs(await storage.getItem(READER_KEY));
  } catch {
    return emptyReaderPrefs();
  }
}

export async function saveReaderPrefs(storage, prefs) {
  try {
    await storage.setItem(READER_KEY, JSON.stringify(prefs));
  } catch {
    // Not saved this time.
  }
}
