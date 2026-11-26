// Open elevation tiles. No network here. A fetch happens only after approval.

export function terrariumMeters(red, green, blue) {
  return red * 256 + green + blue / 256 - 32768;
}

export function lonLatToTile(longitude, latitude, zoom) {
  const z = Math.max(0, Math.min(12, zoom | 0));
  const n = 2 ** z;
  const x = Math.floor((Number(longitude) + 180) / 360 * n);
  const lat = Number(latitude) * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * n);
  return {
    z,
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y))
  };
}

export function tmsRow(zoom, y) {
  return (2 ** zoom) - 1 - y;
}

export function tileBounds(z, x, y) {
  const n = 2 ** z;
  const west = x / n * 360 - 180;
  const east = (x + 1) / n * 360 - 180;
  const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
  return { west, south, east, north };
}

export const DEM_SOURCE = "AWS open terrain tiles, Terrarium encoding, imagery source ETOPO1. Public domain. May be out of date.";
export const DEM_ATTRIBUTION = "Elevation: ETOPO1 / Terrarium, AWS Open Data.";

export function tilesForBox(box, zoom) {
  const nw = lonLatToTile(box.west, box.north, zoom);
  const se = lonLatToTile(box.east, box.south, zoom);
  const tiles = [];
  const x0 = Math.min(nw.x, se.x);
  const x1 = Math.max(nw.x, se.x);
  const y0 = Math.min(nw.y, se.y);
  const y1 = Math.max(nw.y, se.y);
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) tiles.push({ z: zoom, x, y });
  }
  return tiles;
}

export function regionBox(around) {
  const radius = Number(around?.radiusKm) || 40;
  const latitude = Number(around?.latitude) || 0;
  const longitude = Number(around?.longitude) || 0;
  const dLat = radius / 111;
  const dLon = radius / (111 * Math.max(0.2, Math.cos(latitude * Math.PI / 180)));
  return {
    south: latitude - dLat,
    north: latitude + dLat,
    west: longitude - dLon,
    east: longitude + dLon
  };
}

export function planDemRegion({ approved, box, around, zoom = 8 } = {}) {
  const area = box || regionBox(around);
  let tiles = tilesForBox(area, zoom);
  if (tiles.length < 4) tiles = tilesForBox(area, Math.min(12, zoom + 1));
  tiles = tiles.slice(0, 16);
  const bytes = tiles.length * 120 * 1024;
  const urls = tiles.map((tile) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${tile.z}/${tile.x}/${tile.y}.png`);
  const summary = `${tiles.length} elevation tiles, about ${Math.round(bytes / 1024)} KB, around the chosen area. ${DEM_SOURCE}`;
  if (approved !== true) {
    return { fetch: false, tiles, urls, bytes, attribution: DEM_ATTRIBUTION, reason: `${summary} Nothing is downloaded until you approve.` };
  }
  return { fetch: true, tiles, urls, bytes, attribution: DEM_ATTRIBUTION, reason: null };
}

export function hillshadeShade(dzdx, dzdy) {
  const slope = Math.atan(Math.hypot(dzdx, dzdy) / 30);
  const aspect = Math.atan2(dzdy, -dzdx);
  const light = Math.cos(slope) * 0.55 + Math.sin(slope) * Math.cos(aspect - Math.PI / 4) * 0.45;
  return Math.max(0, Math.min(1, light));
}

export function contourSegments(grid, width, height, level) {
  const segments = [];
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const a = grid[y * width + x];
      const b = grid[y * width + x + 1];
      const c = grid[(y + 1) * width + x];
      const d = grid[(y + 1) * width + x + 1];
      const edges = [];
      if ((a - level) * (b - level) < 0) edges.push([(x + (level - a) / (b - a)), y]);
      if ((a - level) * (c - level) < 0) edges.push([x, y + (level - a) / (c - a)]);
      if ((b - level) * (d - level) < 0) edges.push([x + 1, y + (level - b) / (d - b)]);
      if ((c - level) * (d - level) < 0) edges.push([x + (level - c) / (d - c), y + 1]);
      if (edges.length >= 2) segments.push([edges[0], edges[1]]);
    }
  }
  return segments;
}

export function planDemDownload({ approved, latitude = 0, longitude = 0, zoom = 6 } = {}) {
  const tile = lonLatToTile(longitude, latitude, zoom);
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${tile.z}/${tile.x}/${tile.y}.png`;
  if (approved !== true) {
    return {
      fetch: false,
      tile,
      url,
      attribution: DEM_ATTRIBUTION,
      reason: `One elevation tile at zoom ${tile.z}, about 100 KB. ${DEM_SOURCE} Nothing is downloaded until you approve.`
    };
  }
  return { fetch: true, tile, url, attribution: DEM_ATTRIBUTION, reason: null };
}

export function terrariumGrid(rgba, width, height) {
  const elev = new Float32Array(width * height);
  for (let i = 0; i < elev.length; i += 1) {
    const offset = i * 4;
    elev[i] = terrariumMeters(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
  }
  return elev;
}

export function hillshadeRgba(elev, width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = elev[y * width + Math.max(0, x - 1)];
      const right = elev[y * width + Math.min(width - 1, x + 1)];
      const up = elev[Math.max(0, y - 1) * width + x];
      const down = elev[Math.min(height - 1, y + 1) * width + x];
      const tone = Math.round(hillshadeShade(right - left, down - up) * 255);
      const offset = (y * width + x) * 4;
      out[offset] = tone;
      out[offset + 1] = Math.round(tone * 0.92);
      out[offset + 2] = Math.round(tone * 0.78);
      out[offset + 3] = 210;
    }
  }
  return out;
}

export function elevationAt(elev, width, height, bounds, longitude, latitude) {
  if (!bounds) return null;
  if (longitude < bounds.west || longitude > bounds.east || latitude < bounds.south || latitude > bounds.north) return null;
  const xSpan = bounds.east - bounds.west || 1;
  const ySpan = bounds.north - bounds.south || 1;
  const x = Math.min(width - 1, Math.max(0, Math.floor(((longitude - bounds.west) / xSpan) * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(((bounds.north - latitude) / ySpan) * height)));
  return elev[y * width + x];
}

function pointOnTile(px, py, width, height, bounds) {
  return [
    bounds.west + (px / Math.max(1, width - 1)) * (bounds.east - bounds.west),
    bounds.north - (py / Math.max(1, height - 1)) * (bounds.north - bounds.south)
  ];
}

export function contourGeoJSON(elev, width, height, bounds, interval = 100) {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 32));
  const gw = Math.max(2, Math.floor(width / step));
  const gh = Math.max(2, Math.floor(height / step));
  const grid = new Float32Array(gw * gh);
  let low = Infinity;
  let high = -Infinity;
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      const value = elev[Math.min(height - 1, y * step) * width + Math.min(width - 1, x * step)];
      grid[y * gw + x] = value;
      if (value < low) low = value;
      if (value > high) high = value;
    }
  }
  const features = [];
  const start = Math.ceil(low / interval) * interval;
  for (let level = start; level <= high && features.length < 400; level += interval) {
    const segments = contourSegments(grid, gw, gh, level);
    for (const [a, b] of segments) {
      if (features.length >= 400) break;
      features.push({
        type: "Feature",
        properties: { level },
        geometry: {
          type: "LineString",
          coordinates: [
            pointOnTile(a[0], a[1], gw, gh, bounds),
            pointOnTile(b[0], b[1], gw, gh, bounds)
          ]
        }
      });
    }
  }
  return { type: "FeatureCollection", features };
}

export function mbtilesQuery(zoom, x, y) {
  return {
    sql: "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
    args: [zoom, x, tmsRow(zoom, y)]
  };
}
