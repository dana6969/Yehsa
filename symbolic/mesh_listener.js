import fs from "fs";
import http from "http";
import { executeSymbol } from "./symbolic_action_executor.js";

function meshRelay(symbol, cb) {
  if (typeof symbol !== "string" || !symbol) {
    cb(new Error("missing symbol"));
    return;
  }
  try {
    const req = http.get(`http://127.0.0.1:3175/${encodeURIComponent(symbol)}`, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => cb(null, data));
    });
    req.on("error", (err) => cb(err));
  } catch (err) {
    cb(err);
  }
}

/**
 * Restored pre-benchmark mesh receive path (parent of 38d9e6d / 42fa337),
 * including the fd11722 mesh log. The benchmark commit had reduced this to a
 * one-line echo that dropped the relay.
 */
export function receiveMeshCommand(message = {}) {
  // Mesh and BLE peers are outside this install. Only a loopback admission
  // from the local owner may execute a symbol here.
  if (message.localOwner !== true || message.ingress !== "loopback") {
    console.warn("[exterior denied] refusing mesh command into this device");
    return { ok: false, error: "exterior denied" };
  }
  const symbol = message.symbol;
  const action = message.action;
  console.log(`[📥 MESH RX] Received: ${symbol} → ${action}`);
  try {
    fs.appendFileSync("./symbolic_memory/mesh_log.json", `${JSON.stringify({ symbol, action })}\n`);
  } catch (err) {
    console.warn(`[⚠️ Mesh Log Error] ${err.message}`);
  }
  if (typeof symbol === "string" && symbol) {
    executeSymbol(symbol);
  }
  meshRelay(symbol, (err, msg) => {
    if (err) console.warn(`[⚠️ Mesh Relay Error] ${err.message}`);
    else console.log(`[📡 Relay Response] ${msg}`);
  });
}
