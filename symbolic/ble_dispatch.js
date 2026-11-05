import fs from "fs";
import { sendMeshSignal } from "../utils/mesh_utils.mjs";

const QUEUE = "symbolic_memory/mesh_queue.jsonl";

export function dispatchSymbol(symbol) {
  const payload = { channel: "ble", symbol, queuedAt: Date.now() };
  fs.appendFileSync(QUEUE, `${JSON.stringify(payload)}\n`);
  sendMeshSignal(payload);
  return payload;
}
