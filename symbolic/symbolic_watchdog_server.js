import net from "net";
import { receiveMeshCommand } from "./mesh_listener.js";
import { admitLocalIngress, bindHost, isLoopbackAddress, meshToken } from "./mesh_guard.js";

const MAX_BYTES = 8192;
const port = Number(process.env.YEHSA_WATCHDOG_PORT || 3175);
const host = bindHost();

function reject(socket, error) {
  socket.write(`${JSON.stringify({ ok: false, error })}\n`);
}

const server = net.createServer((socket) => {
  socket.on("data", (data) => {
    if (!isLoopbackAddress(socket.remoteAddress)) {
      reject(socket, "exterior denied");
      socket.destroy();
      return;
    }
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
    const decision = admitLocalIngress({
      remoteAddress: socket.remoteAddress,
      presentedToken: parsed.token,
      symbol: parsed.symbol
    });
    if (!decision.ok) {
      reject(socket, decision.error);
      return;
    }

    console.log(`[WATCHDOG RX] ${decision.symbol} → ${decision.action}`);
    receiveMeshCommand({
      symbol: decision.symbol,
      action: decision.action,
      localOwner: true,
      ingress: "loopback"
    });
    socket.write(`${JSON.stringify({ ok: true, symbol: decision.symbol })}\n`);
  });
});

if (!host) {
  console.error("Exterior bind denied. Watchdog does not listen. Bind stays 127.0.0.1.");
} else {
  if (!meshToken()) {
    console.error("YEHSA_MESH_TOKEN is not set. Watchdog connections will be rejected.");
  }
  server.listen(port, host, () => {
    console.log(`Yehsa Mesh Watchdog listening on ${host}:${port} (this device, exterior denied)`);
  });
}
