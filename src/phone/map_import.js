// Web preview import: the browser file picker. Reads the file whole (small files only).
import { validateImport, addPack, formatBytes } from "../../symbolic/map_packs.js";
import { IMPORT_MESSAGES } from "../../symbolic/map_import.js";

export async function pickMapFile() {
  if (typeof document === "undefined") return { ok: false, reason: IMPORT_MESSAGES.unreadable };
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".geojson,.json,.gpx,.kml,.mbtiles";
    input.onchange = () => {
      const file = input.files && input.files[0];
      resolve(file ? { ok: true, file: { name: file.name, size: file.size, blob: file } } : { ok: false, canceled: true, reason: IMPORT_MESSAGES.canceled });
    };
    input.click();
  });
}

export async function describeFile(file) {
  return { ok: true, title: file.name, words: "Map file", sizeText: formatBytes(file.size), text: `${file.name} · ${formatBytes(file.size)}` };
}

export async function addPickedFile(file, store) {
  const bytes = new Uint8Array(await file.blob.arrayBuffer());
  const pack = validateImport(file.name, bytes);
  if (pack.ok && /\.mbtiles$/i.test(file.name)) return { ok: false, reason: "Tile archives need the Android app." };
  const saved = addPack(store, pack);
  if (!saved.added) return { ok: false, reason: pack.reason || saved.reason };
  return { ok: true, store: saved.store, pack };
}
