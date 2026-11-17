// Node side of the meaning matcher: lazy model load, async warm-up of question vectors,
// and the lazily read scripture rows. Ask stays synchronous; askWithMeaning() awaits this first.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MODEL_INFO } from "./embedder.js";
import { loadNodeEmbedder, modelAvailable } from "./embed_node.js";
import { unpackIndex } from "./int8_index.js";
import { splitQuestion } from "./meaning_layer.js";
import notesIndex from "./notes_index.js";
import scriptureMeta from "./scripture_meta.js";
import { getVector, hasVector, putVector } from "./vector_cache.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPTURE_PATH = path.join(ROOT, "assets", "meaning", "scripture.i8");

let scripture = null;

function loadScripture(passages) {
  if (!Array.isArray(passages)) return null;
  if (scripture && scripture.passages === passages) return scripture;
  if (!fs.existsSync(SCRIPTURE_PATH)) return null;
  const bytes = new Uint8Array(fs.readFileSync(SCRIPTURE_PATH));
  const index = unpackIndex(bytes);
  if (index.rows !== passages.length || index.rows !== scriptureMeta.rows) return null;
  scripture = { index, passages };
  return scripture;
}

export function meaningContext({ scripturePassages = null } = {}) {
  return {
    index: notesIndex,
    queryVector: (text) => getVector(`q:${text}`),
    passageVector: (text) => getVector(`p:${text}`),
    scripture: scripturePassages ? loadScripture(scripturePassages) : null
  };
}

/**
 * Embed the question, its candidate parts, and any lexical reply texts, then return a
 * context for the synchronous ask path. Returns null when the model is not available,
 * so Ask falls back to the lexical path.
 */
export async function prepareMeaning(question, { replies = [], scripturePassages = null } = {}) {
  if (!modelAvailable()) return null;
  const embedder = await loadNodeEmbedder();
  if (!embedder) return null;
  const queries = [question, ...splitQuestion(question)].filter((text) => text && !hasVector(`q:${text}`));
  if (queries.length) {
    const vectors = await embedder.embed(queries, { maxLength: MODEL_INFO.queryMaxTokens });
    queries.forEach((text, i) => putVector(`q:${text}`, vectors[i]));
  }
  const passages = replies.filter((text) => text && !hasVector(`p:${text}`));
  if (passages.length) {
    const vectors = await embedder.embed(passages, { maxLength: MODEL_INFO.passageMaxTokens });
    passages.forEach((text, i) => putVector(`p:${text}`, vectors[i]));
  }
  return meaningContext({ scripturePassages });
}
