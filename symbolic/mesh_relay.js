import { sendRaw } from "./radio_driver.js";

export function relayMeshCommand(message) {
  console.log(`[🔁 RELAY] Rebroadcasting:`, message);
  try { sendRaw(JSON.stringify(message)); } catch (err) { console.warn("⚠️ Relay failed:", err.message); }
}