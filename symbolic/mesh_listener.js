import fs from "fs";
import { executeSymbol } from "./symbolic_action_executor.js";

export function receiveMeshCommand(message) {
  const { symbol, action } = message;
  console.log(`[📥 MESH RX] Received: ${symbol} → ${action}`);
  fs.appendFileSync("./symbolic_memory/mesh_log.json", JSON.stringify(message) + "\n");
  executeSymbol(symbol);
}