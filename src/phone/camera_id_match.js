// Offline camera ID: pure matching logic, no native code and no image bytes.
// A photo embedding is compared with precomputed embeddings of Yehsa's own
// reference photos, so a suggestion can only ever be something Yehsa has a
// note for. This file is never imported by the knowledge path (ask.js,
// getMappedAction); only the Identify screen and its tests load it.
//
// Nothing here is an identification. Every plant result carries the photo
// warning, every result links its look-alikes, and a result whose deadly
// look-alike scores close is capped at "Possible match".

export const PHOTO_WARNING =
  "Never eat, taste, or use a plant as medicine based on a photo ID alone. A photo match is a hint, not an identification. Deadly look-alikes exist.";

export const DECLINE_TEXT =
  "Nothing in Yehsa's reference photos is close to this picture, so I will not guess. Try a sharper, closer photo of one plant in daylight, or check the picture guide.";

export const EMERGENCY_TEXT = "If anyone already ate part of a plant they could not identify, call emergency services now.";

// Score cut-offs on cosine similarity (MobileNetV3-Small embeddings, see
// eval/camera_id/REPORT.md). Chosen once from the leave-one-out score spread
// and kept fixed; they are not tuned per photo. There is deliberately no
// "close" or "confident" band: in the leave-one-out check even the highest
// scores were wrong often enough that a stronger word would overstate it.
export const BANDS = {
  possible: 0.5,
  weak: 0.42
};

// Deadly look-alike notes: a plant with a deadly look-alike (yarrow, wild
// carrot, wild onion) always says so, and any non-deadly match says so too
// whenever a deadly plant is anywhere in the top 3. In the leave-one-out check
// a held-out poison hemlock photo scored closest to willow, so this does not
// depend on how far behind the deadly plant is.

export const CAMERA_CLASSES = {
  yarrow: {
    title: "Yarrow",
    latin: "Achillea millefolium",
    note: "yarrow_achillea",
    guide: "yarrow_achillea",
    use: "medicinal",
    lookalikes: ["wild_carrot", "poison_hemlock", "water_hemlock"],
    lookalikeNote: "hemlock_carrot_lookalike"
  },
  plantain: {
    title: "Plantain",
    latin: "Plantago",
    note: "plantain_plantago",
    guide: "plantain_plantago",
    use: "medicinal",
    lookalikes: [],
    lookalikeNote: "toxic_vs_edible"
  },
  willow: {
    title: "Willow",
    latin: "Salix",
    note: "willow_bark",
    guide: "willow_bark",
    use: "medicinal",
    lookalikes: [],
    lookalikeNote: "toxic_vs_edible"
  },
  wild_carrot: {
    title: "Wild carrot (Queen Anne's lace)",
    latin: "Daucus carota",
    note: "hemlock_carrot_lookalike",
    guide: "",
    use: "edible",
    lookalikes: ["poison_hemlock", "water_hemlock", "yarrow"],
    lookalikeNote: "hemlock_carrot_lookalike"
  },
  poison_hemlock: {
    title: "Poison hemlock",
    latin: "Conium maculatum",
    note: "hemlock_carrot_lookalike",
    guide: "",
    use: "deadly",
    lookalikes: ["wild_carrot", "water_hemlock", "yarrow"],
    lookalikeNote: "hemlock_carrot_lookalike"
  },
  water_hemlock: {
    title: "Water hemlock",
    latin: "Cicuta",
    note: "hemlock_carrot_lookalike",
    guide: "",
    use: "deadly",
    lookalikes: ["poison_hemlock", "wild_carrot", "yarrow"],
    lookalikeNote: "hemlock_carrot_lookalike"
  },
  wild_onion: {
    title: "Wild onion",
    latin: "Allium",
    note: "camas_onion_lookalike",
    guide: "",
    use: "edible",
    lookalikes: ["death_camas"],
    lookalikeNote: "camas_onion_lookalike"
  },
  death_camas: {
    title: "Death camas",
    latin: "Toxicoscordion",
    note: "camas_onion_lookalike",
    guide: "",
    use: "deadly",
    lookalikes: ["wild_onion"],
    lookalikeNote: "camas_onion_lookalike"
  }
};

const BAND_WORDS = {
  possible: "Possible match",
  weak: "Weak match",
  unlikely: "Unlikely"
};

const BAND_HINT = {
  possible: "Shares features with the reference photos. Check every feature in the note.",
  weak: "Only a loose resemblance. Do not rely on it.",
  unlikely: "Listed only so you can compare."
};

function base64Bytes(text) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(text || "").replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i += 1) {
    buffer = (buffer << 6) | alphabet.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (o < out.length) out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

export function decodeVector(entry, dim) {
  const bytes = base64Bytes(entry.q);
  const ints = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
  const vec = new Float32Array(dim);
  for (let i = 0; i < dim; i += 1) vec[i] = ints[i] * entry.s;
  return normalize(vec);
}

export function normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i += 1) out[i] = vec[i] / norm;
  return out;
}

export function decodeIndex(raw) {
  const dim = raw.model.dim;
  const refs = raw.refs.map((entry) => ({ c: entry.c, src: entry.src, vec: decodeVector(entry, dim) }));
  return { dim, classes: raw.classes, refs, sources: raw.sources, model: raw.model };
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

// Best cosine similarity per class. excludeSrc drops every view of one source
// photo, which is how leave-one-out evaluation holds an image out.
export function classScores(index, query, { excludeSrc = -1 } = {}) {
  const q = normalize(query);
  const best = new Array(index.classes.length).fill(-1);
  for (const ref of index.refs) {
    if (ref.src === excludeSrc) continue;
    const score = dot(q, ref.vec);
    if (score > best[ref.c]) best[ref.c] = score;
  }
  return index.classes.map((id, k) => ({ id, score: best[k] })).sort((a, b) => b.score - a.score);
}

function bandFor(score) {
  if (score >= BANDS.possible) return "possible";
  if (score >= BANDS.weak) return "weak";
  return "unlikely";
}

function lookalikesFor(id) {
  const meta = CAMERA_CLASSES[id];
  return meta.lookalikes.map((other) => ({
    id: other,
    title: CAMERA_CLASSES[other].title,
    deadly: CAMERA_CLASSES[other].use === "deadly",
    note: CAMERA_CLASSES[other].note
  }));
}

export function identify(index, query, options = {}) {
  const ranked = classScores(index, query, options);
  const top = ranked[0];
  if (!top || top.score < BANDS.weak) {
    return { status: "declined", text: DECLINE_TEXT, warning: PHOTO_WARNING, emergency: EMERGENCY_TEXT, suggestions: [], ranked };
  }
  const top3 = ranked.slice(0, 3);
  const deadlyClose = top3.filter((item) => CAMERA_CLASSES[item.id].use === "deadly");
  const suggestions = top3.map((item, k) => {
    const meta = CAMERA_CLASSES[item.id];
    const band = bandFor(item.score);
    const hasDeadlyLookalike = meta.lookalikes.some((other) => CAMERA_CLASSES[other].use === "deadly");
    const notes = [];
    if (meta.use === "deadly") notes.push(`${meta.title} is deadly. Treat any plant like this as deadly until an expert confirms it in person. Do not touch your mouth after handling it.`);
    if (meta.use !== "deadly" && deadlyClose.length) notes.push(`A deadly plant (${deadlyClose.map((d) => CAMERA_CLASSES[d.id].title).join(", ")}) is also in the top three. Check every feature in the look-alike note before you touch it again.`);
    else if (hasDeadlyLookalike) notes.push("This plant has deadly look-alikes. A photo cannot tell them apart safely.");
    if (meta.use === "edible" || meta.use === "medicinal") notes.push(PHOTO_WARNING);
    return {
      id: item.id,
      title: meta.title,
      latin: meta.latin,
      use: meta.use,
      band,
      bandText: BAND_WORDS[band],
      bandHint: BAND_HINT[band],
      score: Math.round(item.score * 1000) / 1000,
      note: meta.note,
      guide: meta.guide,
      lookalikes: lookalikesFor(item.id),
      lookalikeNote: meta.lookalikeNote,
      notes
    };
  });
  return {
    status: "match",
    text: `Top match: ${suggestions[0].title} (${suggestions[0].bandText.toLowerCase()}). This is a photo hint, not an identification.`,
    warning: PHOTO_WARNING,
    emergency: EMERGENCY_TEXT,
    deadlyNearby: deadlyClose.map((item) => item.id),
    suggestions,
    ranked
  };
}

// Same preprocessing as tools/camera_id/embed_refs.py: center square crop,
// 224 x 224, RGB scaled to 0..1. The query is the mean of the photo and its mirror.
export function pixelsToInputs(png) {
  const { data, channels, width, height, depth } = png;
  const SIZE = 224;
  if (width !== SIZE || height !== SIZE) throw new Error("Unexpected photo size after resize.");
  const max = depth === 16 ? 65535 : 255;
  const plain = new Float32Array(SIZE * SIZE * 3);
  const mirror = new Float32Array(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const src = (y * SIZE + x) * channels;
      const dst = (y * SIZE + x) * 3;
      const mdst = (y * SIZE + (SIZE - 1 - x)) * 3;
      for (let c = 0; c < 3; c += 1) {
        const value = (channels >= 3 ? data[src + c] : data[src]) / max;
        plain[dst + c] = value;
        mirror[mdst + c] = value;
      }
    }
  }
  return [plain, mirror];
}
