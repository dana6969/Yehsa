// A copied app directory is foreign when the Keystore cannot unwrap it.
// A platform id string is not the secret. The binding token lives in SecureStore.

import { sha256Hex } from "./owner_bind.js";

export const CLONE_MESSAGE = "This copy can't open the original owner's chats";

export const ATTESTATION_PROVES = "When a phone offers key attestation, the certificate says the Keystore key was created in the TEE or StrongBox and that the private key is not exportable. It does not name the person holding the unlocked phone, and many phones do not offer it. This build does not require attestation to fail closed.";

export function attestationStatus() {
  return { available: false, checked: false, proves: ATTESTATION_PROVES };
}

export function bindCommitment(token) {
  const bytes = token instanceof Uint8Array ? token : new Uint8Array(token);
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return sha256Hex(hex);
}

export function deviceBindAgrees(commitment, token) {
  if (!commitment) return { ok: true, reason: null };
  if (!token) return { ok: false, reason: "The device-binding token did not unwrap." };
  const same = bindCommitment(token) === commitment;
  return { ok: same, reason: same ? null : "The device-binding token is not this phone." };
}

export function cloneDecision({ unwrapFailed, bindOk, ownerRecognized }) {
  if (unwrapFailed === true || bindOk === false) {
    return {
      foreign: true,
      useOldIdentity: false,
      recover: false,
      message: CLONE_MESSAGE,
      ownerRecognized: ownerRecognized === true
    };
  }
  return { foreign: false, useOldIdentity: true, recover: false, message: null, ownerRecognized: ownerRecognized === true };
}

export function unwrapError() {
  const err = new Error("SecureStore unwrap failed");
  err.code = "unwrap-failed";
  return err;
}
