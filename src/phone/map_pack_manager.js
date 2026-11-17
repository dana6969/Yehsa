// Everything about packs on the phone that is not drawing: remember them across restarts,
// install a finished download, import a picked file, remove one, and tell the tile server.
// Works with pack_files (native files) or its web stub.

import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PACK_CATALOG, addPack, dedupePacks, deletePack, emptyPackStore, STORAGE_BUDGET_BYTES } from "../../symbolic/map_packs.js";
import { IMPORT_MESSAGES, importTextFile, mbtilesPackFrom, sniffKind } from "../../symbolic/map_import.js";
import * as files from "./pack_files";
import { publishPacks } from "./tile_server";

const KEY = "yehsa.mappacks.v2";
const written = new Set();

function plain(pack) {
  // Everything except the heavy shapes, which live in their own file on the phone.
  const { lines, archive, ...rest } = pack;
  return { ...rest, hasLines: Array.isArray(lines) && lines.length > 0 };
}

export async function loadPackStore() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved || !Array.isArray(saved.packs)) return emptyPackStore();
    const packs = [];
    for (const item of saved.packs) {
      // A tile pack whose file is gone (cleared by the system) is dropped, not shown as Ready.
      if (item.kind === "mbtiles" && files.isNative) {
        const size = await files.fileSize(files.mbtilesPath(item.id));
        if (!size) continue;
      }
      const pack = { ...item, lines: [] };
      if (item.hasLines && files.isNative) {
        pack.lines = await files.readLines(item.id);
        written.add(item.id);
        if (!pack.lines.length) continue;
      }
      delete pack.hasLines;
      packs.push(pack);
    }
    const store = { ...emptyPackStore(), packs, budgetBytes: STORAGE_BUDGET_BYTES };
    store.usedBytes = packs.reduce((sum, pack) => sum + (Number(pack.bytes) || 0), 0);
    return dedupePacks(store);
  } catch {
    return emptyPackStore();
  }
}

export async function savePackStore(store) {
  for (const pack of store.packs || []) {
    if (files.isNative && pack.lines?.length && !written.has(pack.id)) {
      await files.writeLines(pack.id, pack.lines);
      written.add(pack.id);
    }
  }
  await AsyncStorage.setItem(KEY, JSON.stringify({ packs: (store.packs || []).map(plain) }));
}

// Keeps the pack store saved and loaded, and tells the tile server when packs change.
export function usePersistedPackStore() {
  const [store, setStore] = useState(emptyPackStore);
  const ready = useRef(false);
  useEffect(() => {
    let live = true;
    loadPackStore().then((loaded) => {
      if (!live) return;
      ready.current = true;
      setStore((current) => {
        // Anything added while loading is kept.
        const extra = current.packs.filter((pack) => !loaded.packs.some((item) => item.id === pack.id));
        if (!extra.length) return loaded;
        return { ...loaded, packs: [...loaded.packs, ...extra], usedBytes: loaded.usedBytes + extra.reduce((s, p) => s + (p.bytes || 0), 0) };
      });
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    savePackStore(store).catch(() => {});
  }, [store]);
  useEffect(() => {
    publishPacks(store.packs).catch(() => {});
  }, [store.packs]);
  return [store, setStore];
}

// Where a pack is downloaded to before it replaces anything.
export function downloadId(item) {
  return `${item.id}-dl`;
}

// A finished download becomes a pack. mbtiles: open it and read its own tables.
// geojson: read the file in chunks.
export async function installDownloaded(item, store, path) {
  if (item.kind === "mbtiles") {
    // The new file arrived under a temporary name so a pack being updated stays usable meanwhile.
    // Close the old copy, swap the files, then open the new one.
    await publishPacks((store.packs || []).filter((pack) => pack.id !== item.id));
    await files.removeMbtiles(item.id);
    await files.moveIn(files.mbtilesPath(downloadId(item)), files.mbtilesPath(item.id));
    const reader = await files.openMbtiles(item.id);
    try {
      const meta = await reader.metadata();
      const summary = await reader.summary();
      if (!summary.tiles) {
        await files.removeMbtiles(item.id);
        return { ok: false, reason: "The downloaded file had no map tiles in it. It was removed." };
      }
      const bytes = (await files.fileSize(files.mbtilesPath(item.id))) || item.bytesEstimate;
      const pack = {
        ok: true,
        id: item.id,
        catalogId: item.id,
        kind: "mbtiles",
        file: `${item.id}.mbtiles`,
        format: "mbtiles",
        name: item.name,
        bytes,
        bounds: item.bounds,
        minZoom: summary.minZoom ?? item.minZoom,
        maxZoom: summary.maxZoom ?? item.maxZoom,
        built: item.built || meta.built || null,
        source: item.source,
        license: item.license,
        attribution: item.attribution,
        lines: [],
        paintsTiles: true,
        note: item.note,
        importedAt: new Date().toISOString()
      };
      return addPackSafely(store, pack);
    } finally {
      await reader.close();
    }
  }
  if (item.kind === "geojson") {
    const size = (await files.fileSize(path)) || 0;
    const result = await importTextFile({
      name: item.name,
      size,
      kind: "geojson",
      readChunk: (position, length) => files.readChunk(path, position, length)
    });
    await files.removeFile(path);
    if (!result.ok) return { ok: false, reason: result.reason };
    const pack = {
      ...result.pack,
      id: item.id,
      catalogId: item.id,
      name: item.name,
      source: item.source,
      license: item.license,
      attribution: item.attribution,
      built: new Date().toISOString().slice(0, 10)
    };
    return addPackSafely(store, pack);
  }
  return { ok: false, reason: "That download type isn't supported." };
}

function addPackSafely(store, pack) {
  const saved = addPack(store, pack);
  if (!saved.added) return { ok: false, reason: saved.reason || "Nothing was added." };
  return { ok: true, store: saved.store, pack };
}

export async function removeInstalled(store, packId) {
  const pack = store.packs.find((item) => item.id === packId);
  if (pack?.kind === "mbtiles") {
    await publishPacks(store.packs.filter((item) => item.id !== packId));
    await files.removeMbtiles(pack.id);
  } else if (pack && files.isNative) {
    await files.removeFile(files.linesPath(pack.id));
  }
  written.delete(packId);
  return deletePack(store, packId);
}

export { PACK_CATALOG, IMPORT_MESSAGES, files };
