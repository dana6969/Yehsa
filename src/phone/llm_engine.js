// Web and Node test build: there is no on-device model here. Yehsa AI stays off and the
// symbolic answers are unchanged. The phone build uses llm_engine.native.js.
export function llmSupported() { return false; }
export async function llmStatus() { return { available: false, reason: "not-on-this-platform" }; }
export function llmEngine() { return null; }
export async function releaseLlm() {}
export function stopLlm() {}
export function onLlmPrepare() { return () => {}; }
