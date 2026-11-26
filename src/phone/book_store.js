// Imported books storage for web and tests (AsyncStorage). The phone uses book_store.native.js.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "yehsa.imported.books.v1";

export async function readImportedRaw() {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function writeImportedRaw(text) {
  await AsyncStorage.setItem(KEY, text);
}
