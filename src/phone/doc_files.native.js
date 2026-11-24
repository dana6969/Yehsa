// Sealed document files in the app's own private storage (documentDirectory/yehsa-docs/).
// Only ciphertext is written here; the key is in the Android Keystore via expo-secure-store.
// Other apps cannot read this folder, and the downloaded PDF itself is never written anywhere.
import * as FileSystem from "expo-file-system";

const DIR = `${FileSystem.documentDirectory}yehsa-docs/`;
let ready = null;

function ensureDir() {
  if (!ready) {
    ready = FileSystem.getInfoAsync(DIR)
      .then((info) => (info.exists ? null : FileSystem.makeDirectoryAsync(DIR, { intermediates: true })))
      .catch(() => null);
  }
  return ready;
}

function pathOf(name) {
  return `${DIR}${String(name).replace(/[^a-zA-Z0-9._-]/g, "")}`;
}

export const docFiles = {
  async readFile(name) {
    await ensureDir();
    const path = pathOf(name);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    return FileSystem.readAsStringAsync(path);
  },
  async writeFile(name, text) {
    await ensureDir();
    // Write then move, so a crash mid-write never leaves half a sealed file.
    const tmp = `${pathOf(name)}.tmp`;
    await FileSystem.writeAsStringAsync(tmp, text);
    await FileSystem.moveAsync({ from: tmp, to: pathOf(name) }).catch(async () => {
      await FileSystem.deleteAsync(pathOf(name), { idempotent: true });
      await FileSystem.moveAsync({ from: tmp, to: pathOf(name) });
    });
  },
  async deleteFile(name) {
    await FileSystem.deleteAsync(pathOf(name), { idempotent: true });
  }
};
