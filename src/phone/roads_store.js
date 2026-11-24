// Web preview and node: the road layer needs the Android app (its files are opened with SQLite).
export function openRoads() {
  return Promise.resolve(null);
}
export function roadsSupported() {
  return false;
}
export async function roadTile() {
  return null;
}
export async function glyphRange() {
  return null;
}
export async function searchRoads() {
  return [];
}
