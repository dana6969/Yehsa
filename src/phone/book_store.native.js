// Imported books on the phone: one JSON file in Yehsa's private folder.
// AsyncStorage is too small for whole books on Android, so a file is used. Nothing is uploaded.
import * as FileSystem from "expo-file-system";

const DIR = `${FileSystem.documentDirectory}yehsa-books/`;
const FILE = `${DIR}imported.json`;

export async function readImportedRaw() {
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(FILE);
  } catch {
    return null;
  }
}

export async function writeImportedRaw(text) {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  const temp = `${FILE}.tmp`;
  await FileSystem.writeAsStringAsync(temp, text);
  await FileSystem.moveAsync({ from: temp, to: FILE }).catch(async () => {
    await FileSystem.deleteAsync(FILE, { idempotent: true });
    await FileSystem.moveAsync({ from: temp, to: FILE });
  });
}
