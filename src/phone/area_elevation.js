// Elevation at a point, from the saved areas on this phone. Reads one stored tile at most.
import { elevationAt, lonLatToTile, tileBounds } from "../../symbolic/dem_tiles.js";
import { decodeElevation } from "./area_render";

let cache = { key: null, grid: null };

export async function elevationFromAreas(areas, longitude, latitude) {
  for (const area of areas || []) {
    const box = area?.box;
    if (!box || !area.done?.length) continue;
    if (longitude < box.west || longitude > box.east || latitude < box.south || latitude > box.north) continue;
    const zoom = Math.max(...(area.zooms || [area.done[0]?.z || 8]));
    const tile = lonLatToTile(longitude, latitude, zoom);
    const tileKey = `terrain:${zoom}/${tile.x}/${tile.y}`;
    if (!area.done.includes(tileKey)) continue;
    const key = `${area.id}:${tileKey}`;
    if (cache.key !== key) cache = { key, grid: await decodeElevation(area.id, tileKey) };
    if (!cache.grid) continue;
    const meters = elevationAt(cache.grid.elev, cache.grid.width, cache.grid.height, tileBounds(zoom, tile.x, tile.y), longitude, latitude);
    if (meters != null) return meters;
  }
  return null;
}
