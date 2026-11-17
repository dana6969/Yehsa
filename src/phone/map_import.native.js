// Import a map file on Android: the system document picker, then read in chunks.
// MBTiles are copied as a file and opened by SQLite. GeoJSON, GPX and KML are read a chunk
// at a time with a pause between chunks, so the screen keeps moving.

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { addPack } from "../../symbolic/map_packs.js";
import { contentTypeFor } from "../../symbolic/tile_http.js";
import { IMPORT_MESSAGES, describePick, extensionKind, importTextFile, mbtilesPackFrom, sniffKind } from "../../symbolic/map_import.js";
import * as files from "./pack_files";

// Android hands out files by content address with a name and size. Nothing is copied yet.
export async function pickMapFile() {
  let result;
  try {
    result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: false, multiple: false });
  } catch {
    return { ok: false, reason: IMPORT_MESSAGES.unreadable };
  }
  if (result.canceled || !result.assets?.length) return { ok: false, canceled: true, reason: IMPORT_MESSAGES.canceled };
  const asset = result.assets[0];
  const size = Number.isFinite(asset.size) ? asset.size : null;
  return { ok: true, file: { name: asset.name || "Map file", size, uri: asset.uri } };
}

export async function describeFile(file, store) {
  const free = await files.freeBytes();
  const budgetRoom = (store?.budgetBytes || 0) - (store?.usedBytes || 0);
  const room = Number.isFinite(free) ? Math.min(free, budgetRoom) : budgetRoom;
  return describePick(file, { room });
}

function tileKindOf(bytes) {
  const type = contentTypeFor(bytes);
  return type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : null;
}

// Copies the picked file onto this phone, checks it, and returns { ok, store, pack } or { ok:false, reason }.
export async function addPickedFile(file, store, { onProgress, signal } = {}) {
  await files.prepare();
  const room = (store.budgetBytes || 0) - (store.usedBytes || 0);
  if (Number.isFinite(file.size) && file.size > room) return { ok: false, reason: IMPORT_MESSAGES.tooLarge };
  const id = `import-${Date.now()}`;
  const byExtension = extensionKind(file.name);
  if (byExtension === "pmtiles") return { ok: false, reason: IMPORT_MESSAGES.pmtiles };
  const target = byExtension === "mbtiles" ? files.mbtilesPath(id) : `${files.workDir}${id}.tmp`;
  try {
    onProgress?.({ phase: "copy" });
    await FileSystem.copyAsync({ from: file.uri, to: target });
  } catch {
    await files.removeFile(target);
    return { ok: false, reason: IMPORT_MESSAGES.unreadable };
  }
  const size = await files.fileSize(target);
  if (!size) {
    await files.removeFile(target);
    return { ok: false, reason: IMPORT_MESSAGES.unreadable };
  }
  if (size > room) {
    await files.removeFile(target);
    return { ok: false, reason: IMPORT_MESSAGES.tooLarge };
  }
  let kind;
  try {
    kind = sniffKind(await files.readChunk(target, 0, Math.min(size, 2048)));
  } catch {
    kind = null;
  }
  if (kind === "pmtiles") {
    await files.removeFile(target);
    return { ok: false, reason: IMPORT_MESSAGES.pmtiles };
  }
  if (!kind) {
    await files.removeFile(target);
    return { ok: false, reason: IMPORT_MESSAGES.unsupported };
  }
  if (kind === "mbtiles") {
    if (target !== files.mbtilesPath(id)) await files.moveIn(target, files.mbtilesPath(id));
    let reader;
    try {
      reader = await files.openMbtiles(id);
      const meta = await reader.metadata().catch(() => ({}));
      const summary = await reader.summary();
      const sample = await reader.sampleTile();
      const pack = mbtilesPackFrom({ id, name: file.name, bytes: size, meta, summary, sampleKind: sample ? tileKindOf(sample) : null });
      await reader.close();
      reader = null;
      if (!pack.ok) {
        await files.removeMbtiles(id);
        return { ok: false, reason: pack.reason };
      }
      const saved = addPack(store, pack);
      if (!saved.added) {
        await files.removeMbtiles(id);
        return { ok: false, reason: saved.reason || IMPORT_MESSAGES.tooLarge };
      }
      return { ok: true, store: saved.store, pack };
    } catch {
      await reader?.close?.();
      await files.removeMbtiles(id);
      return { ok: false, reason: IMPORT_MESSAGES.unreadable };
    }
  }
  const result = await importTextFile({
    name: file.name,
    size,
    kind,
    readChunk: (position, length) => files.readChunk(target, position, length),
    onProgress: (p) => onProgress?.({ phase: "read", ...p }),
    signal
  });
  await files.removeFile(target);
  if (!result.ok) return { ok: false, reason: result.reason, canceled: result.canceled };
  const saved = addPack(store, result.pack);
  if (!saved.added) return { ok: false, reason: saved.reason || IMPORT_MESSAGES.tooLarge };
  return { ok: true, store: saved.store, pack: result.pack, truncated: result.truncated };
}
