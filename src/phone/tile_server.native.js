// Loopback-only tile server. It binds 127.0.0.1 and refuses any other peer.
// MapLibre on the phone asks this process for tiles. Nothing is published off the device.
//   /pack/{z}/{x}/{y}  raster tiles from the MBTiles packs on this phone (merged)
//   /area/{z}/{x}/{y}  drawn terrain tiles of the areas saved with "Download this area"
// Tiles are read from disk one at a time. No pack is ever loaded whole into memory.

import { createServer } from "react-native-tcp-socket";
import { handleRequest, isLoopback } from "../../symbolic/tile_http.js";
import { createPackTiles, tileTouches } from "../../symbolic/pack_tiles.js";
import { openMbtiles } from "./pack_files";
import { readRender } from "./area_store";
import { glyphRange } from "../../symbolic/roads.js";

const packTiles = createPackTiles();
const open = new Map(); // pack id -> Promise<reader>
let areaList = [];
let server = null;
let port = null;

function latin1(chunk) {
  let text = "";
  for (let i = 0; i < chunk.length; i += 1) text += String.fromCharCode(chunk[i] & 0xff);
  return text;
}

// Opens the MBTiles of every pack on the phone and closes the ones that were removed.
export async function publishPacks(packs) {
  const wanted = (packs || []).filter((pack) => pack.kind === "mbtiles" || (pack.format === "mbtiles" && pack.file));
  const ids = new Set(wanted.map((pack) => pack.id));
  for (const [id, pending] of [...open.entries()]) {
    if (!ids.has(id)) {
      open.delete(id);
      pending.then((reader) => reader?.close?.()).catch(() => {});
    }
  }
  const list = [];
  for (const pack of wanted) {
    if (!open.has(pack.id)) {
      open.set(pack.id, openMbtiles(pack.id).catch(() => null));
    }
    const reader = await open.get(pack.id);
    if (!reader) {
      open.delete(pack.id);
      continue;
    }
    list.push({ id: pack.id, bounds: pack.bounds || null, minZoom: pack.minZoom, maxZoom: pack.maxZoom, getTile: reader.getTile });
  }
  packTiles.set(list);
  return list.length;
}

export function publishAreas(areas) {
  areaList = (areas || []).filter((area) => area && area.rendered && area.box);
}

async function areaTile(z, x, y) {
  for (const area of areaList) {
    const zooms = area.zooms || [];
    if (!zooms.includes(z)) continue;
    if (!tileTouches({ west: area.box.west, south: area.box.south, east: area.box.east, north: area.box.north }, z, x, y)) continue;
    const bytes = await readRender(area.id, z, x, y);
    if (bytes) return bytes;
  }
  return null;
}

const providers = {
  pack: (z, x, y) => packTiles.get(z, x, y),
  area: areaTile,
  // The font for road names on the map, bundled in the app.
  glyphs: async (fontstack, range) => glyphRange(fontstack, range)
};

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
      if (!isLoopback(socket.remoteAddress)) {
        socket.destroy();
        return;
      }
      let head = "";
      let handled = false;
      socket.on("error", () => {});
      socket.on("data", async (chunk) => {
        if (handled) return;
        head += latin1(chunk);
        if (head.indexOf("\r\n\r\n") < 0) {
          if (head.length > 16384) socket.destroy();
          return;
        }
        handled = true;
        const reply = await handleRequest(head, providers);
        try {
          socket.write(reply, undefined, () => socket.end());
        } catch {
          socket.destroy();
        }
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
