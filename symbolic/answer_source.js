// Human-readable source line for an Ask answer.
// This does not change answer text and does not replace hit.source file paths.

const GENERIC_TITLES = new Set([
  "",
  "notes",
  "topics",
  "reference",
  "camp",
  "water",
  "weather",
  "food",
  "navigation",
  "shelter_fire",
  "signaling",
  "tools_cordage"
]);

const PATH_META = {
  "symbolic_books/herbology/notes.json": { title: "Herbology notes", origin: "a field note" },
  "symbolic_books/landscape/notes.json": { title: "Landscape notes", origin: "a field note" },
  "symbolic_books/medical/reference.json": { title: "Medical reference", origin: "a field note" },
  "symbolic_books/survival/camp.json": { title: "Camp", origin: "a field note" },
  "symbolic_books/survival/food.txt": { title: "Food", origin: "a field note" },
  "symbolic_books/survival/navigation.txt": { title: "Navigation", origin: "a field note" },
  "symbolic_books/survival/shelter_fire.txt": { title: "Shelter and fire", origin: "a field note" },
  "symbolic_books/survival/signaling.txt": { title: "Signaling", origin: "a field note" },
  "symbolic_books/survival/tools_cordage.txt": { title: "Tools and cordage", origin: "a field note" },
  "symbolic_books/survival/water.txt": { title: "Water", origin: "a field note" },
  "symbolic_books/survival/weather.txt": { title: "Weather", origin: "a field note" },
  "symbolic_books/the_kybalion.txt": { title: "The Kybalion", origin: "a public-domain book" },
  "symbolic_books/story_of_the_great_war_vol_v.txt": {
    title: "The Story of the Great War, Volume V",
    origin: "a public-domain book"
  },
  "symbolic_memory/math/topics.json": { title: "Math topics", origin: "a field note" },
  "symbolic_memory/full_book_verses.json": { title: "Local book verses", origin: "the scripture index" },
  "symbolic_memory/tao_te_ching.json": { title: "Tao Te Ching", origin: "the scripture index" }
};

function humanizeSymbol(symbol) {
  const raw = String(symbol || "").replace(/[_-]+/g, " ").replace(/\s+\d+$/, "").trim();
  if (!raw) return "";
  return raw.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function guessOrigin(path, kind) {
  const value = String(path || "").toLowerCase();
  if (value.endsWith(".txt") && value.includes("symbolic_books/") && !/survival|herbology|landscape|medical/.test(value)) {
    return "a public-domain book";
  }
  if (kind === "spiritual" || value.includes("spiritual") || value.includes("tao") || value.includes("verses")) {
    return "the scripture index";
  }
  if (kind === "dictionary" || value.includes("lexical") || value.includes("dictionary")) {
    return "the dictionary pack on this phone";
  }
  if (kind === "learned") return "a note you saved on this phone";
  if (path) return "a field note";
  return null;
}

function rawPath(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.includes("/") || text.startsWith("symbolic_") || text === "lexical-headword" || text === "this phone") {
    return text;
  }
  return "";
}

export function citeHit(hit) {
  if (!hit || typeof hit !== "object") return null;
  if (hit.kind === "calculator") return null;
  if (hit.kind === "about") return null;
  const path = rawPath(hit.source);
  const meta = PATH_META[path] || null;
  let title = String(hit.title || "").trim();
  let origin = null;
  if (meta) {
    origin = meta.origin;
    if (!title || GENERIC_TITLES.has(title.toLowerCase())) {
      const named = humanizeSymbol(hit.symbol);
      title = named && named.toLowerCase() !== meta.title.toLowerCase() ? named : meta.title;
    }
  } else if (hit.kind === "dictionary" || path.includes("lexical")) {
    title = title || humanizeSymbol(hit.symbol) || "Dictionary pack";
    origin = "the dictionary pack on this phone";
  } else if (hit.kind === "learned") {
    title = title || "Learned note";
    origin = "a note you saved on this phone";
  } else if (hit.kind === "spiritual") {
    title = title || humanizeSymbol(hit.symbol) || "Scripture";
    origin = "the scripture index";
  } else if (hit.kind === "landscape" && !path) {
    return "Landscape tools on this phone";
  } else if (path || hit.kind) {
    origin = guessOrigin(path, hit.kind) || (hit.kind === "medical" ? "a field note" : null);
    if (!title || GENERIC_TITLES.has(title.toLowerCase())) {
      title = humanizeSymbol(hit.symbol) || (meta && meta.title) || "";
    }
  }
  if (!title && !origin) return null;
  if (title && origin) return `${title} — ${origin}`;
  return title || origin;
}

function primaryFrom(result) {
  const hits = Array.isArray(result?.hits) ? result.hits : [];
  const first = hits[0] || null;
  return {
    kind: first?.kind || result?.kind || null,
    symbol: first?.symbol || result?.symbol || null,
    title: first?.title || result?.title || "",
    source: rawPath(first?.source) || rawPath(result?.source) || "",
    text: first?.text || result?.text || ""
  };
}

export function formatAnswerSource(result) {
  if (!result || typeof result !== "object") return null;
  if (result.empty || (!result.answered && !result.text)) return null;
  if (result.kind === "calculator") return null;
  if (result.kind === "about") return null;
  if (result.kind === "emotion") return null;
  const already = String(result.source || "");
  if (already.includes(" — ") && !rawPath(already)) {
    return already;
  }
  const labels = [];
  const seen = new Set();
  const push = (label) => {
    if (!label || seen.has(label)) return;
    seen.add(label);
    labels.push(label);
  };
  push(citeHit(primaryFrom(result)));
  for (const hit of result.hits || []) push(citeHit(hit));
  if (labels.length === 0) {
    if (result.kind === "learned") return citeHit({ kind: "learned", title: result.title, symbol: result.symbol });
    if (result.kind === "dictionary") return citeHit({ kind: "dictionary", symbol: result.symbol });
    if (result.kind === "spiritual") return citeHit({ kind: "spiritual", title: result.title, symbol: result.symbol, source: result.source });
    if (result.kind === "landscape") return "Landscape tools on this phone";
    if (result.kind === "medical" || result.kind === "herbology" || result.kind === "survival") {
      return "Field safety note";
    }
    return null;
  }
  if (labels.length === 1) return labels[0];
  return `${labels[0]}; also ${labels.slice(1, 3).join("; ")}`;
}

export function withAnswerSource(result) {
  if (!result || typeof result !== "object") return result;
  return { ...result, source: formatAnswerSource(result) };
}
