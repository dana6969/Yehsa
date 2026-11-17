// Draws one Terrarium elevation tile as a map tile: color by height, hillshade, contour lines.
// Pure typed-array code (no canvas), so it runs the same in Hermes and in node tests.
// Used for "Download this area". It replaces the old path that kept one coarse zoom and
// drew a few hundred two-point contour scraps.

import { terrariumGrid } from "./dem_tiles.js";

export const TILE_PX = 256;

// Height bands (meters) to color. Muted topographic palette that reads on dark and light screens.
const RAMP = [
  [0, [154, 190, 140]],
  [150, [182, 204, 150]],
  [400, [214, 214, 168]],
  [800, [212, 192, 150]],
  [1400, [190, 172, 148]],
  [2400, [196, 190, 184]],
  [3600, [244, 244, 246]]
];
const WATER = [138, 180, 214];

function rampColor(meters) {
  if (meters <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i += 1) {
    if (meters <= RAMP[i][0]) {
      const [h0, c0] = RAMP[i - 1];
      const [h1, c1] = RAMP[i];
      const t = (meters - h0) / (h1 - h0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export function contourInterval(z) {
  if (z >= 12) return 10;
  if (z === 11) return 20;
  if (z === 10) return 50;
  if (z === 9) return 100;
  if (z === 8) return 200;
  return 0;
}

// Joins a tile with its eight neighbors (each may be null) into one (w+2)x(h+2) grid, so
// the hillshade and contour lines carry across tile edges with no seam.
// get(dx, dy) returns a Float32Array of w*h or null.
export function paddedGrid(get, width = TILE_PX, height = TILE_PX) {
  const w = width + 2;
  const h = height + 2;
  const out = new Float32Array(w * h);
  const center = get(0, 0);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const gx = x - 1;
      const gy = y - 1;
      const dx = gx < 0 ? -1 : gx >= width ? 1 : 0;
      const dy = gy < 0 ? -1 : gy >= height ? 1 : 0;
      const tile = dx === 0 && dy === 0 ? center : get(dx, dy);
      const lx = gx - dx * width;
      const ly = gy - dy * height;
      let value;
      if (tile) value = tile[ly * width + lx];
      else {
        // Missing neighbor: repeat the nearest edge of this tile.
        const cx = Math.min(width - 1, Math.max(0, gx));
        const cy = Math.min(height - 1, Math.max(0, gy));
        value = center ? center[cy * width + cx] : 0;
      }
      out[y * w + x] = value;
    }
  }
  return out;
}

// elev: padded grid (width+2)x(height+2) in meters. Returns RGBA bytes width*height*4.
export function renderTerrainRgba(elev, { width = TILE_PX, height = TILE_PX, z = 10, latitude = 45 } = {}) {
  const w = width + 2;
  const out = new Uint8ClampedArray(width * height * 4);
  const cell = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** z; // meters per pixel
  const zf = z >= 10 ? 2.2 : z >= 8 ? 3 : 4.5;
  const zen = (48 * Math.PI) / 180;
  const az = (315 * Math.PI) / 180;
  const flat = Math.cos(zen);
  const interval = contourInterval(z);
  const index = interval * 5;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y + 1) * w + (x + 1);
      const e = elev[i];
      const dzdx = ((elev[i + 1] - elev[i - 1]) / (2 * cell)) * zf;
      const dzdy = ((elev[i + w] - elev[i - w]) / (2 * cell)) * zf;
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      let shade = Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(az - aspect);
      shade = Math.min(1.28, Math.max(0.42, 1 + (Math.min(1, Math.max(0, shade)) - flat) * 1.55));
      let r;
      let g;
      let b;
      const sea = e < -0.5;
      if (sea) {
        [r, g, b] = WATER;
      } else {
        const c = rampColor(e);
        r = c[0] * shade;
        g = c[1] * shade;
        b = c[2] * shade;
        if (interval) {
          const band = Math.floor(e / interval);
          const edgeX = Math.floor(elev[i + 1] / interval) !== band;
          const edgeY = Math.floor(elev[i + w] / interval) !== band;
          if ((edgeX || edgeY) && e > 0) {
            const isIndex = Math.floor(e / index) !== Math.floor(elev[i + 1] / index) || Math.floor(e / index) !== Math.floor(elev[i + w] / index);
            const a = isIndex ? 0.75 : 0.45;
            r = r * (1 - a) + 112 * a;
            g = g * (1 - a) + 72 * a;
            b = b * (1 - a) + 40 * a;
          }
        }
      }
      const o = (y * width + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
  return out;
}

export function tileLatitude(z, y) {
  const n = Math.PI - (2 * Math.PI * (y + 0.5)) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// Convenience for callers that have decoded Terrarium RGBA tiles.
export function elevationFromRgba(rgba, width, height) {
  return terrariumGrid(rgba, width, height);
}
