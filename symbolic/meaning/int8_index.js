// int8 vector index with one float scale per row. Pure JavaScript, no filesystem.
// Dot product of a float query with row r is scale[r] * sum(q[i] * row[i]).

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i += 1) table[B64.charCodeAt(i)] = i;
  return table;
})();

export function bytesToBase64(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}${B64[(n >> 6) & 63]}=`;
  }
  return out;
}

export function base64ToBytes(text) {
  const clean = String(text || "").replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : 0;
    const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// vectors: array of Float32Array (already normalized). Returns { rows, dims, scales, data }.
export function quantize(vectors) {
  const rows = vectors.length;
  const dims = rows ? vectors[0].length : 0;
  const scales = new Float32Array(rows);
  const data = new Int8Array(rows * dims);
  for (let r = 0; r < rows; r += 1) {
    const vec = vectors[r];
    let max = 0;
    for (let i = 0; i < dims; i += 1) max = Math.max(max, Math.abs(vec[i]));
    const scale = max > 0 ? max / 127 : 1;
    scales[r] = scale;
    for (let i = 0; i < dims; i += 1) data[r * dims + i] = Math.round(vec[i] / scale);
  }
  return { rows, dims, scales, data };
}

// Serialized layout: [rows u32][dims u32][scales f32 * rows][data i8 * rows * dims], little endian.
export function packIndex(index) {
  const head = 8 + index.rows * 4;
  const bytes = new Uint8Array(head + index.data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, index.rows, true);
  view.setUint32(4, index.dims, true);
  for (let r = 0; r < index.rows; r += 1) view.setFloat32(8 + r * 4, index.scales[r], true);
  bytes.set(new Uint8Array(index.data.buffer, index.data.byteOffset, index.data.length), head);
  return bytes;
}

export function unpackIndex(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rows = view.getUint32(0, true);
  const dims = view.getUint32(4, true);
  const scales = new Float32Array(rows);
  for (let r = 0; r < rows; r += 1) scales[r] = view.getFloat32(8 + r * 4, true);
  const head = 8 + rows * 4;
  const data = new Int8Array(bytes.buffer, bytes.byteOffset + head, rows * dims);
  return { rows, dims, scales, data };
}

export function scoreAll(index, query, filter = null) {
  const { rows, dims, scales, data } = index;
  const out = new Float32Array(rows);
  for (let r = 0; r < rows; r += 1) {
    if (filter && !filter(r)) {
      out[r] = -2;
      continue;
    }
    let sum = 0;
    const base = r * dims;
    for (let i = 0; i < dims; i += 1) sum += query[i] * data[base + i];
    out[r] = sum * scales[r];
  }
  return out;
}

export function topK(scores, k) {
  const best = [];
  for (let r = 0; r < scores.length; r += 1) {
    const s = scores[r];
    if (s <= -2) continue;
    if (best.length < k) {
      best.push([r, s]);
      best.sort((a, b) => b[1] - a[1]);
    } else if (s > best[k - 1][1]) {
      best[k - 1] = [r, s];
      best.sort((a, b) => b[1] - a[1]);
    }
  }
  return best.map(([row, score]) => ({ row, score }));
}

export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}
