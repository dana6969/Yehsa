// Loopback-only tile server. It binds 127.0.0.1 and refuses any other peer.
// MapLibre on the phone asks this process for tiles. Nothing is published off the device.

import * as FileSystem from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { createServer } from "react-native-tcp-socket";
import { readPmTile } from "../../symbolic/archive_tiles.js";
import { mbtilesQuery } from "../../symbolic/dem_tiles.js";

const demTiles = new Map();
let archive = null;
let server = null;
let port = null;
let dbPromise = null;

function base64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return globalThis.btoa(binary);
}

async function mbtilesDb(bytes) {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const directory = FileSystem.documentDirectory;
    const name = "yehsa-pack.mbtiles";
    await FileSystem.writeAsStringAsync(`${directory}${name}`, base64(bytes), { encoding: "base64" });
    return SQLite.openDatabaseAsync(name, {}, directory);
  })();
  return dbPromise;
}

async function tileBytes(z, x, y) {
  if (!archive?.bytes) return null;
  if (archive.format === "pmtiles") return readPmTile(archive.bytes, z, x, y);
  if (archive.format === "mbtiles") {
    const db = await mbtilesDb(archive.bytes);
    const query = mbtilesQuery(z, x, y);
    const row = await db.getFirstAsync(query.sql, ...query.args);
    const blob = row?.tile_data;
    if (!blob) return null;
    return blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  }
  return null;
}

function writeHttp(socket, status, body, type) {
  const header = `HTTP/1.1 ${status}\r\nContent-Type: ${type}\r\nContent-Length: ${body ? body.length : 0}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n`;
  socket.write(header);
  if (body) socket.write(body);
  socket.destroy();
}

export function publishArchive(next) {
  archive = next?.bytes ? { bytes: next.bytes, format: next.format } : null;
  dbPromise = null;
}

export function publishDem(tiles) {
  demTiles.clear();
  for (const tile of tiles || []) {
    if (tile.png) demTiles.set(`${tile.z}/${tile.x}/${tile.y}`, tile.png);
  }
}

export function startTileServer() {
  if (port) return Promise.resolve(port);
  if (server) {
    return new Promise((resolve) => {
      const wait = setInterval(() => {
        if (port) {
          clearInterval(wait);
          resolve(port);
        }
      }, 30);
    });
  }
  return new Promise((resolve, reject) => {
    server = createServer((socket) => {
      const peer = socket.remoteAddress || "";
      if (peer && peer !== "127.0.0.1" && peer !== "::ffff:127.0.0.1" && peer !== "::1") {
        socket.destroy();
        return;
      }
      let buf = Buffer.alloc(0);
      socket.on("data", async (chunk) => {
        buf = Buffer.concat([buf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
        const headerEnd = buf.indexOf("\r\n\r\n");
        if (headerEnd < 0) return;
        const line = buf.slice(0, buf.indexOf("\r\n")).toString("latin1");
        const path = (line.split(" ")[1] || "/").split("?")[0];
        const parts = path.split("/").filter(Boolean);
        try {
          if (parts[0] === "dem") {
            const key = `${parts[1]}/${parts[2]}/${String(parts[3] || "").replace(".png", "")}`;
            const body = demTiles.get(key);
            if (!body) writeHttp(socket, "404 Not Found", null, "text/plain");
            else writeHttp(socket, "200 OK", body, "image/png");
            return;
          }
          if (parts[0] === "pack") {
            const body = await tileBytes(Number(parts[1]), Number(parts[2]), Number(String(parts[3] || "").replace(/\..*$/, "")));
            if (!body) writeHttp(socket, "404 Not Found", null, "text/plain");
            else writeHttp(socket, "200 OK", body, "image/png");
            return;
          }
        } catch {
          writeHttp(socket, "404 Not Found", null, "text/plain");
          return;
        }
        writeHttp(socket, "404 Not Found", null, "text/plain");
      });
    });
    server.on("error", (err) => reject(err));
    server.listen({ port: 0, host: "127.0.0.1" }, () => {
      port = server.address()?.port || null;
      if (!port) reject(new Error("The local map server did not bind."));
      else resolve(port);
    });
  });
}
