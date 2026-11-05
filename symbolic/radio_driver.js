import fs from "fs";
import { sendMeshSignal } from "../utils/mesh_utils.mjs";

function normalizeSend(symbol, action) {
  if (action === undefined && symbol && typeof symbol === "object") {
    return { symbol: symbol.symbol, action: symbol.action };
  }
  if (action === undefined && typeof symbol === "string") {
    try {
      const parsed = JSON.parse(symbol);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { symbol: parsed.symbol, action: parsed.action };
      }
    } catch {
      // Caller passed a raw symbol string.
    }
  }
  return { symbol, action };
}

export function sendRaw(symbol, action) {
  const message = normalizeSend(symbol, action);
  const payload = { channel: "radio", ...message, queuedAt: Date.now() };
  fs.appendFileSync("symbolic_memory/mesh_queue.jsonl", `${JSON.stringify(payload)}\n`);
  sendMeshSignal(payload);
  console.log(`[📡 RADIO TX] Symbol: "${message.symbol}" → Action: "${message.action}" queued.`);
}

export function receive(callback) {
  console.log("[📡 RADIO RX] Listening for mesh input...");
  setTimeout(() => callback({ symbol: "echo", action: "return_ping" }), 3000);
}
