import { runProtocol } from "./autonomic_protocols.js";

export async function routeTrigger(symbol, context) {
  const key = String(symbol || "").toLowerCase();
  if (key.includes("fear") || key === "😱") return runProtocol("fear", context || symbol);
  if (key === "unlock") return runProtocol("unlock", context || symbol);
  const { execute } = await import("./symbolic_action_executor.js");
  return { symbol, result: execute(symbol), source: "executor" };
}
