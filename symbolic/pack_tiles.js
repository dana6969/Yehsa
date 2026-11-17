// Finds a raster tile across every pack on the phone. Pure: each pack brings its own
// getTile(z, x, y) (the phone passes a SQLite reader, tests pass a map).

import { tileBounds } from "./dem_tiles.js";

export function tileTouches(bounds, z, x, y) {
  if (!bounds) return true;
  const b = tileBounds(z, x, y);
  return !(b.east < bounds.west || b.west > bounds.east || b.north < bounds.south || b.south > bounds.north);
}

function areaOf(bounds) {
  if (!bounds) return Infinity;
  return Math.max(0, bounds.east - bounds.west) * Math.max(0, bounds.north - bounds.south);
}

export function createPackTiles() {
  let sources = [];
  return {
    // list: [{ id, bounds, minZoom, maxZoom, getTile }]
    set(list) {
      sources = [...list].sort((a, b) => areaOf(a.bounds) - areaOf(b.bounds));
    },
    ids: () => sources.map((s) => s.id),
    async get(z, x, y) {
      for (const source of sources) {
        if (Number.isFinite(source.minZoom) && z < source.minZoom) continue;
        if (Number.isFinite(source.maxZoom) && z > source.maxZoom) continue;
        if (!tileTouches(source.bounds, z, x, y)) continue;
        const bytes = await source.getTile(z, x, y);
        if (bytes && bytes.length) return bytes;
      }
      return null;
    }
  };
}
