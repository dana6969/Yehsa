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

export function mbtilesQuery(zoom, x, y) {
  return {
    sql: "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
    args: [zoom, x, tmsRow(zoom, y)]
  };
}
