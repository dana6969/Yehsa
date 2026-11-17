// Streaming readers for map files: GeoJSON, GPX and KML.
// Each reader takes text in chunks (push) and hands back lines when it can, so a big file
// is never held whole in memory and the caller can yield to the screen between chunks.
// Pure JS. No network and no storage here.

export const MAX_VERTICES = 250000;      // all lines in one import
export const MAX_LINE_VERTICES = 20000;  // one line, then it is thinned
const MAX_FEATURE_CHARS = 16 * 1024 * 1024;
const WATER_WORDS = /water|river|lake|spring|creek|stream|pond|brook/i;

function inRange(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

// Collects lines with caps. Thins a very long line, and stops adding when the file cap is hit.
export function createLineSink() {
  const lines = [];
  const state = { vertices: 0, truncated: false, points: 0 };
  function add(points, name, water, ring) {
    if (!points || points.length < 2) {
      if (points && points.length === 1) {
        state.points += 1;
        lines.push({ points: [points[0], points[0]], water: Boolean(water), name: String(name || "point").slice(0, 80), single: true });
      }
      return;
    }
    let use = points;
    if (use.length > MAX_LINE_VERTICES) {
      const step = Math.ceil(use.length / MAX_LINE_VERTICES);
      use = use.filter((_, index) => index % step === 0 || index === use.length - 1);
      state.truncated = true;
    }
    if (state.vertices + use.length > MAX_VERTICES) {
      state.truncated = true;
      return;
    }
    state.vertices += use.length;
    const line = { points: use, water: Boolean(water), name: String(name || "shape").slice(0, 80) };
    if (ring) line.ring = true;
    lines.push(line);
  }
  return { lines, state, add };
}

function pointOf(pair, ele) {
  const lon = Number(pair[0]);
  const lat = Number(pair[1]);
  if (!inRange(lat, lon)) return null;
  const point = { latitude: lat, longitude: lon };
  const height = pair.length > 2 ? Number(pair[2]) : ele;
  if (Number.isFinite(height)) point.ele = height;
  return point;
}

function pathOf(coords, ele) {
  const out = [];
  for (const pair of coords || []) {
    if (!Array.isArray(pair) || typeof pair[0] !== "number") continue;
    const point = pointOf(pair, ele);
    if (point) out.push(point);
  }
  return out;
}

// One GeoJSON geometry into separate lines: a country with islands is many lines, not one
// polyline that jumps between them.
export function addGeometry(sink, geometry, props) {
  if (!geometry || typeof geometry !== "object") return;
  const p = props || {};
  const name = p.name || p.NAME || p.natural || p.waterway || "shape";
  const water = WATER_WORDS.test(`${p.natural || ""} ${p.waterway || ""} ${p.name || ""}`);
  const ele = Number(p.ele ?? p.elevation);
  const c = geometry.coordinates;
  switch (geometry.type) {
    case "Point": {
      const point = pointOf(c || [], ele);
      if (point) sink.add([point], name, water);
      break;
    }
    case "MultiPoint":
      for (const pair of c || []) {
        const point = pointOf(pair || [], ele);
        if (point) sink.add([point], name, water);
      }
      break;
    case "LineString":
      sink.add(pathOf(c, ele), name, water);
      break;
    case "MultiLineString":
      for (const part of c || []) sink.add(pathOf(part, ele), name, water);
      break;
    case "Polygon":
      for (const part of c || []) sink.add(pathOf(part, ele), name, water, true);
      break;
    case "MultiPolygon":
      for (const poly of c || []) for (const ring of poly || []) sink.add(pathOf(ring, ele), name, water, true);
      break;
    case "GeometryCollection":
      for (const g of geometry.geometries || []) addGeometry(sink, g, p);
      break;
    default:
  }
}

const META_KEYS = new Set(["properties", "name", "license", "attribution", "source", "date", "built"]);
const BARE_KEYS = new Set(["geometry", "coordinates", "geometries"]);

/**
 * Streaming GeoJSON. Feature objects are cut out one at a time and parsed on their own, so a
 * 100 MB collection is never one string. Top-level metadata (properties, license, ...) is kept.
 * A file that is one Feature or one bare geometry is handled too (small, captured whole).
 * Returns { push(text), end() -> { ok, meta, features, bare, reason } }.
 */
export function createGeoJsonReader({ onFeature }) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  let strBuf = "";
  let lastStr = "";
  let key = null;
  let waitValue = false;
  let cap = null;
  let features = 0;
  let failed = null;
  const meta = {};
  const bare = {};

  function finishCapture() {
    const { text, kind, key: capKey } = cap;
    cap = null;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      failed = failed || "bad json";
      return;
    }
    if (kind === "feature") {
      features += 1;
      onFeature(parsed);
    } else if (kind === "meta") meta[capKey] = parsed;
    else bare[capKey] = parsed;
  }

  function push(chunk) {
    for (let i = 0; i < chunk.length; i += 1) {
      const ch = chunk[i];
      if (cap) {
        cap.text += ch;
        if (cap.text.length > MAX_FEATURE_CHARS) {
          failed = "too big";
          cap = null;
        }
      }
      if (inStr) {
        if (esc) { esc = false; strBuf += ch; } else if (ch === "\\") { esc = true; strBuf += ch; } else if (ch === "\"") {
          inStr = false;
          if (waitValue && depth === 1) {
            waitValue = false;
            if (META_KEYS.has(key)) meta[key] = strBuf;
          } else lastStr = strBuf;
        } else strBuf += ch;
        continue;
      }
      if (ch === "\"") {
        inStr = true;
        strBuf = "";
        continue;
      }
      if (ch === "{" || ch === "[") {
        depth += 1;
        if (!cap) {
          if (depth === 2 && key) {
            if (META_KEYS.has(key) && ch === "{") cap = { text: ch, kind: "meta", key, closeDepth: 2 };
            else if (BARE_KEYS.has(key)) cap = { text: ch, kind: "bare", key, closeDepth: 2 };
          } else if (depth === 3 && key === "features" && ch === "{") {
            cap = { text: ch, kind: "feature", key, closeDepth: 3 };
          }
        }
        waitValue = false;
        continue;
      }
      if (ch === "}" || ch === "]") {
        if (cap && depth === cap.closeDepth) finishCapture();
        depth -= 1;
        continue;
      }
      if (ch === ":" && depth === 1) {
        key = lastStr;
        waitValue = true;
        continue;
      }
      if (ch === "," && depth === 1) {
        key = null;
        waitValue = false;
        continue;
      }
      if (waitValue && ch > " " && depth === 1) waitValue = false; // a number or literal value
    }
  }

  function end() {
    if (failed === "too big") return { ok: false, reason: "One shape in that file is too large to read on this phone. Nothing was added.", meta, features, bare };
    return { ok: true, reason: null, meta, features, bare };
  }

  return { push, end };
}

// ---------------------------------------------------------------- GPX

function attrOf(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}="([^"]+)"`, "i"));
  return m ? m[1] : null;
}

function textTag(text, tag) {
  const m = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : null;
}

function unescapeXml(text) {
  return String(text || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

// Cuts complete <tag>...</tag> elements out of a growing text buffer.
function takeElements(state, tags) {
  const out = [];
  for (;;) {
    let best = null;
    for (const tag of tags) {
      const open = state.buf.search(new RegExp(`<${tag}(?=[\\s>/])`, "i"));
      if (open >= 0 && (!best || open < best.open)) best = { tag, open };
    }
    if (!best) {
      // Keep a tail in case a tag is split across chunks.
      state.buf = state.buf.slice(Math.max(0, state.buf.length - 16));
      return out;
    }
    const closeRe = new RegExp(`</${best.tag}\\s*>`, "i");
    const rest = state.buf.slice(best.open);
    const close = rest.search(closeRe);
    // <wpt .../> self-closing is possible but carries no data we use.
    if (close < 0) {
      if (rest.length > MAX_FEATURE_CHARS) {
        state.buf = "";
        state.failed = "too big";
        return out;
      }
      state.buf = rest;
      return out;
    }
    const end = close + rest.slice(close).match(closeRe)[0].length;
    out.push({ tag: best.tag, text: rest.slice(0, end) });
    state.buf = rest.slice(end);
  }
}

export function createGpxReader({ sink }) {
  const state = { buf: "", failed: null, seenGpx: false, items: 0 };
  function handle(item) {
    const tag = item.tag.toLowerCase();
    state.items += 1;
    if (tag === "trkseg" || tag === "rte") {
      const points = [];
      const re = /<(?:trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:trkpt|rtept)>)/gi;
      let m;
      while ((m = re.exec(item.text))) {
        const lat = Number(attrOf(m[1], "lat"));
        const lon = Number(attrOf(m[1], "lon"));
        if (!inRange(lat, lon)) continue;
        const point = { latitude: lat, longitude: lon };
        const ele = Number(textTag(m[2] || "", "ele"));
        if (Number.isFinite(ele)) point.ele = ele;
        points.push(point);
      }
      sink.add(points, tag === "rte" ? (textTag(item.text, "name") || "route") : "track", false);
    } else if (tag === "wpt") {
      const head = item.text.match(/<wpt\b([^>]*)>/i);
      const lat = Number(attrOf(head ? head[1] : "", "lat"));
      const lon = Number(attrOf(head ? head[1] : "", "lon"));
      if (inRange(lat, lon)) {
        const point = { latitude: lat, longitude: lon };
        const ele = Number(textTag(item.text, "ele"));
        if (Number.isFinite(ele)) point.ele = ele;
        sink.add([point], unescapeXml(textTag(item.text, "name") || "waypoint"), false);
      }
    }
  }
  return {
    push(chunk) {
      if (!state.seenGpx && /<gpx[\s>]/i.test(chunk)) state.seenGpx = true;
      state.buf += chunk;
      for (const item of takeElements(state, ["trkseg", "rte", "wpt"])) handle(item);
    },
    end() {
      return { ok: !state.failed, seen: state.seenGpx, items: state.items, reason: state.failed ? "That file has one section too large to read on this phone. Nothing was added." : null };
    }
  };
}

// ---------------------------------------------------------------- KML

function coordsOf(block) {
  const points = [];
  for (const token of block.replace(/<[^>]+>/g, " ").trim().split(/\s+/)) {
    if (!token) continue;
    const [lon, lat, ele] = token.split(",").map(Number);
    if (!inRange(lat, lon)) continue;
    const point = { latitude: lat, longitude: lon };
    if (Number.isFinite(ele) && ele !== 0) point.ele = ele;
    points.push(point);
  }
  return points;
}

export function createKmlReader({ sink }) {
  const state = { buf: "", failed: null, seenKml: false, items: 0 };
  function handle(item) {
    state.items += 1;
    const name = unescapeXml(textTag(item.text, "name") || "placemark");
    const blocks = item.text.match(/<coordinates[^>]*>[\s\S]*?<\/coordinates>/gi) || [];
    for (const block of blocks) {
      const points = coordsOf(block);
      if (points.length) sink.add(points, name, WATER_WORDS.test(name));
    }
  }
  return {
    push(chunk) {
      if (!state.seenKml && /<kml[\s>]|<Placemark[\s>]|<coordinates/i.test(chunk)) state.seenKml = true;
      state.buf += chunk;
      for (const item of takeElements(state, ["Placemark"])) handle(item);
    },
    end() {
      return { ok: !state.failed, seen: state.seenKml, items: state.items, reason: state.failed ? "That file has one placemark too large to read on this phone. Nothing was added." : null };
    }
  };
}

// ---------------------------------------------------------------- UTF-8 across chunk edges

// Byte chunks are read from a file (base64 on the phone). A character can be split between
// two chunks, so this keeps the unfinished bytes for the next push.
export function createUtf8Stream() {
  let carry = [];
  function decode(bytes) {
    let out = "";
    let i = 0;
    const n = bytes.length;
    while (i < n) {
      const b = bytes[i];
      if (b < 0x80) {
        out += String.fromCharCode(b);
        i += 1;
        continue;
      }
      let need = 0;
      let cp = 0;
      if (b >= 0xf0) { need = 3; cp = b & 0x07; } else if (b >= 0xe0) { need = 2; cp = b & 0x0f; } else if (b >= 0xc0) { need = 1; cp = b & 0x1f; } else { out += "\ufffd"; i += 1; continue; }
      if (i + need > n - 1) return { text: out, rest: Array.from(bytes.subarray(i)) };
      let ok = true;
      for (let k = 1; k <= need; k += 1) {
        const c = bytes[i + k];
        if ((c & 0xc0) !== 0x80) { ok = false; break; }
        cp = (cp << 6) | (c & 0x3f);
      }
      if (!ok) { out += "\ufffd"; i += 1; continue; }
      out += String.fromCodePoint(cp);
      i += need + 1;
    }
    return { text: out, rest: [] };
  }
  return {
    push(bytes) {
      let data = bytes;
      if (carry.length) {
        const joined = new Uint8Array(carry.length + bytes.length);
        joined.set(carry, 0);
        joined.set(bytes, carry.length);
        data = joined;
        carry = [];
      }
      const { text, rest } = decode(data);
      carry = rest;
      return text;
    },
    end() {
      const left = carry.length ? "\ufffd" : "";
      carry = [];
      return left;
    }
  };
}
