// R8: BM25 over text chunks, for finding the passages of a large saved document (a 1500-page
// encyclopedia) or of several sources at once. Built lazily the first time a source is asked
// about, then cached for the session. Pure and offline; never on getMappedAction's path.

export const STOP = new Set(("a an the and or but if then than of in on at to for from by with as is are was were be been being "
  + "it its this that these those there their they them he she his her him we our you your i me my not no nor so too very can could "
  + "would should will shall may might must do does did done has have had having which who whom whose what when where why how all any "
  + "each few more most other some such only own same also into out up down over under again further once here both between through "
  + "during before after above below about against because until while upon unto thou thee thy ye hath one two themselves yourself yourselves itself himself herself ourselves aren isn wasn weren don doesn didn won wouldn couldn shouldn ve ll re").split(" "));

export function stem(word) {
  let w = String(word || "").toLowerCase();
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && /(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) w = w.slice(0, -1);
  return w;
}

export function terms(text) {
  const out = [];
  for (const raw of String(text || "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw) && raw.length < 3) continue;
    out.push(stem(raw));
  }
  return out;
}

/** chunks: [{ id, text, ... }] -> index. */
export function buildIndex(chunks) {
  const docs = [];
  const df = new Map();
  let total = 0;
  for (const chunk of chunks || []) {
    const tf = new Map();
    const ts = terms(chunk.text);
    for (const t of ts) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docs.push({ chunk, tf, len: ts.length });
    total += ts.length;
  }
  return { docs, df, n: docs.length, avg: docs.length ? total / docs.length : 0 };
}

export function idf(index, term) {
  const n = index.df.get(term) || 0;
  return Math.log(1 + (index.n - n + 0.5) / (n + 0.5));
}

/** query terms (strings, already stemmed via terms()) with optional weights -> top k [{ chunk, score, matched }]. */
export function search(index, query, { k = 10, weights = null, k1 = 1.4, b = 0.75 } = {}) {
  const q = [...new Set(query)].filter((t) => index.df.has(t));
  if (!q.length) return [];
  const out = [];
  for (const d of index.docs) {
    let score = 0;
    let matched = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      matched += 1;
      const w = weights?.get?.(t) ?? 1;
      score += w * idf(index, t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / (index.avg || 1))));
    }
    if (score > 0) out.push({ chunk: d.chunk, score, matched });
  }
  out.sort((a, c) => c.score - a.score || c.matched - a.matched);
  return out.slice(0, k);
}

const cache = new Map();

/** The cached index for one source (id + a version string that changes when its text changes). */
export function cachedIndex(key, version, makeChunks) {
  const hit = cache.get(key);
  if (hit && hit.version === version) return hit.index;
  const index = buildIndex(makeChunks());
  cache.set(key, { version, index });
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return index;
}
