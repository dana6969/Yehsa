import fs from "fs";
import { relayMeshCommand } from "./mesh_relay.js";

export function sendMeshAction(symbol, action) {
  const payload = { symbol, action, timestamp: Date.now() };
  console.log(`[📡 DISPATCH] ${symbol} → ${action}`);
  fs.appendFileSync("./symbolic_memory/mesh_log.json", JSON.stringify(payload) + "\n");
  relayMeshCommand(payload);
}