// Runs one Yehsa AI (on-device) pass for an answer that is already on screen. Engine-agnostic:
// the phone passes the llama.rn engine, Node tests pass a fake. Nothing here is on the hot path.
import { aiEligibility, buildMessages, cleanPartial, collectPassages, finalizeAiText, aiFooter, relevance, STOP_WORDS } from "./grounding.js";

// Share of the question's content words the answer passage must mention (2 of 2, 2 of 3, 3 of 5).
const MIN_RELEVANCE = 0.6;
import { LLM_LIMITS } from "./model_info.js";

/**
 * engine: { generate(messages, { onToken, stop, maxTokens }) -> Promise<{ text, timings? }>, stop?() }
 * onUpdate({ state, text, footer, note }) is called while streaming (throttled) and at the end.
 * state: "thinking" | "streaming" | "done" | "skipped" | "error"
 */
export async function runAi({ question, result = null, webNote = null, engine, enabled = true, onUpdate = () => {}, throttleMs = 90, now = () => Date.now() }) {
  const gate = aiEligibility(question, result, { enabled, webNote });
  if (!gate.ok) return { state: "skipped", reason: gate.reason };
  const passages = collectPassages(result, { webNote, question });
  if (!passages.length) return { state: "skipped", reason: "no-passages" };
  // Off-topic retrieval (a misroute): the model would only talk about the wrong note. Stay quiet.
  // The first passage is the answer on screen; if it is not about the question, neither is the AI.
  if (!webNote && relevance(question, passages[0].text) < MIN_RELEVANCE) return { state: "skipped", reason: "off-topic" };
  if (webNote && Math.max(...passages.map((p) => relevance(question, p.text))) < MIN_RELEVANCE) return { state: "skipped", reason: "off-topic" };
  if (!engine?.generate) return { state: "skipped", reason: "no-engine" };
  const messages = buildMessages(question, passages);
  onUpdate({ state: "thinking", text: "", footer: null });
  let raw = "";
  let last = 0;
  try {
    const out = await engine.generate(messages, {
      maxTokens: LLM_LIMITS.maxNewTokens,
      stop: STOP_WORDS,
      onToken(token) {
        raw += String(token ?? "");
        const t = now();
        if (t - last >= throttleMs) {
          last = t;
          onUpdate({ state: "streaming", text: cleanPartial(raw, passages), footer: null });
        }
      }
    });
    if (out?.text && out.text.length > raw.length) raw = out.text;
    if (out?.stopped && !raw.trim()) return { state: "skipped", reason: "stopped" };
    const final = finalizeAiText(raw, passages, question);
    if (final.empty) {
      onUpdate({ state: "skipped", text: "", footer: null });
      return { state: "skipped", reason: "no-grounded-text", raw };
    }
    const done = { state: "done", text: final.text, footer: aiFooter(final), dropped: final.dropped, timings: out?.timings || null };
    onUpdate(done);
    return { ...done, passages, citations: final.citations };
  } catch (err) {
    const note = String(err?.message || err || "Yehsa AI could not run.");
    onUpdate({ state: "error", text: "", footer: null, note });
    return { state: "error", reason: note };
  }
}
