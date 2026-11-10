import * as SecureStore from "expo-secure-store";

function slot(id) {
  return `yehsa.model.key.${String(id || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40)}`;
}

export async function saveModelKey(id, key) {
  const trimmed = String(key || "").trim();
  if (!trimmed) return { ok: false, reason: "No key was entered." };
  await SecureStore.setItemAsync(slot(id), trimmed, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  return { ok: true };
}

export async function readModelKey(id) {
  return SecureStore.getItemAsync(slot(id));
}

export async function deleteModelKey(id) {
  await SecureStore.deleteItemAsync(slot(id));
  return { ok: true };
}
