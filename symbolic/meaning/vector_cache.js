// Small synchronous cache of question vectors. An async step (Node or phone) fills it before
// the synchronous ask path reads it, so ask() stays synchronous and never waits on the model.

const LIMIT = 512;
const cache = new Map();

export function cacheKey(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function putVector(text, vec) {
  const key = cacheKey(text);
  if (!key || !vec) return;
  if (cache.has(key)) cache.delete(key);
  cache.set(key, vec);
  while (cache.size > LIMIT) cache.delete(cache.keys().next().value);
}

export function getVector(text) {
  const key = cacheKey(text);
  return key ? cache.get(key) || null : null;
}

export function hasVector(text) {
  return cache.has(cacheKey(text));
}

export function clearVectors() {
  cache.clear();
}

/** R13: drop cached vectors whose key starts with prefix ("p:" = passages), e.g. after a book is removed. */
export function dropVectors(prefix = "") {
  const want = String(prefix || "");
  for (const key of [...cache.keys()]) if (key.startsWith(want)) cache.delete(key);
}
