import assert from "node:assert/strict";
import test from "node:test";
import { lonLatToTile, mbtilesQuery, planDemDownload, terrariumMeters, tmsRow } from "./symbolic/dem_tiles.js";

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
});
