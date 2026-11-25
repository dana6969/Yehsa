// R13: Kiwix .zim files Yehsa kept in its own folder (documentDirectory/yehsa-zim/) when you opened one.
import * as FileSystem from "expo-file-system";

const DIR = `${FileSystem.documentDirectory}yehsa-zim/`;

export async function listZims() {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) return [];
    const names = await FileSystem.readDirectoryAsync(DIR);
    const out = [];
    for (const name of names) {
      // eslint-disable-next-line no-await-in-loop
      const f = await FileSystem.getInfoAsync(`${DIR}${name}`, { size: true }).catch(() => null);
      if (f?.exists && !f.isDirectory) out.push({ name, bytes: Number(f.size) || 0 });
    }
    return out;
  } catch {
    return [];
  }
}

export async function removeZim(name) {
  const safe = String(name || "").replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safe) return { ok: false };
  await FileSystem.deleteAsync(`${DIR}${safe}`, { idempotent: true });
  return { ok: true };
}
