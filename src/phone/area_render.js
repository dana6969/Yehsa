// Draws a downloaded area: for every elevation tile, a colored, hillshaded, contoured tile
// saved beside it. The map then serves those files, at every zoom that was downloaded.
// Heavy work yields to the screen between tiles, so it cannot freeze the phone.

import { decode as decodePng, encode as encodePng } from "fast-png";
import { terrariumGrid } from "../../symbolic/dem_tiles.js";
import { planArea } from "../../symbolic/area_download.js";
import { paddedGrid, renderTerrainRgba, tileLatitude } from "../../symbolic/terrain_render.js";
import { readTile, saveRender } from "./area_store";

const yieldFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

function toRgba(png) {
  const channels = png.channels || Math.round(png.data.length / (png.width * png.height));
  if (channels === 4) return png.data;
  const rgba = new Uint8Array(png.width * png.height * 4);
  for (let p = 0; p < png.width * png.height; p += 1) {
    rgba[p * 4] = png.data[p * channels];
    rgba[p * 4 + 1] = png.data[p * channels + 1];
    rgba[p * 4 + 2] = png.data[p * channels + 2];
    rgba[p * 4 + 3] = 255;
  }
  return rgba;
}

export async function decodeElevation(areaId, key) {
  const bytes = await readTile(areaId, key);
  if (!bytes) return null;
  const png = decodePng(bytes);
  return { elev: terrariumGrid(toRgba(png), png.width, png.height), width: png.width, height: png.height };
}

// Draws every done tile of the area. onProgress({ done, total }). Resolves { renderBytes, drawn }.
export async function renderArea(area, { onProgress, signal } = {}) {
  const plan = planArea({ box: area.box, zooms: area.zooms, layers: area.layers });
  if (!plan.ok) return { renderBytes: 0, drawn: 0 };
  const have = new Set(area.done || []);
  const tiles = plan.tiles.filter((tile) => have.has(tile.key));
  const cache = new Map();
  async function elevOf(tile) {
    const key = `terrain:${tile.z}/${tile.x}/${tile.y}`;
    if (!have.has(key)) return null;
    if (cache.has(key)) return cache.get(key);
    const decoded = await decodeElevation(area.id, key);
    cache.set(key, decoded);
    if (cache.size > 24) cache.delete(cache.keys().next().value);
    return decoded;
  }
  let renderBytes = 0;
  let drawn = 0;
  for (let index = 0; index < tiles.length; index += 1) {
    if (signal?.aborted) break;
    await yieldFrame();
    const tile = tiles[index];
    const center = await elevOf(tile);
    if (!center) continue;
    const near = new Map();
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const n = 2 ** tile.z;
        const other = await elevOf({ z: tile.z, x: ((tile.x + dx) % n + n) % n, y: Math.min(n - 1, Math.max(0, tile.y + dy)) });
        near.set(`${dx},${dy}`, other && other.width === center.width ? other.elev : null);
      }
    }
    await yieldFrame();
    const grid = paddedGrid((dx, dy) => (dx === 0 && dy === 0 ? center.elev : near.get(`${dx},${dy}`)), center.width, center.height);
    const rgba = renderTerrainRgba(grid, { width: center.width, height: center.height, z: tile.z, latitude: tileLatitude(tile.z, tile.y) });
    await yieldFrame();
    const png = encodePng({ width: center.width, height: center.height, data: new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length), channels: 4 });
    await saveRender(area.id, tile.z, tile.x, tile.y, png);
    renderBytes += png.length;
    drawn += 1;
    onProgress?.({ done: index + 1, total: tiles.length });
  }
  return { renderBytes, drawn };
}
