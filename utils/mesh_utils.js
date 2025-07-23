import { exec } from "child_process";

export function sendMeshSignal(data) {
const sentSet = new Set();
  const key = JSON.stringify(data);
  if (sentSet.has(key)) return console.log(`[🛑 DUPLICATE TX]`, key);
  sentSet.add(key);
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64");
  exec(`termux-bluetooth-send --data ${encoded}`, (err, stdout, stderr) => {
    if (err) {
      console.error("[Mesh Error]", err);
    } else {
      console.log("[Mesh Sent]", data);
    }
  });
}
