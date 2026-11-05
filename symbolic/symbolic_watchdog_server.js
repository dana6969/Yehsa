import net from "net";
import { receiveMeshCommand } from "./mesh_listener.js";
import { allowlistedSymbol, bindHost, meshToken, tokenMatches } from "./mesh_guard.js";

const MAX_BYTES = 8192;
const port = Number(process.env.YEHSA_WATCHDOG_PORT || 3175);
const host = bindHost();

function reject(socket, error) {
  socket.write(`${JSON.stringify({ ok: false, error })}\n`);
}

const server = net.createServer((socket) => {
  socket.on("data", (data) => {
    if (data.length > MAX_BYTES) {
      reject(socket, "payload too large");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(data.toString("utf8"));
    } catch {
      reject(socket, "invalid json");
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      reject(socket, "invalid schema");
      return;
    }
    if (parsed.action !== undefined && typeof parsed.action !== "string") {
      reject(socket, "invalid schema");
      return;
    }
    if (!meshToken() || typeof parsed.token !== "string" || !tokenMatches(parsed.token)) {
      reject(socket, "unauthorized");
      return;
    }

    const allowed = allowlistedSymbol(parsed.symbol);
    if (!allowed) {
      reject(socket, "symbol is missing or not allowlisted");
      return;
    }

    console.log(`[WATCHDOG RX] ${allowed.symbol} → ${allowed.action}`);
    receiveMeshCommand({ symbol: allowed.symbol, action: allowed.action });
    socket.write(`${JSON.stringify({ ok: true, symbol: allowed.symbol })}\n`);
  });
});

if (!meshToken()) {
  console.error("YEHSA_MESH_TOKEN is not set. Watchdog connections will be rejected.");
}

server.listen(port, host, () => {
  console.log(`Yehsa Mesh Watchdog listening on ${host}:${port}`);
});
