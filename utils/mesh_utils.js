import { exec } from "child_process";

export function sendMeshSignal(data) {
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64");
  exec(`termux-bluetooth-send --data ${encoded}`, (err, stdout, stderr) => {
    if (err) {
      console.error("[Mesh Error]", err);
    } else {
      console.log("[Mesh Sent]", data);
    }
  });
}
