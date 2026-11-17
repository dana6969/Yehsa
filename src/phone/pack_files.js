// Web preview: no pack files. Downloads of tile archives are not offered here.
export const isNative = false;
export const SQLITE_DIR = "";
export const workDir = "";
export const downloadAdapter = null;
export const mbtilesPath = () => "";
export const linesPath = () => "";
export async function prepare() {}
export async function fileSize() { return null; }
export async function freeBytes() { return null; }
export async function removeFile() {}
export async function readChunk() { return new Uint8Array(); }
export async function writeLines() {}
export async function readLines() { return []; }
export async function openMbtiles() { throw new Error("Tile archives need the Android app."); }
export async function removeMbtiles() {}
export async function moveIn() {}
