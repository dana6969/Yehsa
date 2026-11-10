import assert from "node:assert/strict";
import test from "node:test";
import { contourGeoJSON, elevationAt, hillshadeRgba, hillshadeShade, lonLatToTile, mbtilesQuery, planDemDownload, planDemRegion, terrariumGrid, terrariumMeters, tmsRow } from "./symbolic/dem_tiles.js";

test("terrarium pixels become meters and a download waits for approval", () => {
  assert.equal(terrariumMeters(128, 0, 0), 0);
  assert.equal(terrariumMeters(128, 1, 0), 1);
  let calls = 0;
  const held = planDemDownload({ approved: false, latitude: 45.1, longitude: -69.2, zoom: 6 });
  if (held.fetch) calls += 1;
  assert.equal(held.fetch, false);
  assert.match(held.reason, /until you approve/);
  assert.match(held.attribution, /ETOPO1/);
  assert.equal(calls, 0);
  const ready = planDemDownload({ approved: true, latitude: 45.1, longitude: -69.2, zoom: 6 });
  assert.equal(ready.fetch, true);
  assert.match(ready.url, /terrarium\/6\//);
  const tile = lonLatToTile(-69.2, 45.1, 6);
  assert.equal(tmsRow(6, tile.y), (64 - 1) - tile.y);
  const query = mbtilesQuery(tile.z, tile.x, tile.y);
  assert.equal(query.args[2], tmsRow(tile.z, tile.y));
  assert.match(query.sql, /tile_data/);
  const region = planDemRegion({ approved: false, around: { latitude: 45.1, longitude: -69.2, radiusKm: 40 } });
  assert.equal(region.fetch, false);
  assert.ok(region.tiles.length >= 4);
  assert.match(region.reason, /tiles/);
  assert.match(region.reason, /until you approve/);
  assert.ok(hillshadeShade(0, 0) > 0.4);
  assert.ok(hillshadeShade(40, 0) < hillshadeShade(0, 0));
  const rgba = new Uint8Array([
    128, 0, 0, 255, 128, 40, 0, 255,
    128, 0, 0, 255, 128, 40, 0, 255
  ]);
  const grid = terrariumGrid(rgba, 2, 2);
  assert.equal(grid[0], 0);
  assert.equal(grid[1], 40);
  const shade = hillshadeRgba(grid, 2, 2);
  assert.equal(shade.length, 16);
  assert.ok(shade[3] > 0);
  const bounds = { west: 0, south: 0, east: 2, north: 2 };
  assert.equal(elevationAt(grid, 2, 2, bounds, 1.5, 1), 40);
  assert.equal(elevationAt(grid, 2, 2, bounds, 9, 9), null);
  const lines = contourGeoJSON(grid, 2, 2, bounds, 20);
  assert.ok(lines.features.length >= 1);
  assert.equal(lines.features[0].geometry.type, "LineString");
});
