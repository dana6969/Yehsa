import fs from "fs";

export function dispatchPhysical(symbol) {
  const payload = {
    channel: "local",
    symbol,
    queuedAt: Date.now(),
    note: "Logged only. No device control is performed."
  };
  fs.appendFileSync("symbolic_memory/mesh_queue.jsonl", `${JSON.stringify(payload)}\n`);
  console.log(`[local trigger] ${symbol}`);
  return payload;
}
