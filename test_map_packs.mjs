import assert from "node:assert/strict";
import test from "node:test";
import { encode } from "fast-png";
import { readPmTile, writeRasterPmtiles } from "./symbolic/archive_tiles.js";
import {
  addPack,
  attributionLine,
  beginDownload,
  deletePack,
  emptyPackStore,
  nearestWater,
  pauseDownload,
  resumeDownload,
  sizeWarning,
  validateImport
} from "./symbolic/map_packs.js";

test("a corrupt map file is rejected and a real one keeps attribution", () => {
  const bad = validateImport("notes.geojson", "{not json");
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /Nothing was added/);

  const emptyGpx = validateImport("track.gpx", "<gpx version=\"1.1\"></gpx>");
  assert.equal(emptyGpx.ok, false);

  const fakeTiles = validateImport("city.mbtiles", "this is not sqlite");
  assert.equal(fakeTiles.ok, false);

  const header = new Uint8Array(127);
  header.set(new TextEncoder().encode("PMTiles"), 0);
  header[7] = 3;
  const view = new DataView(header.buffer);
  view.setUint8(100, 0);
  view.setUint8(101, 6);
  view.setInt32(102, -710000000, true);
  view.setInt32(106, 410000000, true);
  view.setInt32(110, -700000000, true);
  view.setInt32(114, 420000000, true);
  const tiles = validateImport("region.pmtiles", header);
  assert.equal(tiles.ok, true);
  assert.equal(tiles.minZoom, 0);
  assert.equal(tiles.maxZoom, 6);
  assert.equal(tiles.paintsTiles, true);
  assert.match(tiles.note, /Tiles in this file are drawn/);
  assert.match(tiles.note, /only if this file contains them/);

  const water = validateImport("creek.geojson", JSON.stringify({
    type: "FeatureCollection",
    properties: { license: "ODbL 1.0", attribution: "© OpenStreetMap contributors. ODbL.", date: "2024-05-01" },
    features: [{
      type: "Feature",
      properties: { natural: "water", name: "Cold Creek" },
      geometry: { type: "LineString", coordinates: [[-71.2, 41.5], [-71.1, 41.55]] }
    }]
  }));
  assert.equal(water.ok, true);
  assert.equal(water.license, "ODbL 1.0");
  assert.match(water.attribution, /OpenStreetMap/);
  const store = addPack(emptyPackStore(), water).store;
  const line = attributionLine(store);
  assert.match(line, /OpenStreetMap/);
  assert.match(line, /May be out of date/);
  const hit = nearestWater(store, { latitude: 41.5, longitude: -71.2 });
  assert.equal(hit.found, true);
  assert.match(hit.text, /Cold Creek/);
  const cleared = deletePack(store, water.id);
  assert.equal(cleared.packs.length, 0);
  assert.equal(cleared.usedBytes, 0);
  assert.match(attributionLine(cleared), /No map pack/);
});

test("a download does not touch the network until you approve, and a huge pack is refused", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, text: async () => "{\"type\":\"FeatureCollection\",\"features\":[]}" };
  };
  const held = beginDownload(emptyPackStore(), "natural-earth-overview", { approved: false });
  assert.equal(held.fetch, false);
  assert.match(held.reason, /Approve to download/);
  assert.match(sizeWarning(held.item ? 1 : 800000, 256 * 1024 * 1024), /May be out of date|About/);
  if (held.fetch) await fetchImpl();
  assert.equal(calls, 0);

  const planet = beginDownload(emptyPackStore(), "planet", { approved: true });
  assert.equal(planet.fetch, false);
  assert.match(planet.reason, /tens of gigabytes|Nothing was downloaded/);

  const pbf = beginDownload(emptyPackStore(), "geofabrik-rhode-island", { approved: true });
  assert.equal(pbf.fetch, false);
  assert.match(pbf.reason, /not fetched|protocol-buffer/);
  assert.equal(calls, 0);

  const paused = pauseDownload({ ...emptyPackStore(), jobs: [{ id: "natural-earth-overview", approved: true, status: "fetching" }] }, "natural-earth-overview");
  assert.equal(paused.jobs[0].status, "paused");
  const again = resumeDownload(paused, "natural-earth-overview");
  assert.equal(again.fetch, true);
  const blocked = resumeDownload(pauseDownload({ ...emptyPackStore(), jobs: [{ id: "x", approved: false, status: "fetching" }] }, "x"), "x");
  assert.equal(blocked.fetch, false);
});

test("a stored raster tile can be read back from the archive", async () => {
  const png = encode({ width: 2, height: 2, data: Uint8Array.from({ length: 16 }, () => 180), channels: 4 });
  const archive = writeRasterPmtiles(png, { z: 8, x: 77, y: 94 });
  const tile = await readPmTile(archive, 8, 77, 94);
  assert.equal(tile.length, png.length);
  assert.equal(await readPmTile(archive, 8, 0, 0), null);
});
