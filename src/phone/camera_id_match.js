// Offline camera ID: pure matching logic, no native code and no image bytes.
// A photo embedding from the on-device model goes through a small classifier head that was
// trained on openly licensed reference photos of the things Yehsa has notes for. The result
// can only be one of those classes, and when nothing is close enough, or the photo looks like
// something outside the set (a spruce is not water hemlock), it says "I'm not sure".
// This file is never imported by the knowledge path (ask.js, getMappedAction); only the
// Identify screen and its tests load it.
//
// Nothing here is an identification. Every plant result carries the photo warning, every result
// lists its look-alikes, and no result uses a word stronger than "Possible match".

export const PHOTO_WARNING =
  "Never eat, taste, or use a plant as medicine based on a photo ID alone. A photo match is a hint, not an identification. Deadly look-alikes exist.";

export const MUSHROOM_WARNING =
  "Never eat a wild mushroom because of a photo. Deadly mushrooms look like edible ones, and cooking does not make them safe.";

export const UNSURE_TITLE = "I'm not sure";
export const UNSURE_TEXT =
  "Nothing in the reference photos is close enough to this picture, so I will not guess. That includes trees that are not in the set.";
export const UNSURE_QUIET = "This is a photo hint, not an identification.";
// Kept for older callers.
export const DECLINE_TEXT = UNSURE_TEXT;

export const EMERGENCY_TEXT = "If anyone already ate part of a plant or mushroom they could not identify, call emergency services now.";

// Probability above which a deadly class in the top three is called out even when it is not first.
export const DEADLY_FLAG = 0.08;
// ... and the lower bar for adding a one-line warning to an "I'm not sure" result.
export const DEADLY_HINT = 0.15;

// Notes and picture-guide entries that already exist in Yehsa for the first eight classes.
const LINKS = {
  yarrow: { note: "yarrow_achillea", guide: "yarrow_achillea" },
  plantain: { note: "plantain_plantago", guide: "plantain_plantago" },
  willow: { note: "willow_bark", guide: "willow_bark" },
  wild_carrot: { note: "hemlock_carrot_lookalike", guide: "" },
  poison_hemlock: { note: "hemlock_carrot_lookalike", guide: "" },
  water_hemlock: { note: "hemlock_carrot_lookalike", guide: "" },
  wild_onion: { note: "camas_onion_lookalike", guide: "" },
  death_camas: { note: "camas_onion_lookalike", guide: "" }
};

const BAND_WORDS = { possible: "Possible match", weak: "Weak match" };
const BAND_HINT = {
  possible: "Shares features with the reference photos. Check every feature listed.",
  weak: "Only a loose resemblance. Do not rely on it."
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function base64Bytes(text) {
  const clean = String(text || "").replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i += 1) {
    buffer = (buffer << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (o < out.length) out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

export function normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i += 1) out[i] = vec[i] / norm;
  return out;
}

// raw: assets/camera_id/index.json, meta: assets/camera_id/classes.json
export function decodeIndex(raw, meta) {
  const dim = raw.model.dim;
  const rows = raw.classes.length + 1; // the last row is "something else"
  const bytes = base64Bytes(raw.head.w);
  if (bytes.length !== rows * dim) throw new Error("Camera index is damaged.");
  const ints = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
  const weights = new Float32Array(rows * dim);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < dim; c += 1) weights[r * dim + c] = ints[r * dim + c] * raw.head.scale[r];
  }
  return { dim, rows, classes: raw.classes, weights, bias: Float32Array.from(raw.head.b), thresholds: raw.thresholds, model: raw.model, meta };
}

// Probability for each class plus "something else" (last entry).
export function classProbabilities(index, query) {
  const q = normalize(query);
  const logits = new Float32Array(index.rows);
  let max = -Infinity;
  for (let r = 0; r < index.rows; r += 1) {
    let sum = index.bias[r];
    const base = r * index.dim;
    for (let c = 0; c < index.dim; c += 1) sum += index.weights[base + c] * q[c];
    logits[r] = sum;
    if (sum > max) max = sum;
  }
  let total = 0;
  for (let r = 0; r < index.rows; r += 1) {
    logits[r] = Math.exp(logits[r] - max);
    total += logits[r];
  }
  for (let r = 0; r < index.rows; r += 1) logits[r] /= total;
  return logits;
}

export function rankClasses(index, query) {
  const p = classProbabilities(index, query);
  const ranked = index.classes.map((id, k) => ({ id, score: p[k] })).sort((a, b) => b.score - a.score);
  return { ranked, other: p[index.rows - 1], probabilities: p };
}

function bandFor(score, thresholds) {
  if (score >= thresholds.possible) return "possible";
  if (score >= thresholds.weak) return "weak";
  return "unsure";
}

const isDeadly = (meta) => meta?.use === "deadly";

function lookalikesFor(index, id) {
  return (index.meta[id].lookalikes || []).filter((other) => index.meta[other]).map((other) => ({
    id: other,
    title: index.meta[other].title,
    deadly: isDeadly(index.meta[other]),
    note: LINKS[other]?.note || ""
  }));
}

function warningFor(meta) {
  if (meta.group === "mushroom") return MUSHROOM_WARNING;
  if (meta.use === "edible" || meta.use === "medicinal") return meta.group === "plant" || meta.group === "tree" ? PHOTO_WARNING : "";
  return "";
}

export function identify(index, query) {
  const { ranked, other, probabilities } = rankClasses(index, query);
  const top = ranked[0];
  const th = index.thresholds;
  const strongestOther = other > top.score;
  const deadlyHints = ranked.slice(0, 3).filter((item) => isDeadly(index.meta[item.id]) && item.score >= DEADLY_HINT);
  if (!top || strongestOther || top.score < th.weak) {
    return {
      status: "unsure",
      title: UNSURE_TITLE,
      text: UNSURE_TEXT,
      quiet: UNSURE_QUIET,
      // A look-alike scoring close to a deadly plant still gets one line, but no blanket paragraph.
      deadlyNearby: deadlyHints.map((d) => d.id),
      deadlyLine: deadlyHints.length ? `Part of this picture resembles a deadly plant or mushroom (${deadlyHints.map((d) => index.meta[d.id].title).join(", ")}). Do not eat or handle it.` : "",
      emergency: deadlyHints.length ? EMERGENCY_TEXT : "",
      suggestions: [],
      ranked,
      other
    };
  }
  const top3 = ranked.slice(0, 3).filter((item, k) => k === 0 || item.score >= th.weak * 0.5);
  const deadlyClose = top3.filter((item) => isDeadly(index.meta[item.id]) && item.score >= DEADLY_FLAG);
  const suggestions = top3.map((item) => {
    const meta = index.meta[item.id];
    const band = bandFor(item.score, th);
    const lookalikes = lookalikesFor(index, item.id);
    const notes = [];
    if (isDeadly(meta)) notes.push(`${meta.title} is deadly. Treat anything like this as deadly until an expert confirms it in person. Do not touch your mouth after handling it.`);
    else if (deadlyClose.length) notes.push(`A deadly look-alike (${deadlyClose.map((d) => index.meta[d.id].title).join(", ")}) also scored in the top three. Check every feature in the look-alike note.`);
    else if (lookalikes.some((l) => l.deadly)) notes.push(`This has deadly look-alikes (${lookalikes.filter((l) => l.deadly).map((l) => l.title).join(", ")}). A photo cannot tell them apart safely.`);
    const warn = warningFor(meta);
    if (warn) notes.push(warn);
    return {
      id: item.id,
      title: meta.title,
      latin: meta.latin,
      group: meta.group,
      use: meta.use,
      band,
      bandText: BAND_WORDS[band] || "Unlikely",
      bandHint: BAND_HINT[band] || "Listed only so you can compare.",
      score: Math.round(item.score * 1000) / 1000,
      look: meta.look,
      caution: meta.caution,
      note: LINKS[item.id]?.note || "",
      guide: LINKS[item.id]?.guide || "",
      lookalikes,
      notes
    };
  });
  return {
    status: "match",
    text: `Top match: ${suggestions[0].title} (${suggestions[0].bandText.toLowerCase()}). This is a photo hint, not an identification.`,
    warning: suggestions.some((s) => s.group === "mushroom") ? MUSHROOM_WARNING : PHOTO_WARNING,
    emergency: EMERGENCY_TEXT,
    deadlyNearby: deadlyClose.map((item) => item.id),
    suggestions,
    ranked,
    other
  };
}

// Same preprocessing as tools/camera_id/embed_inat.py: centre square crop (done before this),
// 224 x 224 RGB, scaled to 0..1, then ImageNet mean/std, channels first. Returns the photo and its mirror.
export function pixelsToInputs(png, model) {
  const { data, channels, width, height, depth } = png;
  const SIZE = model.input[2];
  if (width !== SIZE || height !== SIZE) throw new Error("Unexpected photo size after resize.");
  const max = depth === 16 ? 65535 : 255;
  const plane = SIZE * SIZE;
  const plain = new Float32Array(3 * plane);
  const mirror = new Float32Array(3 * plane);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const src = (y * SIZE + x) * channels;
      for (let c = 0; c < 3; c += 1) {
        const value = ((channels >= 3 ? data[src + c] : data[src]) / max - model.mean[c]) / model.std[c];
        plain[c * plane + y * SIZE + x] = value;
        mirror[c * plane + y * SIZE + (SIZE - 1 - x)] = value;
      }
    }
  }
  return [plain, mirror];
}
