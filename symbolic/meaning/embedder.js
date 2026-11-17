// Sentence embedder shared by Node (onnxruntime-node) and the phone (onnxruntime-react-native).
// The caller passes the runtime module and a created session, so this file never imports a
// native module and stays off every hot path. Output vectors are L2-normalized Float32Arrays.

import vocabText from "./vocab.js";
import { buildVocab, encode } from "./wordpiece.js";

export const MODEL_INFO = {
  name: "BAAI/bge-small-en-v1.5 (ONNX, int8 dynamic quantization from Xenova/bge-small-en-v1.5)",
  file: "bge-small-en-v1.5-int8.onnx",
  license: "MIT",
  dims: 384,
  pooling: "cls",
  queryMaxTokens: 96,
  passageMaxTokens: 256
};

let vocab = null;
function getVocab() {
  if (!vocab) vocab = buildVocab(vocabText);
  return vocab;
}

export function tokenize(text, maxLength) {
  return encode(text, getVocab(), maxLength);
}

function normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
  const inv = sum > 0 ? 1 / Math.sqrt(sum) : 0;
  for (let i = 0; i < vec.length; i += 1) vec[i] *= inv;
  return vec;
}

export function createEmbedder({ ort, session, info = MODEL_INFO }) {
  if (!ort || !session) throw new Error("meaning embedder needs a runtime and a session");
  const dims = info.dims;
  const wantsTypes = session.inputNames.includes("token_type_ids");

  async function embedBatch(texts, maxLength) {
    const encoded = texts.map((text) => tokenize(text, maxLength));
    const width = Math.max(...encoded.map((ids) => ids.length));
    const n = encoded.length;
    const ids = new BigInt64Array(n * width);
    const mask = new BigInt64Array(n * width);
    encoded.forEach((row, r) => {
      for (let c = 0; c < row.length; c += 1) {
        ids[r * width + c] = BigInt(row[c]);
        mask[r * width + c] = 1n;
      }
    });
    const feeds = {
      input_ids: new ort.Tensor("int64", ids, [n, width]),
      attention_mask: new ort.Tensor("int64", mask, [n, width])
    };
    if (wantsTypes) feeds.token_type_ids = new ort.Tensor("int64", new BigInt64Array(n * width), [n, width]);
    const output = await session.run(feeds);
    const hidden = output.last_hidden_state || output[session.outputNames[0]];
    const data = hidden.data;
    const out = [];
    for (let r = 0; r < n; r += 1) {
      const vec = new Float32Array(dims);
      if (info.pooling === "mean") {
        const len = encoded[r].length;
        for (let t = 0; t < len; t += 1) {
          const base = (r * width + t) * dims;
          for (let d = 0; d < dims; d += 1) vec[d] += data[base + d];
        }
        for (let d = 0; d < dims; d += 1) vec[d] /= len;
      } else {
        const base = r * width * dims;
        for (let d = 0; d < dims; d += 1) vec[d] = data[base + d];
      }
      out.push(normalize(vec));
    }
    return out;
  }

  return {
    info,
    async embed(texts, { maxLength = info.queryMaxTokens, batchSize = 16 } = {}) {
      const list = Array.isArray(texts) ? texts : [texts];
      const out = [];
      for (let i = 0; i < list.length; i += batchSize) {
        out.push(...await embedBatch(list.slice(i, i + batchSize), maxLength));
      }
      return out;
    }
  };
}
