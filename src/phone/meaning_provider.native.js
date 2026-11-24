// On-device meaning matcher for Android and iOS. Loads the bundled sentence-embedding model
// with onnxruntime-react-native the first time a question needs it, never at launch, and never
// on the symbol hot path. Everything stays on the phone; nothing is downloaded.
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { createEmbedder, MODEL_INFO } from "../../symbolic/meaning/embedder.js";
import { base64ToBytes, unpackIndex } from "../../symbolic/meaning/int8_index.js";
import { meaningRoutesScripture, splitQuestion } from "../../symbolic/meaning/meaning_layer.js";
import notesIndex from "../../symbolic/meaning/notes_index.js";
import scriptureMeta from "../../symbolic/meaning/scripture_meta.js";
import { getVector, hasVector, putVector } from "../../symbolic/meaning/vector_cache.js";

const MODEL_ASSET = require("../../assets/meaning/bge-small-en-v1.5-int8.onnx");
const SCRIPTURE_ASSET = require("../../assets/meaning/scripture.i8");

let embedderPending = null;
let scripturePending = null;
let failed = false;

export function meaningSupported() {
  return !failed;
}

function loadEmbedder() {
  if (!embedderPending) {
    embedderPending = (async () => {
      const ort = require("onnxruntime-react-native");
      const asset = Asset.fromModule(MODEL_ASSET);
      await asset.downloadAsync();
      const session = await ort.InferenceSession.create(asset.localUri || asset.uri);
      return createEmbedder({ ort, session });
    })().catch(() => {
      failed = true;
      return null;
    });
  }
  return embedderPending;
}

function loadScriptureRows(passages) {
  if (!scripturePending) {
    scripturePending = (async () => {
      const asset = Asset.fromModule(SCRIPTURE_ASSET);
      await asset.downloadAsync();
      const text = await FileSystem.readAsStringAsync(asset.localUri || asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      return unpackIndex(base64ToBytes(text));
    })().catch(() => null);
  }
  return scripturePending.then((index) => {
    if (!index || !Array.isArray(passages) || index.rows !== passages.length || index.rows !== scriptureMeta.rows) return null;
    return { index, passages };
  });
}

function context(scripture) {
  return {
    index: notesIndex,
    queryVector: (text) => getVector(`q:${text}`),
    passageVector: (text) => getVector(`p:${text}`),
    scripture
  };
}

/**
 * Embed the question (and its parts, and any lexical candidate replies) and return a context
 * for askField(). Returns null if the model cannot load, so Ask keeps the lexical path.
 * loadScripturePassages: optional async function returning the scripture passages.
 */
export async function prepareMeaning(question, { replies = [], spiritual = false, loadScripturePassages = null } = {}) {
  if (failed) return null;
  const embedder = await loadEmbedder();
  if (!embedder) return null;
  const queries = [question, ...splitQuestion(question)].filter((text) => text && !hasVector(`q:${text}`));
  if (queries.length) {
    const vectors = await embedder.embed(queries, { maxLength: MODEL_INFO.queryMaxTokens, batchSize: 4 });
    queries.forEach((text, i) => putVector(`q:${text}`, vectors[i]));
  }
  const passages = replies.filter((text) => text && !hasVector(`p:${text}`));
  if (passages.length) {
    const vectors = await embedder.embed(passages, { maxLength: MODEL_INFO.passageMaxTokens, batchSize: 2 });
    passages.forEach((text, i) => putVector(`p:${text}`, vectors[i]));
  }
  let scripture = null;
  const plain = context(null);
  if ((spiritual || meaningRoutesScripture(plain, question)) && typeof loadScripturePassages === "function") {
    const loaded = await loadScripturePassages();
    scripture = await loadScriptureRows(loaded?.passages || loaded);
  }
  return context(scripture);
}

/**
 * Vectors for approved web notes, made after the person approves them and never on the hot path.
 * Returns { model, vectors } or null when the model cannot load. The static field-note index is not touched.
 */
export async function embedNotes(texts) {
  if (failed || !texts?.length) return null;
  const embedder = await loadEmbedder();
  if (!embedder) return null;
  const vectors = await embedder.embed(texts, { maxLength: MODEL_INFO.passageMaxTokens, batchSize: 2 });
  return { model: MODEL_INFO.file, vectors };
}
