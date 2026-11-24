// Reads Yehsa's compact offline road graph (.yrg, version 2), built by tools/routing/build_graph.py
// from OpenStreetMap data (ODbL). Pure JS over a Uint8Array, so it runs in Node tests and on the phone.
//
// Layout: a 64-byte header, then four varint sections: nodes (zigzag deltas, 1e-6 degrees, sorted
// by grid cell), cell counts, edges (sorted by from node; shape points as 1e-5 degree deltas), names.

export const CLASS_NAMES = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "service", "track", "path"];
export const F_ONEWAY_FWD = 1;
export const F_ONEWAY_REV = 2;
export const F_LINK = 4;
export const F_ROUNDABOUT = 8;
export const F_NO_CAR = 16;
export const F_NO_FOOT = 32;

function reader(bytes, start) {
  let pos = start;
  return {
    uv() {
      let x = 0;
      let shift = 0;
      let b;
      do {
        b = bytes[pos++];
        x += (b & 0x7f) * 2 ** shift;
        shift += 7;
      } while (b & 0x80);
      return x;
    },
    zz() {
      const x = this.uv();
      return x % 2 ? -(x + 1) / 2 : x / 2;
    },
    get pos() {
      return pos;
    }
  };
}

const utf8 = typeof TextDecoder === "function" ? new TextDecoder("utf-8") : null;
function decodeUtf8(bytes, start, end) {
  if (utf8) return utf8.decode(bytes.subarray(start, end));
  let out = "";
  let i = start;
  while (i < end) {
    const c = bytes[i++];
    if (c < 0x80) out += String.fromCharCode(c);
    else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      const cp = ((c & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

export function readHeader(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 64) throw new Error("Not a road graph");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== "YRG2") throw new Error("Not a Yehsa road graph");
  const u32 = (o) => view.getUint32(o, true);
  const i32 = (o) => view.getInt32(o, true);
  return {
    version: view.getUint16(4, true),
    nodes: u32(8),
    edges: u32(12),
    shape: u32(16),
    names: u32(20),
    south: i32(24) / 1e6,
    west: i32(28) / 1e6,
    north: i32(32) / 1e6,
    east: i32(36) / 1e6,
    cell: u32(40) / 1e6,
    cellsW: u32(44),
    cellsH: u32(48),
    sections: [u32(52), u32(56), u32(60), u32(64)]
  };
}

/** Decode a .yrg file into typed arrays plus a both-way adjacency list. */
export function decodeGraph(bytes, { id = "" } = {}) {
  const head = readHeader(bytes);
  const N = head.nodes;
  const E = head.edges;
  const lat = new Float64Array(N);
  const lon = new Float64Array(N);
  let r = reader(bytes, 68);
  let pl = 0;
  let po = 0;
  for (let i = 0; i < N; i++) {
    pl += r.zz();
    po += r.zz();
    lat[i] = pl / 1e6;
    lon[i] = po / 1e6;
  }
  const cells = head.cellsW * head.cellsH;
  const cellStart = new Uint32Array(cells + 1);
  r = reader(bytes, 68 + head.sections[0]);
  for (let c = 0; c < cells; c++) cellStart[c + 1] = cellStart[c] + r.uv();
  const from = new Uint32Array(E);
  const to = new Uint32Array(E);
  const len = new Float32Array(E);
  const name = new Uint32Array(E);
  const kind = new Uint16Array(E);
  const shapeStart = new Uint32Array(E + 1);
  const shapeLat = new Float32Array(head.shape);
  const shapeLon = new Float32Array(head.shape);
  r = reader(bytes, 68 + head.sections[0] + head.sections[1]);
  let f = 0;
  let g = 0;
  for (let k = 0; k < E; k++) {
    f += r.uv();
    from[k] = f;
    to[k] = f + r.zz();
    len[k] = r.uv();
    name[k] = r.uv();
    kind[k] = r.uv();
    const count = r.uv();
    let la = Math.round(lat[f] * 1e5);
    let lo = Math.round(lon[f] * 1e5);
    for (let j = 0; j < count; j++) {
      la += r.zz();
      lo += r.zz();
      shapeLat[g] = la / 1e5;
      shapeLon[g] = lo / 1e5;
      g++;
    }
    shapeStart[k + 1] = g;
  }
  const names = new Array(head.names);
  let pos = 68 + head.sections[0] + head.sections[1] + head.sections[2];
  for (let i = 0; i < head.names; i++) {
    const rr = reader(bytes, pos);
    const n = rr.uv();
    pos = rr.pos;
    names[i] = decodeUtf8(bytes, pos, pos + n);
    pos += n;
  }
  // Both-way adjacency (CSR): every edge is listed under both of its ends.
  const deg = new Uint32Array(N + 1);
  for (let k = 0; k < E; k++) {
    deg[from[k] + 1]++;
    if (to[k] !== from[k]) deg[to[k] + 1]++;
  }
  for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
  const adj = new Uint32Array(deg[N]);
  const fill = deg.slice(0, N);
  for (let k = 0; k < E; k++) {
    adj[fill[from[k]]++] = k;
    if (to[k] !== from[k]) adj[fill[to[k]]++] = k;
  }
  return { id, head, N, E, lat, lon, cellStart, from, to, len, name, kind, shapeStart, shapeLat, shapeLon, names, adjStart: deg, adj };
}

export const edgeClass = (graph, k) => graph.kind[k] & 15;
export const edgeFlags = (graph, k) => graph.kind[k] >> 4;

/** Points of edge k from its from-node to its to-node (or reversed). */
export function edgePoints(graph, k, reverse = false) {
  const pts = [{ latitude: graph.lat[graph.from[k]], longitude: graph.lon[graph.from[k]] }];
  for (let j = graph.shapeStart[k]; j < graph.shapeStart[k + 1]; j++) pts.push({ latitude: graph.shapeLat[j], longitude: graph.shapeLon[j] });
  pts.push({ latitude: graph.lat[graph.to[k]], longitude: graph.lon[graph.to[k]] });
  return reverse ? pts.reverse() : pts;
}
