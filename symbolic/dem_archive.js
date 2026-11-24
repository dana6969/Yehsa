// The bundled terrain elevation (Terrarium, WebP lossless, 2 m steps) for the map-pack states,
// zoom 5 to 9: one archive file (assets/dem/yehsa_dem_terrain.ydm) and this index of byte ranges.
// MapLibre draws hillshade from it (raster-dem, overzoomed past 9), so Terrain shading works
// offline with no download. Pure: no file access here.
import INDEX from "./dem_index.js";

export const DEM_MIN_ZOOM = INDEX.minZoom;
export const DEM_MAX_ZOOM = INDEX.maxZoom;
export const DEM_ATTRIBUTION = `Terrain shading: ${INDEX.source}.`;

export function demRange(z, x, y, index = INDEX) {
  const hit = index.tiles[`${z}/${x}/${y}`];
  return hit ? { offset: hit[0], length: hit[1] } : null;
}

export function demTileCount(index = INDEX) {
  return Object.keys(index.tiles).length;
}
