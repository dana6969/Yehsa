// Plain text out of a PDF, on the phone, in pure JavaScript (Hermes-safe: no workers, no eval,
// no canvas, no native code). Inflate comes from fflate, which the app already ships.
// It reads: classic and compressed object streams, Flate/ASCIIHex/ASCII85 filters, the page tree
// with inherited resources, fonts with ToUnicode maps, simple encodings and Differences, Type0
// (two-byte) fonts, and form XObjects. It positions words from font widths so lines and spaces come
// out readable. Pictures are skipped. Locked (encrypted) PDFs are reported, not guessed at.
// Nothing in a PDF is ever run: no JavaScript, no actions, no links are followed. Text is data.

import { unzlibSync, inflateSync } from "fflate";

export const PDF_LIMITS = { maxPages: 1500, maxChars: 3000000, maxObjects: 400000, maxStreamBytes: 40 * 1024 * 1024 };

// ---------- bytes and tokens ----------

function latin1(bytes, start = 0, end = bytes.length) {
  let out = "";
  const step = 8192;
  for (let i = start; i < end; i += step) out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(end, i + step)));
  return out;
}

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

class Ref {
  constructor(num, gen) {
    this.num = num;
    this.gen = gen;
  }
}
class Name {
  constructor(name) {
    this.name = name;
  }
}
class Op {
  constructor(op) {
    this.op = op;
  }
}

// A small lexer over a byte array. Strings come back as byte strings (one char per byte).
class Lexer {
  constructor(bytes, pos = 0, end = bytes.length) {
    this.b = bytes;
    this.p = pos;
    this.end = end;
  }
  skipWs() {
    const b = this.b;
    for (;;) {
      while (this.p < this.end && WS.has(b[this.p])) this.p += 1;
      if (this.p < this.end && b[this.p] === 37) {
        while (this.p < this.end && b[this.p] !== 10 && b[this.p] !== 13) this.p += 1;
        continue;
      }
      return;
    }
  }
  token() {
    this.skipWs();
    const b = this.b;
    if (this.p >= this.end) return undefined;
    const c = b[this.p];
    if (c === 47) {
      // Name
      let s = "";
      this.p += 1;
      while (this.p < this.end && !WS.has(b[this.p]) && !DELIM.has(b[this.p])) {
        if (b[this.p] === 35 && this.p + 2 < this.end) {
          s += String.fromCharCode(parseInt(String.fromCharCode(b[this.p + 1], b[this.p + 2]), 16) || 0);
          this.p += 3;
        } else {
          s += String.fromCharCode(b[this.p]);
          this.p += 1;
        }
      }
      return new Name(s);
    }
    if (c === 40) return { str: this.literal() };
    if (c === 60) {
      if (b[this.p + 1] === 60) {
        this.p += 2;
        return "<<";
      }
      this.p += 1;
      let hex = "";
      while (this.p < this.end && b[this.p] !== 62) {
        const ch = b[this.p];
        if (!WS.has(ch)) hex += String.fromCharCode(ch);
        this.p += 1;
      }
      this.p += 1;
      if (hex.length % 2) hex += "0";
      let s = "";
      for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) || 0);
      return { str: s };
    }
    if (c === 62 && b[this.p + 1] === 62) {
      this.p += 2;
      return ">>";
    }
    if (c === 91 || c === 93 || c === 123 || c === 125) {
      this.p += 1;
      return String.fromCharCode(c);
    }
    let s = "";
    while (this.p < this.end && !WS.has(b[this.p]) && !DELIM.has(b[this.p])) {
      s += String.fromCharCode(b[this.p]);
      this.p += 1;
    }
    if (s === "") {
      this.p += 1;
      return this.token();
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return Number(s);
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null") return null;
    return new Op(s);
  }
  literal() {
    const b = this.b;
    this.p += 1;
    let depth = 1;
    let s = "";
    while (this.p < this.end) {
      const c = b[this.p];
      this.p += 1;
      if (c === 92) {
        const n = b[this.p];
        this.p += 1;
        if (n === 110) s += "\n";
        else if (n === 114) s += "\r";
        else if (n === 116) s += "\t";
        else if (n === 98) s += "\b";
        else if (n === 102) s += "\f";
        else if (n === 13) {
          if (b[this.p] === 10) this.p += 1;
        } else if (n === 10) {
          // line continuation
        } else if (n >= 48 && n <= 55) {
          let oct = String.fromCharCode(n);
          for (let k = 0; k < 2 && b[this.p] >= 48 && b[this.p] <= 55; k += 1) {
            oct += String.fromCharCode(b[this.p]);
            this.p += 1;
          }
          s += String.fromCharCode(parseInt(oct, 8) & 255);
        } else s += String.fromCharCode(n);
        continue;
      }
      if (c === 40) depth += 1;
      if (c === 41) {
        depth -= 1;
        if (depth === 0) break;
      }
      s += String.fromCharCode(c);
    }
    return s;
  }
  // A full value: dicts and arrays nested, "n g R" folded into Ref.
  value(first) {
    const t = first === undefined ? this.token() : first;
    if (t === "<<") {
      const dict = {};
      for (;;) {
        const k = this.token();
        if (k === ">>" || k === undefined) return dict;
        if (!(k instanceof Name)) continue;
        dict[k.name] = this.value();
      }
    }
    if (t === "[") {
      const arr = [];
      for (;;) {
        const k = this.token();
        if (k === "]" || k === undefined) return arr;
        arr.push(this.value(k));
      }
    }
    if (typeof t === "number" && Number.isInteger(t)) {
      const save = this.p;
      const g = this.token();
      if (typeof g === "number" && Number.isInteger(g)) {
        const save2 = this.p;
        const r = this.token();
        if (r instanceof Op && r.op === "R") return new Ref(t, g);
        this.p = save2;
      }
      this.p = save;
    }
    return t;
  }
}

// ---------- filters ----------

function flate(data) {
  try {
    return unzlibSync(data);
  } catch {
    try {
      return inflateSync(data.subarray(2));
    } catch {
      // Damaged stream: inflate what we can, byte-by-byte truncation fallback.
      for (let cut = data.length - 1; cut > data.length - 64 && cut > 2; cut -= 1) {
        try {
          return inflateSync(data.subarray(2, cut));
        } catch {
          // keep trying
        }
      }
      return new Uint8Array(0);
    }
  }
}

function asciiHex(data) {
  const s = latin1(data).replace(/[^0-9a-fA-F>]/g, "");
  const hex = s.split(">")[0];
  const out = new Uint8Array(Math.ceil(hex.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt((hex.slice(i * 2, i * 2 + 2) + "0").slice(0, 2), 16) || 0;
  return out;
}

function ascii85(data) {
  const s = latin1(data).replace(/\s+/g, "").replace(/^<~/, "").split("~>")[0];
  const out = [];
  let group = [];
  for (const ch of s) {
    if (ch === "z" && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(ch.charCodeAt(0) - 33);
    if (group.length === 5) {
      let v = 0;
      for (const d of group) v = v * 85 + d;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group = [];
    }
  }
  if (group.length) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const d of group) v = v * 85 + d;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, n - 1));
  }
  return Uint8Array.from(out);
}

function lzw(data) {
  const out = [];
  let dict = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < 256; i += 1) dict.push([i]);
    dict.push(null, null);
  };
  reset();
  let bits = 9;
  let buf = 0;
  let nbits = 0;
  let prev = null;
  for (let i = 0; i < data.length; i += 1) {
    buf = (buf << 8) | data[i];
    nbits += 8;
    while (nbits >= bits) {
      const code = (buf >>> (nbits - bits)) & ((1 << bits) - 1);
      nbits -= bits;
      if (code === 256) {
        reset();
        bits = 9;
        prev = null;
        continue;
      }
      if (code === 257) return Uint8Array.from(out);
      let entry;
      if (code < dict.length && dict[code]) entry = dict[code];
      else if (prev) entry = [...prev, prev[0]];
      else return Uint8Array.from(out);
      for (const v of entry) out.push(v);
      if (prev) dict.push([...prev, entry[0]]);
      prev = entry;
      if (dict.length + 1 >= 1 << bits && bits < 12) bits += 1;
    }
    buf &= (1 << nbits) - 1;
  }
  return Uint8Array.from(out);
}

function pngPredictor(data, columns, colors = 1, bpc = 8) {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const row = Math.ceil((columns * colors * bpc) / 8);
  const rows = Math.floor(data.length / (row + 1));
  const out = new Uint8Array(rows * row);
  let prev = new Uint8Array(row);
  for (let r = 0; r < rows; r += 1) {
    const type = data[r * (row + 1)];
    const line = data.subarray(r * (row + 1) + 1, (r + 1) * (row + 1));
    const cur = new Uint8Array(row);
    for (let i = 0; i < row; i += 1) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (type === 1) v += a;
      else if (type === 2) v += b;
      else if (type === 3) v += (a + b) >> 1;
      else if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    out.set(cur, r * row);
    prev = cur;
  }
  return out;
}

// ---------- the document ----------

export class PdfDoc {
  constructor(bytes, limits = {}) {
    this.bytes = bytes;
    this.limits = { ...PDF_LIMITS, ...limits };
    this.offsets = new Map(); // num -> byte offset of "num gen obj"
    this.inStream = new Map(); // num -> [objstm num, index]
    this.cache = new Map();
    this.trailer = {};
    this.scan();
  }

  scan() {
    const b = this.bytes;
    const n = b.length;
    // Find every "N G obj". Later copies win (incremental updates).
    for (let i = 0; i < n - 4; i += 1) {
      if (b[i] !== 111 || b[i + 1] !== 98 || b[i + 2] !== 106) continue; // "obj"
      if (i + 3 < n && !WS.has(b[i + 3]) && !DELIM.has(b[i + 3])) continue;
      let j = i - 1;
      while (j >= 0 && WS.has(b[j])) j -= 1;
      let g = j;
      while (j >= 0 && b[j] >= 48 && b[j] <= 57) j -= 1;
      if (j === g) continue;
      const gen = Number(latin1(b, j + 1, g + 1));
      while (j >= 0 && WS.has(b[j])) j -= 1;
      const e = j;
      while (j >= 0 && b[j] >= 48 && b[j] <= 57) j -= 1;
      if (j === e) continue;
      if (j >= 0 && !WS.has(b[j]) && !DELIM.has(b[j])) continue;
      const num = Number(latin1(b, j + 1, e + 1));
      if (!Number.isFinite(num) || gen > 65535) continue;
      this.offsets.set(num, { at: i + 3, gen });
      if (this.offsets.size > this.limits.maxObjects) break;
      // Skip over stream data quickly.
      i += 3;
    }
    // Trailer(s): classic "trailer << >>" and xref streams (/Type /XRef) both carry Root/Encrypt/Info.
    const text = latin1(b, Math.max(0, n - 4096));
    const tpos = text.lastIndexOf("trailer");
    if (tpos >= 0) {
      const lex = new Lexer(b, Math.max(0, n - 4096) + tpos + 7);
      const t = lex.value();
      if (t && typeof t === "object") this.trailer = t;
    }
    for (const [num] of this.offsets) {
      if (this.trailer.Root) break;
      const obj = this.get(num);
      if (obj?.dict?.Type?.name === "XRef") this.trailer = { ...obj.dict, ...this.trailer };
    }
    // Compressed objects: index every object stream.
    for (const [num] of this.offsets) {
      const obj = this.get(num);
      if (obj?.dict?.Type?.name !== "ObjStm") continue;
      const count = Number(this.resolve(obj.dict.N)) || 0;
      for (let k = 0; k < count; k += 1) {
        // registered lazily below
      }
      this.indexObjStm(num, obj);
    }
    if (!this.trailer.Root) {
      for (const num of [...this.offsets.keys(), ...this.inStream.keys()]) {
        const v = this.get(num);
        if (v && !v.stream && v.Type?.name === "Catalog") {
          this.trailer.Root = new Ref(num, 0);
          break;
        }
      }
    }
  }

  indexObjStm(num, obj) {
    const data = this.streamBytes(obj);
    const first = Number(this.resolve(obj.dict.First)) || 0;
    const count = Number(this.resolve(obj.dict.N)) || 0;
    const lex = new Lexer(data, 0, Math.min(first, data.length));
    const entries = [];
    for (let k = 0; k < count; k += 1) {
      const on = lex.token();
      const off = lex.token();
      if (typeof on !== "number" || typeof off !== "number") break;
      entries.push([on, off]);
    }
    for (const [on, off] of entries) {
      if (this.offsets.has(on) && !this.inStream.has(on)) {
        // A classic object of the same number written later wins only if it is after this stream.
        if (this.offsets.get(on).at > this.offsets.get(num).at) continue;
      }
      this.inStream.set(on, { data, at: first + off });
      this.offsets.delete(on);
    }
  }

  get(num) {
    if (this.cache.has(num)) return this.cache.get(num);
    let value = null;
    const packed = this.inStream.get(num);
    if (packed) {
      value = new Lexer(packed.data, packed.at).value();
    } else {
      const loc = this.offsets.get(num);
      if (loc) {
        const lex = new Lexer(this.bytes, loc.at);
        const v = lex.value();
        const save = lex.p;
        const next = lex.token();
        if (next instanceof Op && next.op === "stream" && v && typeof v === "object") {
          let p = save;
          const b = this.bytes;
          while (p < b.length && b[p] !== 109) p += 1; // to the "m" that ends "stream"
          p += 1;
          if (b[p] === 13) p += 1;
          if (b[p] === 10) p += 1;
          const len = this.resolveLength(v.Length);
          let end;
          if (Number.isInteger(len) && len >= 0 && p + len <= b.length && /^\s*endstream/.test(latin1(b, p + len, Math.min(b.length, p + len + 20)))) end = p + len;
          else end = this.findEndstream(p);
          value = { dict: v, stream: true, start: p, end };
        } else value = v;
      }
    }
    this.cache.set(num, value);
    return value;
  }

  resolveLength(len) {
    if (len instanceof Ref) {
      if (this.resolvingLength) return null;
      this.resolvingLength = true;
      try {
        const v = this.get(len.num);
        return typeof v === "number" ? v : null;
      } finally {
        this.resolvingLength = false;
      }
    }
    return typeof len === "number" ? len : null;
  }

  findEndstream(p) {
    const b = this.bytes;
    for (let i = p; i < b.length - 9; i += 1) {
      if (b[i] === 101 && b[i + 1] === 110 && b[i + 2] === 100 && b[i + 3] === 115 && b[i + 4] === 116 && b[i + 5] === 114) {
        let e = i;
        if (b[e - 1] === 10) e -= 1;
        if (b[e - 1] === 13) e -= 1;
        return e;
      }
    }
    return b.length;
  }

  resolve(v, depth = 0) {
    while (v instanceof Ref && depth < 32) {
      v = this.get(v.num);
      depth += 1;
    }
    return v;
  }

  streamBytes(obj, keep = true) {
    if (!obj?.stream) return new Uint8Array(0);
    if (obj.decoded) return obj.decoded;
    let data = this.bytes.subarray(obj.start, Math.min(obj.end, obj.start + this.limits.maxStreamBytes));
    let filters = this.resolve(obj.dict.Filter);
    let parms = this.resolve(obj.dict.DecodeParms);
    if (!Array.isArray(filters)) filters = filters ? [filters] : [];
    if (!Array.isArray(parms)) parms = [parms];
    filters.forEach((f, i) => {
      const name = this.resolve(f)?.name;
      const parm = this.resolve(parms[i]) || {};
      if (name === "FlateDecode" || name === "Fl") data = flate(data);
      else if (name === "ASCIIHexDecode" || name === "AHx") data = asciiHex(data);
      else if (name === "ASCII85Decode" || name === "A85") data = ascii85(data);
      else if (name === "LZWDecode" || name === "LZW") data = lzw(data);
      else data = new Uint8Array(0); // pictures and unknown filters: not text
      const predictor = Number(this.resolve(parm.Predictor)) || 1;
      if (predictor >= 10 && data.length) data = pngPredictor(data, Number(this.resolve(parm.Columns)) || 1, Number(this.resolve(parm.Colors)) || 1, Number(this.resolve(parm.BitsPerComponent)) || 8);
    });
    // Page content is read once; keeping it would hold a whole manual's drawing commands in memory.
    if (keep) obj.decoded = data;
    return data;
  }

  get encrypted() {
    return this.trailer.Encrypt != null;
  }

  info() {
    const info = this.resolve(this.trailer.Info) || {};
    const title = this.resolve(info.Title);
    return { title: title?.str != null ? pdfString(title.str) : "" };
  }

  pages() {
    const root = this.resolve(this.trailer.Root);
    const out = [];
    const seen = new Set();
    const walk = (ref, inherited) => {
      if (out.length >= this.limits.maxPages) return;
      const key = ref instanceof Ref ? ref.num : null;
      if (key != null) {
        if (seen.has(key)) return;
        seen.add(key);
      }
      const node = this.resolve(ref);
      if (!node || typeof node !== "object" || node.stream) return;
      const res = node.Resources !== undefined ? node.Resources : inherited;
      const kids = this.resolve(node.Kids);
      if (Array.isArray(kids)) {
        for (const kid of kids) walk(kid, res);
      } else if (node.Type?.name === "Page" || node.Contents !== undefined) out.push({ node, resources: res, num: key });
    };
    if (root?.Pages) walk(root.Pages, undefined);
    return out;
  }

  // R7: the PDF's own table of contents (bookmarks), as [{ title, page (1-based), depth }].
  // Only direct destinations ([page /XYZ ...] or a GoTo action) are used; named destinations are skipped.
  outline(list) {
    const root = this.resolve(this.trailer.Root);
    const top = this.resolve(root?.Outlines);
    if (!top || typeof top !== "object") return [];
    const pageOf = new Map();
    list.forEach((item, i) => { if (item.num != null) pageOf.set(item.num, i + 1); });
    const out = [];
    const seen = new Set();
    const walk = (ref, depth) => {
      let cur = ref;
      let guard = 0;
      while (cur && out.length < 400 && guard < 2000) {
        guard += 1;
        const key = cur instanceof Ref ? cur.num : null;
        if (key != null) {
          if (seen.has(key)) return;
          seen.add(key);
        }
        const node = this.resolve(cur);
        if (!node || typeof node !== "object") return;
        const t = this.resolve(node.Title);
        const title = t?.str != null ? pdfString(t.str).replace(/\s+/g, " ").trim() : "";
        let dest = this.resolve(node.Dest);
        if (!dest) {
          const action = this.resolve(node.A);
          if (action && this.resolve(action.S)?.name === "GoTo") dest = this.resolve(action.D);
        }
        if (dest && !Array.isArray(dest) && dest.D) dest = this.resolve(dest.D);
        const target = Array.isArray(dest) ? dest[0] : null;
        const page = target instanceof Ref ? pageOf.get(target.num) : Number.isInteger(target) ? target + 1 : null;
        if (title) out.push({ title: title.slice(0, 120), page: page || null, depth });
        if (node.First && depth < 2) walk(node.First, depth + 1);
        cur = node.Next;
      }
    };
    try {
      walk(top.First, 0);
    } catch {
      return out;
    }
    return out;
  }
}

// PDF text strings: UTF-16BE with a BOM, or PDFDocEncoding (close enough to Latin-1).
export function pdfString(s) {
  if (s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < s.length; i += 2) out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
    return out.replace(/\u0000/g, "");
  }
  return s.replace(/\u0000/g, "");
}

// ---------- fonts ----------

const GLYPHS = {
  space: " ", exclam: "!", quotedbl: "\"", numbersign: "#", dollar: "$", percent: "%", ampersand: "&", quotesingle: "'", quoteright: "\u2019", quoteleft: "\u2018",
  parenleft: "(", parenright: ")", asterisk: "*", plus: "+", comma: ",", hyphen: "-", minus: "-", period: ".", slash: "/", zero: "0", one: "1", two: "2", three: "3",
  four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", colon: ":", semicolon: ";", less: "<", equal: "=", greater: ">", question: "?", at: "@",
  bracketleft: "[", backslash: "\\", bracketright: "]", asciicircum: "^", underscore: "_", grave: "`", braceleft: "{", bar: "|", braceright: "}", asciitilde: "~",
  quotedblleft: "\u201c", quotedblright: "\u201d", endash: "\u2013", emdash: "\u2014", bullet: "\u2022", ellipsis: "\u2026", fi: "fi", fl: "fl", ff: "ff", ffi: "ffi", ffl: "ffl",
  degree: "\u00b0", copyright: "\u00a9", registered: "\u00ae", trademark: "\u2122", section: "\u00a7", paragraph: "\u00b6", periodcentered: "\u00b7", multiply: "\u00d7",
  divide: "\u00f7", plusminus: "\u00b1", onehalf: "\u00bd", onequarter: "\u00bc", threequarters: "\u00be", dagger: "\u2020", daggerdbl: "\u2021", quotesinglbase: "\u201a",
  quotedblbase: "\u201e", guillemotleft: "\u00ab", guillemotright: "\u00bb", eacute: "\u00e9", egrave: "\u00e8", aacute: "\u00e1", agrave: "\u00e0", ntilde: "\u00f1",
  ccedilla: "\u00e7", odieresis: "\u00f6", udieresis: "\u00fc", adieresis: "\u00e4", mu: "\u00b5", nbspace: " ", sfthyphen: "-"
};

function glyphChar(name) {
  if (!name) return "";
  if (GLYPHS[name] != null) return GLYPHS[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  const uni = /^uni([0-9A-Fa-f]{4})/.exec(name) || /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (uni) return String.fromCodePoint(parseInt(uni[1], 16));
  const base = name.split(/[._]/)[0];
  if (base !== name) return glyphChar(base);
  return "";
}

// WinAnsi differs from Latin-1 in 0x80-0x9F.
const WIN = { 0x80: "\u20ac", 0x82: "\u201a", 0x84: "\u201e", 0x85: "\u2026", 0x86: "\u2020", 0x87: "\u2021", 0x91: "\u2018", 0x92: "\u2019", 0x93: "\u201c", 0x94: "\u201d", 0x95: "\u2022", 0x96: "\u2013", 0x97: "\u2014", 0x99: "\u2122", 0xad: "-" };

function parseCMap(text) {
  const map = new Map();
  let bytes = 1;
  const cs = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(text);
  if (cs) {
    const first = /<([0-9a-fA-F]+)>/.exec(cs[1]);
    if (first) bytes = Math.max(1, Math.ceil(first[1].length / 2));
  }
  const hexToStr = (hex) => {
    let out = "";
    for (let i = 0; i + 3 < hex.length + 0 || i < hex.length; i += 4) {
      const unit = parseInt(hex.slice(i, i + 4).padEnd(4, "0"), 16);
      out += String.fromCharCode(unit);
    }
    return out;
  };
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(parseInt(m[1], 16), hexToStr(m[2].length === 2 ? `00${m[2]}` : m[2]));
      if (!cs) bytes = Math.max(bytes, Math.ceil(m[1].length / 2));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1], 16);
      const hi = Math.min(parseInt(m[2], 16), lo + 65535);
      if (!cs) bytes = Math.max(bytes, Math.ceil(m[1].length / 2));
      if (m[3].startsWith("[")) {
        const items = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => x[1]);
        items.forEach((hex, k) => map.set(lo + k, hexToStr(hex)));
      } else {
        const start = m[3].slice(1, -1);
        const head = start.slice(0, -4);
        const tail = parseInt(start.slice(-4) || "0", 16);
        for (let code = lo; code <= hi; code += 1) {
          map.set(code, hexToStr(head) + String.fromCharCode(tail + (code - lo)));
        }
      }
    }
  }
  return { map, bytes };
}

function makeFont(doc, ref) {
  const font = doc.resolve(ref) || {};
  const subtype = font.Subtype?.name;
  const out = { bytes: 1, map: null, enc: new Map(), widths: new Map(), dw: 500, win: true, scale: 0.001 };
  if (subtype === "Type0") {
    out.bytes = 2;
    const desc = doc.resolve(doc.resolve(font.DescendantFonts)?.[0]) || {};
    out.dw = Number(doc.resolve(desc.DW)) || 1000;
    const w = doc.resolve(desc.W);
    if (Array.isArray(w)) {
      for (let i = 0; i < w.length; ) {
        const a = doc.resolve(w[i]);
        const b = doc.resolve(w[i + 1]);
        if (Array.isArray(b)) {
          b.forEach((v, k) => out.widths.set(a + k, Number(doc.resolve(v)) || 0));
          i += 2;
        } else {
          const v = Number(doc.resolve(w[i + 2])) || 0;
          for (let c = a; c <= b && c - a < 65536; c += 1) out.widths.set(c, v);
          i += 3;
        }
      }
    }
  } else {
    const first = Number(doc.resolve(font.FirstChar)) || 0;
    const widths = doc.resolve(font.Widths);
    if (Array.isArray(widths)) widths.forEach((v, k) => out.widths.set(first + k, Number(doc.resolve(v)) || 0));
    const desc = doc.resolve(font.FontDescriptor) || {};
    out.dw = Number(doc.resolve(desc.MissingWidth)) || 500;
    if (subtype === "Type3") {
      const fm = doc.resolve(font.FontMatrix);
      if (Array.isArray(fm)) out.scale = Math.abs(Number(fm[0])) || 0.001;
    }
    const enc = doc.resolve(font.Encoding);
    if (enc?.name === "MacRomanEncoding") out.win = false;
    const diffs = enc && typeof enc === "object" && !(enc instanceof Name) ? doc.resolve(enc.Differences) : null;
    if (Array.isArray(diffs)) {
      let code = 0;
      for (const d of diffs) {
        const v = doc.resolve(d);
        if (typeof v === "number") code = v;
        else if (v instanceof Name) {
          const ch = glyphChar(v.name);
          if (ch) out.enc.set(code, ch);
          code += 1;
        }
      }
    }
  }
  const tu = doc.resolve(font.ToUnicode);
  if (tu?.stream) {
    const cmap = parseCMap(latin1(doc.streamBytes(tu)));
    out.map = cmap.map;
    if (subtype !== "Type0") out.bytes = 1;
    else out.bytes = cmap.bytes || 2;
  }
  return out;
}

function decodeChars(font, s) {
  // Returns [{ ch, code }]
  const out = [];
  const step = font.bytes;
  for (let i = 0; i + step - 1 < s.length; i += step) {
    const code = step === 2 ? (s.charCodeAt(i) << 8) | s.charCodeAt(i + 1) : s.charCodeAt(i);
    let ch;
    if (font.map && font.map.has(code)) ch = font.map.get(code);
    else if (font.enc.has(code)) ch = font.enc.get(code);
    else if (step === 2) ch = font.map ? "" : "";
    else if (code < 32) ch = code === 9 || code === 10 || code === 13 ? " " : "";
    else ch = font.win && WIN[code] ? WIN[code] : String.fromCharCode(code);
    out.push({ ch, code });
  }
  return out;
}

// ---------- content streams ----------

function mul(m, n) {
  return [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]
  ];
}

function pageText(doc, contents, resources, depth = 0, sink = null, ctmIn = [1, 0, 0, 1, 0, 0]) {
  const out = sink || { lines: [], line: "", lastX: null, lastY: null, lastSize: 10, chars: 0 };
  const res = doc.resolve(resources) || {};
  const fontsDict = doc.resolve(res.Font) || {};
  const xobjs = doc.resolve(res.XObject) || {};
  const fonts = new Map();
  const fontFor = (name) => {
    if (!fonts.has(name)) fonts.set(name, makeFont(doc, fontsDict[name]));
    return fonts.get(name);
  };
  let data;
  if (Array.isArray(contents)) {
    const parts = contents.map((c) => doc.streamBytes(doc.resolve(c), false));
    const total = parts.reduce((n, p) => n + p.length + 1, 0);
    data = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      data.set(p, at);
      at += p.length;
      data[at] = 10;
      at += 1;
    }
  } else data = doc.streamBytes(contents, false);
  const lex = new Lexer(data);
  const stack = [];
  let ctm = ctmIn.slice();
  const gstack = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let font = null;
  let size = 10;
  let tc = 0;
  let tw = 0;
  let th = 1;
  let tl = 0;

  const newline = () => {
    if (out.line.trim()) out.lines.push(out.line.replace(/\s+$/, ""));
    out.line = "";
  };
  const show = (s) => {
    if (!font) font = makeFont(doc, null);
    const m = mul(tm, ctm);
    const x = m[4];
    const y = m[5];
    const fsize = Math.abs(size * Math.hypot(m[2], m[3])) || Math.abs(size) || 10;
    if (out.lastY != null) {
      const dy = Math.abs(y - out.lastY);
      if (dy > Math.max(fsize, out.lastSize) * 0.5) {
        newline();
        // A big gap between lines is a paragraph break.
        if (dy > Math.max(fsize, out.lastSize) * 1.9) out.lines.push("");
      } else if (out.lastX != null && x - out.lastX > fsize * 0.18 && !/\s$/.test(out.line)) out.line += " ";
      else if (out.lastX != null && x < out.lastX - fsize * 4) out.line += " ";
    }
    let adv = 0;
    for (const { ch, code } of decodeChars(font, s)) {
      out.line += ch;
      out.chars += ch.length;
      const w = (font.widths.has(code) ? font.widths.get(code) : font.dw) * font.scale;
      adv += (w * size + tc + (code === 32 && font.bytes === 1 ? tw : 0)) * th;
    }
    tm = mul([1, 0, 0, 1, adv, 0], tm);
    const end = mul(tm, ctm);
    out.lastX = end[4];
    out.lastY = end[5];
    out.lastSize = fsize;
  };

  for (;;) {
    if (out.chars > doc.limits.maxChars) break;
    const t = lex.token();
    if (t === undefined) break;
    if (!(t instanceof Op)) {
      if (t === "[" || t === "<<") stack.push(lex.value(t));
      else stack.push(t);
      if (stack.length > 64) stack.splice(0, stack.length - 64);
      continue;
    }
    const op = t.op;
    const a = stack;
    switch (op) {
      case "q": gstack.push(ctm.slice()); break;
      case "Q": ctm = gstack.pop() || ctm; break;
      case "cm": if (a.length >= 6) ctm = mul(a.slice(-6).map(Number), ctm); break;
      case "BT": tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); break;
      case "ET": break;
      case "Tf": font = fontFor(a[a.length - 2]?.name); size = Number(a[a.length - 1]) || size; break;
      case "Tc": tc = Number(a[a.length - 1]) || 0; break;
      case "Tw": tw = Number(a[a.length - 1]) || 0; break;
      case "Tz": th = (Number(a[a.length - 1]) || 100) / 100; break;
      case "TL": tl = Number(a[a.length - 1]) || 0; break;
      case "Td": tlm = mul([1, 0, 0, 1, Number(a[a.length - 2]) || 0, Number(a[a.length - 1]) || 0], tlm); tm = tlm.slice(); break;
      case "TD": tl = -(Number(a[a.length - 1]) || 0); tlm = mul([1, 0, 0, 1, Number(a[a.length - 2]) || 0, Number(a[a.length - 1]) || 0], tlm); tm = tlm.slice(); break;
      case "Tm": if (a.length >= 6) { tlm = a.slice(-6).map(Number); tm = tlm.slice(); } break;
      case "T*": tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm.slice(); break;
      case "Tj": if (a[a.length - 1]?.str != null) show(a[a.length - 1].str); break;
      case "'": tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm.slice(); if (a[a.length - 1]?.str != null) show(a[a.length - 1].str); break;
      case "\"": tw = Number(a[a.length - 3]) || 0; tc = Number(a[a.length - 2]) || 0; tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm.slice(); if (a[a.length - 1]?.str != null) show(a[a.length - 1].str); break;
      case "TJ": {
        const arr = a[a.length - 1];
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item?.str != null) show(item.str);
            else if (typeof item === "number") {
              const shift = (-item / 1000) * size * th;
              tm = mul([1, 0, 0, 1, shift, 0], tm);
              if (item < -180 && !/\s$/.test(out.line)) out.line += " ";
            }
          }
        }
        break;
      }
      case "Do": {
        const name = a[a.length - 1]?.name;
        const x = name ? doc.resolve(xobjs[name]) : null;
        if (x?.stream && x.dict.Subtype?.name === "Form" && depth < 4) {
          const mat = Array.isArray(x.dict.Matrix) ? x.dict.Matrix.map(Number) : [1, 0, 0, 1, 0, 0];
          pageText(doc, x, x.dict.Resources || resources, depth + 1, out, mul(mat, ctm));
        }
        break;
      }
      case "BI": {
        // Inline picture: skip to EI.
        const b = lex.b;
        while (lex.p < lex.end - 2 && !(b[lex.p] === 69 && b[lex.p + 1] === 73 && WS.has(b[lex.p + 2]) && WS.has(b[lex.p - 1]))) lex.p += 1;
        lex.p += 2;
        break;
      }
      default: break;
    }
    stack.length = 0;
  }
  if (!sink) newline();
  return out;
}

function tidy(lines) {
  // Join hyphenated breaks ("water-\nproof" stays, "purifi-\ncation" joins), drop page furniture.
  const text = lines.join("\n")
    .replace(/[\u00ad]/g, "")
    .replace(/[\ue000-\uf8ff]/g, "\u2022")
    .replace(/(\w)-\n(\w)/g, (m, a, b) => (/[a-z]/.test(b) ? `${a}${b}` : `${a}-${b}`))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function openDoc(bytes, limits) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (latin1(u8, 0, Math.min(1024, u8.length)).indexOf("%PDF-") < 0) return { fail: { ok: false, pages: [], title: "", pageCount: 0, reason: "That file is not a PDF." } };
  let doc;
  try {
    doc = new PdfDoc(u8, limits);
  } catch {
    return { fail: { ok: false, pages: [], title: "", pageCount: 0, reason: "I couldn't read that PDF's structure." } };
  }
  if (doc.encrypted) return { fail: { ok: false, encrypted: true, pages: [], title: "", pageCount: 0, reason: "That PDF is locked (encrypted), so I can't read its text." } };
  return { doc, list: doc.pages() };
}

function onePage(doc, { node, resources }) {
  try {
    const contents = doc.resolve(node.Contents);
    const arr = Array.isArray(contents) ? contents : contents ? [node.Contents] : [];
    return tidy(pageText(doc, arr, resources).lines);
  } catch {
    return "";
  }
}

function finish(doc, list, pages) {
  const chars = pages.reduce((n, p) => n + p.length, 0);
  const title = doc.info().title.trim();
  if (list.length === 0) return { ok: false, pages: [], title, pageCount: 0, reason: "I couldn't find any pages in that PDF." };
  if (chars < 40) return { ok: false, pages, title, pageCount: list.length, scanned: true, reason: "That PDF is pictures of pages (a scan) with no text layer, so there's nothing I can read." };
  // R8: a long scan with a text cover or a few typed pages is still a scan: say so, don't keep a
  // 1500-page document with 12 readable pages and answer as if it were read.
  const textPages = pages.filter((p) => p.replace(/\s+/g, "").length >= 200).length;
  if (list.length >= 20 && textPages < Math.max(3, list.length * 0.1)) {
    return { ok: false, pages, title, pageCount: list.length, scanned: true, reason: `That PDF is mostly pictures of pages (a scan): only ${textPages} of its ${list.length} pages have a text layer, so I can't read it properly. Try another copy, ideally one with selectable text.` };
  }
  let outline = [];
  try {
    outline = doc.outline(list);
  } catch {
    outline = [];
  }
  return { ok: true, pages, title, pageCount: list.length, outline };
}

/**
 * bytes: Uint8Array of a PDF. Returns { ok, pages: [string], title, pageCount, reason }.
 * Never throws for a bad file; a page that cannot be read comes back empty.
 */
export function extractPdfText(bytes, limits = {}) {
  const opened = openDoc(bytes, limits);
  if (opened.fail) return opened.fail;
  const { doc, list } = opened;
  const pages = [];
  let total = 0;
  for (const page of list) {
    const text = total < doc.limits.maxChars ? onePage(doc, page) : "";
    total += text.length;
    pages.push(text);
  }
  return finish(doc, list, pages);
}

/** Same as extractPdfText, but gives the screen a turn every few pages. onProgress(done, total). */
export async function extractPdfTextAsync(bytes, { limits = {}, onProgress = null, every = 4 } = {}) {
  const opened = openDoc(bytes, limits);
  if (opened.fail) return opened.fail;
  const { doc, list } = opened;
  const pages = [];
  let total = 0;
  for (let i = 0; i < list.length; i += 1) {
    const text = total < doc.limits.maxChars ? onePage(doc, list[i]) : "";
    total += text.length;
    pages.push(text);
    if (i % every === every - 1) {
      onProgress?.(i + 1, list.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return finish(doc, list, pages);
}
