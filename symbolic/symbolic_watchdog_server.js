import net from "net";
import { receiveMeshCommand } from "./mesh_listener.js";

const server = net.createServer((socket) => {
  socket.on("data", (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.symbol && parsed.action) {
        console.log(`🛡️ [WATCHDOG RX] ${parsed.symbol} → ${parsed.action}`);
        receiveMeshCommand(parsed);
      }
    } catch (err) {
      console.error("❌ Invalid data:", data.toString());
    }
  });
});

server.listen(3175, () => {
  console.log("🛡️ Yehsa Mesh Watchdog running on port 3175");
});

