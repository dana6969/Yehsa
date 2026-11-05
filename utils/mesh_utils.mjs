import { execFile } from "child_process";

const MAX_PAYLOAD_BYTES = 16 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const sentSet = new Set();

export function sendMeshSignal(data) {
  const key = JSON.stringify(data);
  if (key === undefined) {
    console.error("[Mesh Error] payload is not JSON-serializable");
    return;
  }
  if (sentSet.has(key)) {
    console.log("[🛑 DUPLICATE TX]", key);
    return;
  }

  const payload = Buffer.from(key, "utf8");
  if (payload.length === 0 || payload.length > MAX_PAYLOAD_BYTES) {
    console.error("[Mesh Error] payload empty or larger than 16KB");
    return;
  }

  const encoded = payload.toString("base64");
  if (!BASE64_RE.test(encoded) || encoded.length > MAX_PAYLOAD_BYTES * 2) {
    console.error("[Mesh Error] encoded payload failed charset or size check");
    return;
  }

  sentSet.add(key);
  execFile("termux-bluetooth-send", ["--data", encoded], (err) => {
    if (err) {
      console.error("[Mesh Error]", err);
    } else {
      console.log("[Mesh Sent]", data);
    }
  });
}
