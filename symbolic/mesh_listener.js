import http from "http";
import { executeSymbol } from "./symbolic_action_executor.js";

const meshRelay = (symbol, cb) => {
  try {
    const req = http.get("http://localhost:3175/" + encodeURIComponent(symbol), (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => cb(null, data));
    });
    req.on("error", (err) => cb(err));
  } catch (e) {
    cb(e);
  }
};

export async function receiveMeshCommand({ symbol }) {
  console.log(`[📥 MESH RX] Received: ${symbol} → undefined`);
  executeSymbol(symbol);
  meshRelay(symbol, (err, msg) => {
    if (err) console.warn(`[⚠️ Mesh Relay Error] ${err.message}`);
    else console.log(`[📡 Relay Response] ${msg}`);
  });
}
