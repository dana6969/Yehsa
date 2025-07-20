export function expandQuery(symbols, context) {
  if (!symbols || symbols.length === 0) return { prompt: "No symbols provided." };
  let prompt = `Reflect on the meaning of ${symbols.join(", ")} in the context of ${context}.`;
  if (symbols.includes("🧠") && context === "test") {
    prompt = "Initiate cognitive self-reflection protocol.";
  }
  if (symbols.includes("🌌")) {
    prompt += " Consider cosmic or existential dimensions.";
  }
  return { prompt };
}
