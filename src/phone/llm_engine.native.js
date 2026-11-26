// Yehsa AI (on-device) engine for Android: llama.rn (llama.cpp) running the bundled Qwen2.5 1.5B
// GGUF. Lazy on purpose: nothing here runs at app start. llama.rn is required only inside
// loadContext(), the first time an answer actually wants the AI, so startup time and the
// getMappedAction hot path are untouched. The context is released after a few idle minutes and
// when the app goes to the background, so the RAM goes back to the phone.
import { AppState } from "react-native";
import { requireOptionalNativeModule } from "expo";
import * as FileSystem from "expo-file-system";
import { LLM_LIMITS, LLM_MODEL } from "../../symbolic/llm/model_info.js";

const asset = requireOptionalNativeModule("YehsaLlmAsset");

let ctx = null;
let loading = null;
let busy = null;
let idleTimer = null;
let appStateSub = null;
const prepareListeners = new Set();

function modelDir() {
  return `${FileSystem.documentDirectory}llm/`;
}
function modelUri() {
  return `${modelDir()}${LLM_MODEL.file}`;
}
function plain(uri) {
  return String(uri).replace(/^file:\/\//, "");
}

export function llmSupported() {
  return !!asset;
}

export function onLlmPrepare(listener) {
  prepareListeners.add(listener);
  return () => prepareListeners.delete(listener);
}
function emitPrepare(info) {
  for (const l of prepareListeners) { try { l(info); } catch {} }
}

function memory() {
  try { return asset?.memory?.() || null; } catch { return null; }
}

/** Can this phone run the model? Cheap: no file copy, no model load. */
export async function llmStatus() {
  if (!asset) return { available: false, reason: "no-native-module" };
  const mem = memory();
  if (mem && (mem.total < LLM_LIMITS.minTotalRamBytes || mem.lowRamDevice)) {
    return { available: false, reason: "low-ram", totalRam: mem.total };
  }
  let bundled = -1;
  try { bundled = asset.assetSize(LLM_MODEL.assetPath); } catch {}
  const info = await FileSystem.getInfoAsync(modelUri()).catch(() => ({ exists: false }));
  const ready = info.exists && info.size === LLM_MODEL.bytes;
  if (bundled < 0 && !ready) return { available: false, reason: "not-bundled", totalRam: mem?.total };
  return { available: true, ready, loaded: !!ctx, totalRam: mem?.total, cores: mem?.cores };
}

// One-time copy out of the APK (about 1 GB). Needs free space for the copy.
async function ensureModelFile() {
  const info = await FileSystem.getInfoAsync(modelUri()).catch(() => ({ exists: false }));
  if (info.exists && info.size === LLM_MODEL.bytes) return plain(modelUri());
  const free = asset.freeBytes(plain(FileSystem.documentDirectory));
  if (free >= 0 && free < LLM_MODEL.bytes + 300 * 1024 * 1024) {
    throw new Error("Yehsa AI needs about 1.4 GB free on this phone the first time it starts. Free some space under More, Downloaded books, then ask again.");
  }
  await FileSystem.makeDirectoryAsync(modelDir(), { intermediates: true }).catch(() => {});
  emitPrepare({ phase: "copy", copied: 0, total: LLM_MODEL.bytes });
  const sub = asset.addListener?.("onLlmCopy", (e) => emitPrepare({ phase: "copy", copied: e.copied, total: LLM_MODEL.bytes }));
  try {
    await asset.copyAsset(LLM_MODEL.assetPath, plain(modelUri()));
  } finally {
    sub?.remove?.();
  }
  return plain(modelUri());
}

function armIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { releaseLlm(); }, LLM_LIMITS.idleReleaseMs);
  if (!appStateSub) {
    appStateSub = AppState.addEventListener("change", (s) => { if (s === "background") releaseLlm(); });
  }
}

async function loadContext() {
  if (ctx) return ctx;
  if (loading) return loading;
  loading = (async () => {
    const status = await llmStatus();
    if (!status.available) throw new Error(status.reason === "low-ram"
      ? "Yehsa AI is off on this phone: it has less than 4 GB of memory."
      : "Yehsa AI is not included in this build.");
    const mem = memory();
    if (mem && mem.avail < LLM_LIMITS.minAvailRamBytes) {
      throw new Error("Not enough free memory right now for Yehsa AI. Close a few apps and ask again.");
    }
    const path = await ensureModelFile();
    emitPrepare({ phase: "load" });
    // Lazy require: llama.rn's JSI install happens here, never at app start.
    const { initLlama } = require("llama.rn");
    const threads = Math.max(2, Math.min(4, (mem?.cores || 4) - 2));
    const c = await initLlama({
      model: `file://${path}`,
      n_ctx: LLM_LIMITS.nCtx,
      n_batch: LLM_LIMITS.nBatch,
      n_threads: threads,
      n_gpu_layers: 0,
      use_mmap: true,
      use_mlock: false
    });
    ctx = c;
    emitPrepare({ phase: "ready" });
    return c;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export function stopLlm() {
  try { ctx?.stopCompletion?.(); } catch {}
}

export async function releaseLlm() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const c = ctx;
  ctx = null;
  if (!c) return;
  try { await busy; } catch {}
  try { await c.release(); } catch {}
}

/** The engine runAi() talks to. One completion at a time; a new one stops the last. */
export function llmEngine() {
  if (!asset) return null;
  return {
    async generate(messages, { onToken, stop, maxTokens } = {}) {
      if (busy) { stopLlm(); try { await busy; } catch {} }
      const c = await loadContext();
      const run = c.completion({
        messages,
        n_predict: maxTokens || LLM_LIMITS.maxNewTokens,
        temperature: 0.1,
        top_p: 0.9,
        top_k: 40,
        penalty_repeat: 1.1,
        stop
      }, (data) => onToken?.(data?.token || ""));
      busy = run;
      try {
        const out = await run;
        return { text: out?.text || "", stopped: !!out?.interrupted, timings: out?.timings || null };
      } finally {
        if (busy === run) busy = null;
        armIdle();
      }
    },
    stop: stopLlm
  };
}
