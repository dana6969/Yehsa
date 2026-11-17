// Read one tile out of a PMTiles or MBTiles archive. No network.

import { PMTiles, zxyToTileId } from "pmtiles";
import { mbtilesQuery } from "./dem_tiles.js";

class MemorySource {
  constructor(bytes) {
    this.bytes = bytes;
    this.key = `mem-${bytes.byteLength}-${bytes[0] || 0}`;
  }
  getKey() {
    return this.key;
  }
  async getBytes(offset, length) {
    const start = offset;
    const end = Math.min(this.bytes.byteLength, offset + length);
    const copy = this.bytes.slice(start, end);
    return { data: copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) };
  }
}

function writeVarint(value) {
  const out = [];
  let n = value;
  while (n > 127) {
    out.push((n & 127) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}

function setUint64(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
  view.setUint32(offset + 4, Math.floor(value / 2 ** 32), true);
}

export function writeRasterPmtiles(png, { z = 0, x = 0, y = 0, bounds } = {}) {
  const id = zxyToTileId(z, x, y);
  const directory = Uint8Array.from([
    ...writeVarint(1),
    ...writeVarint(id),
    ...writeVarint(1),
    ...writeVarint(png.length),
    ...writeVarint(1)
  ]);
  const meta = new TextEncoder().encode("{}");
  const headerSize = 127;
  const rootOffset = headerSize;
  const metaOffset = rootOffset + directory.length;
  const tileOffset = metaOffset + meta.length;
  const header = new Uint8Array(headerSize);
  const view = new DataView(header.buffer);
  header.set(new TextEncoder().encode("PMTiles"), 0);
  view.setUint8(7, 3);
  setUint64(view, 8, rootOffset);
  setUint64(view, 16, directory.length);
  setUint64(view, 24, metaOffset);
  setUint64(view, 32, meta.length);
  setUint64(view, 56, tileOffset);
  setUint64(view, 64, png.length);
  setUint64(view, 72, 1);
  setUint64(view, 80, 1);
  setUint64(view, 88, 1);
  view.setUint8(96, 1);
  view.setUint8(97, 1);
  view.setUint8(98, 1);
  view.setUint8(99, 2);
  view.setUint8(100, z);
  view.setUint8(101, z);
  const box = bounds || { west: -180, south: -85, east: 180, north: 85 };
  view.setInt32(102, Math.round(box.west * 1e7), true);
  view.setInt32(106, Math.round(box.south * 1e7), true);
  view.setInt32(110, Math.round(box.east * 1e7), true);
  view.setInt32(114, Math.round(box.north * 1e7), true);
  view.setUint8(118, z);
  const out = new Uint8Array(tileOffset + png.length);
  out.set(header, 0);
  out.set(directory, rootOffset);
  out.set(meta, metaOffset);
  out.set(png, tileOffset);
  return out;
}

export async function readPmTile(bytes, z, x, y) {
  const archive = new PMTiles(new MemorySource(bytes));
  const hit = await archive.getZxy(z, x, y);
  if (!hit?.data) return null;
  return new Uint8Array(hit.data);
}

export function mbtilesLookup(zoom, x, y) {
  return mbtilesQuery(zoom, x, y);
}

export { MemorySource };
