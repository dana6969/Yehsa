// The names the secret store (expo-secure-store / Android Keystore) uses for each secret slot.
// SecureStore only accepts keys made of letters, digits, ".", "-" and "_". A slot with no name here,
// or a bad name, used to reach SecureStore as `undefined` and every read failed. That is why Hunt
// party said "I couldn't open your key" and the identity was never made (the "bindToken" slot had no
// entry). secureKeyFor refuses an unknown slot loudly and tests walk every slot the vault uses.

export const SECRET_KEYS = Object.freeze({
  identity: "yehsa.peer.secret.v1",
  historyKey: "yehsa.peer.history.key.v1",
  authFlag: "yehsa.peer.auth.flag.v1",
  bindToken: "yehsa.peer.bind.v1"
});

const VALID = /^[A-Za-z0-9._-]+$/;

export function secureKeyFor(slot) {
  const key = SECRET_KEYS[slot];
  if (typeof key !== "string" || !key || !VALID.test(key)) {
    throw new Error(`No secure-store name for the "${slot}" slot.`);
  }
  return key;
}
