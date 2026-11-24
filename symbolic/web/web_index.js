// Approved web notes join the meaning matcher one note at a time, after approval and off the hot path.
// The static field-note index is never rewritten. Each approved note gets its own int8 vector,
// kept inside the sealed web store, and questions are scored against those vectors only when the
// local notes had no answer. getMappedAction never imports this file.

export const DIMS = 384;

export function quantize(vector) {
  const out = new Int8Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) out[i] = Math.max(-127, Math.min(127, Math.round(vector[i] * 127)));
  return out;
}

function toB64(bytes) {
  const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (typeof Buffer !== "undefined") return Buffer.from(u8).toString("base64");
  let raw = "";
  for (const value of u8) raw += String.fromCharCode(value);
  return btoa(raw);
}

function fromB64(text) {
  if (typeof Buffer !== "undefined") {
    const b = Buffer.from(text, "base64");
    return new Int8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  }
  const raw = atob(text);
  const out = new Int8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = (raw.charCodeAt(i) << 24) >> 24;
  return out;
}

export function notesNeedingVectors(store, modelId) {
  const stale = store.indexedModel && store.indexedModel !== modelId;
  return store.notes.filter((note) => note.status === "approved" && (stale || !store.vectors[note.id]));
}

export function noteDocument(note) {
  return `${note.title}: ${note.text}`;
}

export function attachVectors(store, entries, modelId) {
  const vectors = { ...(store.indexedModel && store.indexedModel !== modelId ? {} : store.vectors) };
  for (const { id, vector } of entries) {
    if (vector?.length === DIMS && store.notes.some((note) => note.id === id && note.status === "approved")) vectors[id] = toB64(quantize(vector));
  }
  return { ...store, vectors, indexedModel: modelId };
}

/** Map of note id to cosine score for a normalized question vector. Only approved notes have vectors. */
export function scoreWebNotes(store, queryVector) {
  const scores = new Map();
  if (!queryVector || queryVector.length !== DIMS) return scores;
  for (const [id, text] of Object.entries(store.vectors || {})) {
    const row = fromB64(text);
    if (row.length !== DIMS) continue;
    let dot = 0;
    for (let i = 0; i < DIMS; i += 1) dot += row[i] * queryVector[i];
    scores.set(id, dot / 127);
  }
  return scores;
}
