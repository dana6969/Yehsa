// Storage adapter for sealed stores on Android and iOS.
// The 32-byte sealing key goes to expo-secure-store. On Android that is an AES key inside the
// Android Keystore, wrapped to this phone, and the item is not migrated to another device.
// The sealed ciphertext goes to ordinary app storage. Copying app data to another phone copies
// ciphertext only, so it cannot be opened there.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export function createAdapter(prefix) {
  const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, keychainService: prefix };
  const slot = (name) => `${prefix}.${String(name).replace(/[^a-zA-Z0-9._-]/g, "")}`;
  return {
    async getSecret(name) {
      try {
        return await SecureStore.getItemAsync(slot(name), options);
      } catch (err) {
        // The Keystore could not unwrap this item on this phone.
        const failure = new Error("SecureStore unwrap failed");
        failure.code = "unwrap-failed";
        failure.cause = err;
        throw failure;
      }
    },
    async setSecret(name, value) {
      await SecureStore.setItemAsync(slot(name), value, options);
    },
    async deleteSecret(name) {
      await SecureStore.deleteItemAsync(slot(name), options);
    },
    async getData(name) {
      const raw = await AsyncStorage.getItem(`${slot(name)}.data`);
      return raw ? JSON.parse(raw) : null;
    },
    async setData(name, value) {
      await AsyncStorage.setItem(`${slot(name)}.data`, JSON.stringify(value));
    },
    async deleteData(name) {
      await AsyncStorage.removeItem(`${slot(name)}.data`);
    }
  };
}
