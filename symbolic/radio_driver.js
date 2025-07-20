export function sendRaw(symbol, action) {
  console.log(`[📡 RADIO TX] Symbol: "${symbol}" → Action: "${action}" sent over mesh.`);
}
export function receive(callback) {
  console.log("[📡 RADIO RX] Listening for mesh input...");
  setTimeout(() => callback({ symbol: "echo", action: "return_ping" }), 3000);
}
