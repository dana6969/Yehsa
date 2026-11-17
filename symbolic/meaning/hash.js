// FNV-1a 32-bit hash, used to check that the shipped meaning index matches the notes.
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  const value = String(text || "");
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
