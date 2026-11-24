// R7: Terrain shading draws real hillshade offline from the elevation bundled in the app, and the
// switch is saved across restarts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mapLayers, baseMapStyle, TERRAIN_LAYER_ID } from "./symbolic/map_layers.js";
import { demRange, demTileCount, DEM_MAX_ZOOM } from "./symbolic/dem_archive.js";
import { handleRequest, routeTile } from "./symbolic/tile_http.js";
import { MAP_STYLE_KEY, loadMapStyle, saveMapStyle, readMapStyle } from "./symbolic/map_style_pref.js";

const store = { packs: [{ id: "me-southern", kind: "mbtiles", file: "x.mbtiles", minZoom: 6, maxZoom: 12, bounds: { west: -71.2, south: 42.9, east: -68.9, north: 44.7 } }] };
const ARCHIVE = "assets/dem/yehsa_dem_terrain.ydm";

function lonLatTile(lon, lat, z) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n) };
}

test("the Terrain switch adds a hillshade layer over the packs; Standard has none", () => {
  const on = mapLayers({ store, port: 5555, style: "terrain" });
  assert.ok(on.hillshade, "terrain on gives hillshade");
  assert.match(on.hillshade.template, /^http:\/\/127\.0\.0\.1:5555\/dem\/\{z\}\/\{x\}\/\{y\}$/);
  const style = baseMapStyle({ color: "#000", hillshade: on.hillshade });
  assert.equal(style.sources["terrain-dem"].type, "raster-dem");
  assert.equal(style.sources["terrain-dem"].encoding, "terrarium");
  assert.equal(style.sources["terrain-dem"].maxzoom, DEM_MAX_ZOOM);
  assert.equal(style.layers.at(-1).id, TERRAIN_LAYER_ID);
  assert.equal(style.layers.at(-1).type, "hillshade");
  const off = mapLayers({ store, port: 5555, style: "standard" });
  assert.equal(off.hillshade, null);
  assert.equal(baseMapStyle({ color: "#000", hillshade: off.hillshade }).layers.length, 1);
  assert.equal(mapLayers({ store, port: null, style: "terrain" }).hillshade, null, "waits for the tile server");
});

test("the native map puts pack pictures and land under the shading", () => {
  const src = fs.readFileSync("src/phone/OfflineMap.native.js", "utf8");
  assert.match(src, /baseMapStyle\(/);
  assert.match(src, /<RasterLayer[^>]*belowLayerID=\{under\}/);
  assert.match(src, /<FillLayer id="land-fill" belowLayerID=\{under\}/);
  assert.match(src, /key=\{`\$\{raster\.id\}-\$\{raster\.template\}-\$\{under \? "shade" : "flat"\}`\}/);
});

test("the bundled elevation covers every map-pack state, offline", () => {
  assert.ok(fs.existsSync(ARCHIVE));
  assert.ok(demTileCount() > 1000);
  const regions = JSON.parse(fs.readFileSync("tools/mappacks/regions.json", "utf8")).regions;
  for (const r of regions) {
    const [w, s, e, n] = r.bbox;
    const t = lonLatTile((w + e) / 2, (s + n) / 2, 9);
    assert.ok(demRange(9, t.x, t.y), `${r.id} has elevation at zoom 9`);
  }
  assert.equal(routeTile("/dem/9/150/185").kind, "dem");
});

test("a /dem tile from the archive is served as a WebP Terrarium tile", async () => {
  const fd = fs.openSync(ARCHIVE, "r");
  const providers = {
    dem: async (z, x, y) => {
      const r = demRange(z, x, y);
      if (!r) return null;
      const buf = Buffer.alloc(r.length);
      fs.readSync(fd, buf, 0, r.length, r.offset);
      return new Uint8Array(buf);
    }
  };
  const t = lonLatTile(-69.6, 44.5, 9);
  const reply = Buffer.from(await handleRequest(`GET /dem/9/${t.x}/${t.y} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`, providers));
  const text = reply.toString("latin1");
  assert.match(text, /^HTTP\/1\.1 200/);
  assert.match(text, /Content-Type: image\/webp/);
  const miss = Buffer.from(await handleRequest("GET /dem/9/0/0 HTTP/1.1\r\n\r\n", providers)).toString("latin1");
  assert.match(miss, /^HTTP\/1\.1 404/);
  fs.closeSync(fd);
});

test("the Terrain switch survives a restart", async () => {
  const mem = new Map();
  const storage = { getItem: async (k) => mem.get(k) ?? null, setItem: async (k, v) => { mem.set(k, v); } };
  assert.equal(await loadMapStyle(storage), "standard");
  await saveMapStyle(storage, "terrain");
  assert.ok(mem.has(MAP_STYLE_KEY));
  assert.equal(await loadMapStyle(storage), "terrain");
  assert.equal(readMapStyle("{bad"), "standard");
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(app, /loadMapStyle\(AsyncStorage\)/);
  assert.match(app, /saveMapStyle\(AsyncStorage, next\)/);
});
