export async function resolveFallback(symbol) {
  const { recallKnowledge } = await import("./knowledge_index.js");
  const hit = recallKnowledge(symbol);
  if (hit?.text) return { symbol, action: hit.text, source: hit.kind || "knowledge" };
  return { symbol, action: "observe", source: "default" };
}
