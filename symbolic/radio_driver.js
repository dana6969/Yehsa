import fs from "fs";
import { joinMesh, sendMeshSignal } from "../utils/mesh_utils.mjs";

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

export function receive(callback, options) {
  console.log("[📡 RADIO RX] Passive BLE listen. The active mesh link is left up.");
  const pending = joinMesh(options || {})
    .then((mesh) => {
      const message = {
        symbol: "echo",
        action: "return_ping",
        peers: mesh.peers,
        link: mesh.link,
        degraded: mesh.degraded,
        interfered: false
      };
      if (typeof callback === "function") callback(message);
      return message;
    })
    .catch((err) => {
      const message = {
        symbol: "echo",
        action: "return_ping",
        peers: [],
        degraded: true,
        interfered: false,
        error: err.message
      };
      if (typeof callback === "function") callback(message);
      return message;
    });
  return pending;
}
