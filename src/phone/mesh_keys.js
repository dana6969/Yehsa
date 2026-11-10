// Web has no device secure store. The private key is not written anywhere.

export async function savePeerSecret() {
  return { ok: false, reason: "This browser has no secure store. The private key is not saved." };
}

export async function readPeerSecret() {
  return null;
}
