// Turns a saved offline area into the same hillshade + contour layers the Map already draws.
// Reads tiles from this phone only.
import { decode as decodePng, encode as encodePng } from "fast-png";
import { contourGeoJSON, hillshadeRgba, terrariumGrid, tileBounds } from "../../symbolic/dem_tiles.js";
import { planArea } from "../../symbolic/area_download.js";
import { readTile } from "./area_store";

function dataUrl(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${globalThis.btoa(binary)}`;
}

export async function areaDemLayers(area, { zoom, maxTiles = 16 } = {}) {
  const plan = planArea({ box: area.box, zooms: area.zooms, layers: area.layers });
  if (!plan.ok) return { stored: [], demTiles: [], contours: { type: "FeatureCollection", features: [] } };
  const fits = plan.zooms.filter((level) => plan.tiles.filter((t) => t.z === level).length <= maxTiles);
  const z = zoom ?? (fits.length ? Math.max(...fits) : plan.zooms[0]);
  const stored = [];
  const lines = [];
  for (const tile of plan.tiles.filter((t) => t.z === z).slice(0, maxTiles)) {
    const bytes = await readTile(area.id, tile.key);
    if (!bytes) continue;
    const png = decodePng(bytes);
    const channels = png.channels || Math.round(png.data.length / (png.width * png.height));
    const rgba = channels === 4 ? png.data : new Uint8Array(png.width * png.height * 4);
    if (channels !== 4) {
      for (let p = 0; p < png.width * png.height; p += 1) {
        rgba[p * 4] = png.data[p * channels];
        rgba[p * 4 + 1] = png.data[p * channels + 1];
        rgba[p * 4 + 2] = png.data[p * channels + 2];
        rgba[p * 4 + 3] = 255;
      }
    }
    const elev = terrariumGrid(rgba, png.width, png.height);
    const encoded = encodePng({ width: png.width, height: png.height, data: hillshadeRgba(elev, png.width, png.height), channels: 4 });
    const bounds = tileBounds(tile.z, tile.x, tile.y);
    lines.push(...contourGeoJSON(elev, png.width, png.height, bounds, 100).features);
    stored.push({ z: tile.z, x: tile.x, y: tile.y, bounds, elev, width: png.width, height: png.height, url: dataUrl(encoded), png: encoded });
  }
  return {
    stored,
    demTiles: stored.map((t) => ({ url: t.url, bounds: t.bounds, z: t.z, x: t.x, y: t.y })),
    contours: { type: "FeatureCollection", features: lines.slice(0, 400) }
  };
}
