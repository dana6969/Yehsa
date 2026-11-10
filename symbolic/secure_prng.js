// The only random source peer keys are allowed to use.
// Math.random is refused. The phone installs expo-crypto before any key is made.

import nacl from "tweetnacl";

let source = "unset";

export function installSecurePrng(getRandomBytes, label = "csprng") {
  if (getRandomBytes === Math.random) {
    throw new Error("Math.random is not a CSPRNG.");
  }
  if (typeof getRandomBytes !== "function") {
    throw new Error("A CSPRNG function is required.");
  }
  const probe = getRandomBytes(32);
  if (!(probe instanceof Uint8Array) || probe.length !== 32) {
    throw new Error("The key source must return 32 CSPRNG bytes.");
  }
  source = label;
  nacl.setPRNG((output, length) => {
    const bytes = getRandomBytes(length);
    if (!(bytes instanceof Uint8Array) || bytes.length < length) {
      throw new Error("The CSPRNG returned too few bytes.");
    }
    output.set(bytes.subarray(0, length));
  });
}

export function prngSource() {
  return source;
}

export function ensureSecurePrng() {
  if (source !== "unset") return source;
  const web = globalThis.crypto;
  if (web && typeof web.getRandomValues === "function") {
    installSecurePrng((length) => {
      const bytes = new Uint8Array(length);
      web.getRandomValues(bytes);
      return bytes;
    }, "crypto.getRandomValues");
    return source;
  }
  throw new Error("No CSPRNG is installed. Peer keys were not created.");
}
