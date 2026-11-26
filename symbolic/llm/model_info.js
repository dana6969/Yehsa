// The one on-device model Yehsa bundles. Pure data: no native code, safe to import anywhere.
// Qwen2.5-1.5B-Instruct (Apache-2.0), the official Qwen Q4_0 GGUF. Q4_0 is used rather than
// Q4_K_M because llama.cpp repacks Q4_0 for ARM dot-product cores (the moto g 2026's Cortex-A76),
// which makes reading the prompt noticeably faster on mid-range phones, for ~1-2% quality.
export const LLM_MODEL = Object.freeze({
  id: "qwen2.5-1.5b-instruct-q4_0",
  name: "Qwen2.5 1.5B Instruct",
  file: "qwen2.5-1.5b-instruct-q4_0.gguf",
  bytes: 1066227232,
  sha256: "dcd819ff094852c38faba6873d8ff0c9d51eadb2844539e52042ae5d647bbfdb",
  url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_0.gguf",
  license: "Apache-2.0",
  licenseUrl: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE",
  publisher: "Qwen (Alibaba Cloud)",
  // Where the config plugin puts it inside the APK (android/app/src/main/assets/<assetPath>).
  assetPath: "llm/qwen2.5-1.5b-instruct-q4_0.gguf"
});

// Context and generation limits sized for a 4 GB phone.
export const LLM_LIMITS = Object.freeze({
  nCtx: 2048,
  nBatch: 256,
  maxNewTokens: 160,
  promptCharBudget: 2600,
  passageCharCap: 950,
  maxPassages: 3,
  // Phones that report under this much total RAM (3 GB class) skip the model. A "4 GB" phone
  // such as the moto g 2026 reports about 3.6-3.8 GB, so it keeps the model.
  minTotalRamBytes: 3.3 * 1024 ** 3,
  // Free RAM needed at the moment the model loads; below this Yehsa waits and says why.
  minAvailRamBytes: 0.9 * 1024 ** 3,
  idleReleaseMs: 3 * 60 * 1000
});

export const AI_LABEL = "Yehsa AI (on-device)";
