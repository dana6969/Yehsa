import * as SecureStore from "expo-secure-store";

const SLOT = "yehsa.peer.secret.v1";

export async function savePeerSecret(identity) {
  if (!identity?.boxSecret || !identity?.signSecret) return { ok: false, reason: "No key was created." };
  await SecureStore.setItemAsync(SLOT, JSON.stringify({
    boxSecret: identity.boxSecret,
    signSecret: identity.signSecret,
    boxPublic: identity.boxPublic,
    signPublic: identity.signPublic
  }), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  return { ok: true };
}

export async function readPeerSecret() {
  return SecureStore.getItemAsync(SLOT);
}
