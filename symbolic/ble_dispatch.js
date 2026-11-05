import fs from "fs";
import { discoverMeshPeers, joinMesh, sendMeshSignal } from "../utils/mesh_utils.mjs";

const QUEUE = "symbolic_memory/mesh_queue.jsonl";

// Fast path. Queue and send on the link already held. A symbol dispatch does
// not scan and does not open or close a Bluetooth session.
export function dispatchSymbol(symbol) {
  const payload = { channel: "ble", symbol, queuedAt: Date.now() };
  fs.appendFileSync(QUEUE, `${JSON.stringify(payload)}\n`);
  sendMeshSignal(payload);
  return payload;
}

export function discoverBlePeers(options) {
  return discoverMeshPeers(options);
}

export function joinBleMesh(options) {
  return joinMesh(options);
}
