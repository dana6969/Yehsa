// Pack files on the phone. Big files are streamed by the system, never read into JavaScript.
// MBTiles live in expo-sqlite's own folder so they open by name, the documented way.
// Nothing here opens a network connection except the download the person approved.

import { mbtilesQuery } from "../../symbolic/dem_tiles.js";
import * as FileSystem from "expo-file-system";
import * as SQLite from "expo-sqlite";

export const isNative = true;
export const SQLITE_DIR = `${FileSystem.documentDirectory}SQLite/`;
const WORK_DIR = `${FileSystem.documentDirectory}yehsa-packs/`;

function safe(part) {
  return String(part).replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function mbtilesName(id) {
  return `yehsa-pack-${safe(id)}.mbtiles`;
}

export function mbtilesPath(id) {
  return `${SQLITE_DIR}${mbtilesName(id)}`;
}

export function linesPath(id) {
  return `${WORK_DIR}${safe(id)}.lines.json`;
}

async function ensureDirs() {
  await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true }).catch(() => {});
  await FileSystem.makeDirectoryAsync(WORK_DIR, { intermediates: true }).catch(() => {});
}

export async function prepare() {
  await ensureDirs();
}

export async function fileSize(uri) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? info.size ?? 0 : null;
  } catch {
    return null;
  }
}

export async function freeBytes() {
  try {
    return await FileSystem.getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

export async function removeFile(uri) {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

// ------------------------------------------------------------------ download adapter

// File adapter for symbolic/pack_download.js. The system downloads straight to disk and
// resumes with an HTTP Range request from the bytes already on disk.
export const downloadAdapter = {
  async partSize(path) {
    return (await fileSize(path)) || 0;
  },
  start({ url, path, resumeFrom, onBytes }) {
    let task = null;
    let stopped = false;
    const done = (async () => {
      await ensureDirs();
      task = FileSystem.createDownloadResumable(
        url,
        path,
        {},
        (progress) => onBytes?.(progress.totalBytesWritten, progress.totalBytesExpectedToWrite),
        resumeFrom > 0 ? String(resumeFrom) : undefined
      );
      try {
        const result = await task.downloadAsync();
        if (stopped || !result) return { ok: false, stopped: true };
        if (result.status >= 400) return { ok: false, status: result.status };
        return { ok: true, status: result.status };
      } catch (error) {
        if (stopped) return { ok: false, stopped: true };
        throw error;
      }
    })();
    return {
      done,
      async stop() {
        stopped = true;
        try {
          await task?.pauseAsync();
        } catch {
          // already done
        }
      }
    };
  },
  size: (path) => fileSize(path),
  async md5(path) {
    try {
      const info = await FileSystem.getInfoAsync(path, { md5: true });
      return info.exists ? info.md5 || null : null;
    } catch {
      return null;
    }
  },
  async move(from, to) {
    await FileSystem.deleteAsync(to, { idempotent: true });
    await FileSystem.moveAsync({ from, to });
  },
  remove: (path) => removeFile(path)
};

// ------------------------------------------------------------------ reading

function unbase64(text) {
  const binary = globalThis.atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

// A slice of a file as bytes. Used to read a big import in chunks.
export async function readChunk(uri, position, length) {
  const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position, length });
  return unbase64(text);
}

// ------------------------------------------------------------------ lines (GeoJSON, GPX, KML, outlines)

export async function writeLines(id, lines) {
  await ensureDirs();
  const compact = lines.map((line) => ({
    n: line.name,
    w: line.water ? 1 : 0,
    s: line.single ? 1 : 0,
    r: line.ring ? 1 : 0,
    p: line.points.flatMap((point) => (Number.isFinite(point.ele) ? [point.longitude, point.latitude, point.ele] : [point.longitude, point.latitude])),
    e: line.points.some((point) => Number.isFinite(point.ele)) ? 1 : 0
  }));
  await FileSystem.writeAsStringAsync(linesPath(id), JSON.stringify(compact));
}

export async function readLines(id) {
  try {
    const text = await FileSystem.readAsStringAsync(linesPath(id));
    const compact = JSON.parse(text);
    return compact.map((line) => {
      const stride = line.e ? 3 : 2;
      const points = [];
      for (let i = 0; i + 1 < line.p.length; i += stride) {
        const point = { longitude: line.p[i], latitude: line.p[i + 1] };
        if (stride === 3) point.ele = line.p[i + 2];
        points.push(point);
      }
      const out = { name: line.n, water: line.w === 1, single: line.s === 1, points };
      if (line.r === 1) out.ring = true;
      return out;
    });
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------ MBTiles

export async function openMbtiles(id) {
  const db = await SQLite.openDatabaseAsync(mbtilesName(id), { useNewConnection: true });
  return {
    async getTile(z, x, y) {
      const query = mbtilesQuery(z, x, y);
      const row = await db.getFirstAsync(query.sql, ...query.args);
      const blob = row?.tile_data;
      if (!blob) return null;
      return blob instanceof Uint8Array ? blob : new Uint8Array(blob);
    },
    async metadata() {
      const rows = await db.getAllAsync("SELECT name, value FROM metadata");
      const meta = {};
      for (const row of rows) meta[row.name] = row.value;
      return meta;
    },
    async summary() {
      const row = await db.getFirstAsync("SELECT COUNT(*) AS n, MIN(zoom_level) AS lo, MAX(zoom_level) AS hi FROM tiles");
      return { tiles: row?.n || 0, minZoom: row?.lo ?? null, maxZoom: row?.hi ?? null };
    },
    async sampleTile() {
      const row = await db.getFirstAsync("SELECT tile_data FROM tiles LIMIT 1");
      const blob = row?.tile_data;
      return blob ? (blob instanceof Uint8Array ? blob : new Uint8Array(blob)) : null;
    },
    async close() {
      await db.closeAsync().catch(() => {});
    }
  };
}

export async function removeMbtiles(id) {
  const base = mbtilesPath(id);
  await removeFile(base);
  await removeFile(`${base}-wal`);
  await removeFile(`${base}-shm`);
  await removeFile(`${base}-journal`);
}

export async function moveIn(fromUri, toUri) {
  await ensureDirs();
  await FileSystem.deleteAsync(toUri, { idempotent: true });
  try {
    await FileSystem.moveAsync({ from: fromUri, to: toUri });
  } catch {
    await FileSystem.copyAsync({ from: fromUri, to: toUri });
    await removeFile(fromUri);
  }
}

export const workDir = WORK_DIR;
