// Hook that adds Yehsa AI (on-device) under an answer already in the chat. Kept in its own file
// so the Ask screen only needs two calls: refine(id, question, result) after an answer, and
// refineWeb(id, question, note) after a web quote. The answer itself is never changed.
import { useCallback, useEffect, useRef, useState } from "react";
import { runAi } from "../../symbolic/llm/ai_runner.js";
import { aiEligibility } from "../../symbolic/llm/grounding.js";
import { llmEngine, llmStatus, onLlmPrepare, stopLlm } from "./llm_engine";
import { currentAiSettings, ensureAiSettings, setAiSettings, subscribeAiSettings } from "./ai_settings.js";

export default function useYehsaAI(patchMessageFn) {
  // The Ask screen's patchMessage is a new function each render; keep the latest in a ref.
  const patchRef = useRef(patchMessageFn);
  patchRef.current = patchMessageFn;
  const patchMessage = useCallback((id, patch) => patchRef.current?.(id, patch), []);
  const [settings, setSettings] = useState(currentAiSettings());
  const settingsRef = useRef(currentAiSettings());
  const statusRef = useRef(null);
  const activeId = useRef(null);

  useEffect(() => {
    const off = subscribeAiSettings((s) => {
      settingsRef.current = s;
      setSettings(s);
      if (!s.enabled) stopLlm();
    });
    ensureAiSettings();
    return off;
  }, []);

  useEffect(() => onLlmPrepare((info) => {
    const id = activeId.current;
    if (!id) return;
    if (info.phase === "copy") {
      const pct = info.total ? Math.min(99, Math.round((info.copied / info.total) * 100)) : 0;
      patchMessage(id, { ai: { state: "thinking", text: "", note: `Setting up Yehsa AI on this phone for the first time (${pct}%). This happens once.` } });
    } else if (info.phase === "load") {
      patchMessage(id, { ai: { state: "thinking", text: "", note: "Waking Yehsa AI…" } });
    }
  }), [patchMessage]);

  const update = useCallback((s) => {
    setAiSettings(s);
  }, []);

  const go = useCallback(async (id, question, result, webNote) => {
    if (!settingsRef.current.enabled) return;
    if (webNote && !settingsRef.current.useWebQuotes) return;
    // Cheap checks first, so ineligible answers never touch the engine.
    if (!aiEligibility(question, result, { webNote }).ok) return;
    if (!statusRef.current || !statusRef.current.available) statusRef.current = await llmStatus().catch(() => ({ available: false }));
    if (!statusRef.current.available) return;
    const engine = llmEngine();
    if (!engine) return;
    if (activeId.current && activeId.current !== id) {
      patchMessage(activeId.current, { ai: null });
      stopLlm();
    }
    activeId.current = id;
    await runAi({
      question,
      result,
      webNote,
      engine,
      onUpdate: (u) => {
        if (activeId.current !== id && u.state !== "done") return;
        if (u.state === "skipped") patchMessage(id, { ai: null });
        else patchMessage(id, { ai: { state: u.state, text: u.text || "", footer: u.footer || null, note: u.note || null } });
      }
    });
    if (activeId.current === id) activeId.current = null;
  }, [patchMessage]);

  const refine = useCallback((id, question, result) => { go(id, question, result, null).catch(() => {}); }, [go]);
  const refineWeb = useCallback((id, question, note) => { go(id, question, null, note).catch(() => {}); }, [go]);
  const stop = useCallback((id) => {
    stopLlm();
    if (id) patchMessage(id, { ai: null });
  }, [patchMessage]);

  return { settings, update, refine, refineWeb, stop };
}
