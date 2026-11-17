// Node loader for the meaning matcher. Lazily imports onnxruntime-node the first time a
// question needs a vector. Never imported by symbolic_dictionary.js or getMappedAction.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createEmbedder, MODEL_INFO } from "./embedder.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MODEL_PATH = path.join(ROOT, "assets", "meaning", MODEL_INFO.file);

let pending = null;

export function modelAvailable() {
  return !process.env.YEHSA_MEANING_OFF && fs.existsSync(MODEL_PATH);
}

export function loadNodeEmbedder(modelPath = MODEL_PATH) {
  if (pending) return pending;
  pending = (async () => {
    if (!modelAvailable()) return null;
    let ort;
    try {
      ort = (await import("onnxruntime-node")).default;
    } catch {
      return null;
    }
    const session = await ort.InferenceSession.create(modelPath, {
      graphOptimizationLevel: "all",
      intraOpNumThreads: Number(process.env.YEHSA_MEANING_THREADS) || 2
    });
    return createEmbedder({ ort, session });
  })().catch(() => null);
  return pending;
}
