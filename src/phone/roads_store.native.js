// The built-in road layer on the phone. The road files ship inside the app; the first time the
// map needs them they are moved once into expo-sqlite's folder (so SQLite can open them by name)
// and a small marker remembers which build they came from. No network, ever.

import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { gunzipSync } from "fflate";
import { mbtilesQuery } from "../../symbolic/dem_tiles.js";
import { GLYPH_RANGES, ROADS_MANIFEST, emptyGlyphRange, glyphRangeOk, rankRoadHits, roadSearchQuery, roadShardFor, roadTileWanted } from "../../symbolic/roads.js";
import { ROAD_NAMES_ASSET, ROAD_SHARD_ASSETS } from "./roads_assets.native.js";

const GLYPH_ASSETS = {
  "0-255": require("../../assets/roads/glyphs/0-255.pbf"),
  "256-511": require("../../assets/roads/glyphs/256-511.pbf"),
  "8192-8447": require("../../assets/roads/glyphs/8192-8447.pbf")
};

const SQLITE_DIR = `${FileSystem.documentDirectory}SQLite/`;
const MARKER = `${FileSystem.documentDirectory}yehsa-roads.version`;
const shardName = (k) => `yehsa-roads-${k}.mbtiles`;
const NAMES_DB = "yehsa-road-names.db";

let pending = null;
const glyphCache = new Map();

async function readMarker() {
  try {
    return (await FileSystem.readAsStringAsync(MARKER)).trim();
  } catch {
    return "";
  }
}

async function present(name) {
  try {
    const info = await FileSystem.getInfoAsync(`${SQLITE_DIR}${name}`);
    return info.exists && (info.size || 0) > 0;
  } catch {
    return false;
  }
}

// Moves one bundled file into the SQLite folder. Moving (not copying) keeps one copy on disk.
async function installAsset(moduleId, name) {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const from = asset.localUri || asset.uri;
  const to = `${SQLITE_DIR}${name}`;
  await FileSystem.deleteAsync(to, { idempotent: true });
  try {
    await FileSystem.moveAsync({ from, to });
  } catch {
    await FileSystem.copyAsync({ from, to });
  }
}

async function install(onStatus) {
  const manifest = ROADS_MANIFEST;
  await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true }).catch(() => {});
  const names = [...ROAD_SHARD_ASSETS.map((_, k) => shardName(k)), NAMES_DB];
  const marker = await readMarker();
  let ok = marker === manifest.version;
  if (ok) {
    for (const name of names) {
      if (!(await present(name))) ok = false;
    }
  }
  if (!ok) {
    onStatus?.("Setting up the road layer (one time)...");
    for (let k = 0; k < ROAD_SHARD_ASSETS.length; k += 1) {
      await installAsset(ROAD_SHARD_ASSETS[k], shardName(k));
    }
    await installAsset(ROAD_NAMES_ASSET, NAMES_DB);
    await FileSystem.writeAsStringAsync(MARKER, manifest.version);
  }
  const shards = [];
  for (let k = 0; k < ROAD_SHARD_ASSETS.length; k += 1) {
    shards.push(await SQLite.openDatabaseAsync(shardName(k), { useNewConnection: true }));
  }
  const namesDb = await SQLite.openDatabaseAsync(NAMES_DB, { useNewConnection: true });
  return { shards, namesDb };
}

// Opens the road layer (installing it the first time). Resolves to null if it cannot.
export function openRoads(onStatus) {
  if (!pending) {
    pending = install(onStatus).catch(() => {
      pending = null;
      return null;
    });
  }
  return pending;
}

export function roadsSupported() {
  return ROAD_SHARD_ASSETS.length > 0;
}

// One vector tile as plain protobuf (unzipped here so the map never depends on HTTP gzip).
export async function roadTile(z, x, y) {
  if (!roadTileWanted(z, x, y)) return null;
  const roads = await openRoads();
  if (!roads) return null;
  const db = roads.shards[roadShardFor(x, y, roads.shards.length)];
  const query = mbtilesQuery(z, x, y);
  const row = await db.getFirstAsync(query.sql, ...query.args);
  const blob = row?.tile_data;
  if (!blob) return null;
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
}

export async function glyphRange(fontstack, range) {
  if (!glyphRangeOk(range)) return null;
  if (!GLYPH_RANGES.includes(range)) return emptyGlyphRange(fontstack, range);
  if (!glyphCache.has(range)) {
    glyphCache.set(range, (async () => {
      const asset = Asset.fromModule(GLYPH_ASSETS[range]);
      await asset.downloadAsync();
      const text = await FileSystem.readAsStringAsync(asset.localUri || asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const binary = globalThis.atob(text);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
      return out;
    })().catch(() => {
      glyphCache.delete(range);
      return null;
    }));
  }
  return glyphCache.get(range);
}

// Road names that start with (then contain) the text, nearest first.
export async function searchRoads(text, { near = null } = {}) {
  const roads = await openRoads();
  if (!roads) return [];
  const rows = [];
  const first = roadSearchQuery(text);
  if (!first) return [];
  rows.push(...(await roads.namesDb.getAllAsync(first.sql, ...first.args)));
  if (rows.length < 12) {
    const more = roadSearchQuery(text, { anywhere: true, limit: 60 });
    rows.push(...(await roads.namesDb.getAllAsync(more.sql, ...more.args)));
  }
  return rankRoadHits(rows, { near });
}
