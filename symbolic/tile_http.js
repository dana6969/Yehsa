// The loopback tile server's brains: read one HTTP request, route it, build the reply.
// No sockets here, so node tests can drive it the same way the phone's socket does.
// The phone binds 127.0.0.1 only. Nothing here is reachable from another device.

export function parseRequest(text) {
  const line = String(text || "").split("\r\n")[0] || "";
  const [method, target] = line.split(" ");
  const path = String(target || "/").split("?")[0];
  return { method: method || "GET", path };
}

// /pack/{z}/{x}/{y}  merged raster packs   /area/{z}/{x}/{y}  saved offline areas
export function routeTile(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  if (parts.length !== 4 || (parts[0] !== "pack" && parts[0] !== "area")) return null;
  const z = Number(parts[1]);
  const x = Number(parts[2]);
  const y = Number(String(parts[3]).replace(/\.[a-z0-9]+$/i, ""));
  if (![z, x, y].every((n) => Number.isInteger(n) && n >= 0)) return null;
  if (z > 22 || x >= 2 ** z || y >= 2 ** z) return null;
  return { kind: parts[0], z, x, y };
}

export function contentTypeFor(bytes) {
  if (!bytes || bytes.length < 12) return "application/octet-stream";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return "application/octet-stream";
}

const REASONS = { 200: "OK", 400: "Bad Request", 404: "Not Found", 405: "Method Not Allowed", 500: "Internal Server Error" };

// One buffer, so a socket does one write and the tile is never split from its header.
export function buildResponse(status, body, type = "text/plain") {
  const length = body ? body.length : 0;
  const head = `HTTP/1.1 ${status} ${REASONS[status] || "OK"}\r\nContent-Type: ${type}\r\nContent-Length: ${length}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n`;
  const headBytes = new Uint8Array(head.length);
  for (let i = 0; i < head.length; i += 1) headBytes[i] = head.charCodeAt(i) & 0xff;
  const out = new Uint8Array(headBytes.length + length);
  out.set(headBytes, 0);
  if (length) out.set(body, headBytes.length);
  return out;
}

// providers: { pack(z, x, y) -> Promise<Uint8Array|null>, area(z, x, y) -> Promise<Uint8Array|null> }
export async function handleRequest(text, providers) {
  const { method, path } = parseRequest(text);
  if (method !== "GET") return buildResponse(405, null);
  const route = routeTile(path);
  if (!route) return buildResponse(404, null);
  try {
    const body = await providers[route.kind]?.(route.z, route.x, route.y);
    if (!body || !body.length) return buildResponse(404, null);
    return buildResponse(200, body, contentTypeFor(body));
  } catch {
    return buildResponse(404, null);
  }
}

// Is this socket a peer on this phone?
export function isLoopback(address) {
  return !address || address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

// Finds the first complete request in bytes that have arrived so far, or null.
export function requestHeadFrom(chunks) {
  const text = typeof chunks === "string" ? chunks : String.fromCharCode(...chunks);
  const end = text.indexOf("\r\n\r\n");
  return end < 0 ? null : text.slice(0, end);
}
