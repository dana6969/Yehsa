// The phone's one identity. Import from here: getOrCreateIdentity, publicKey, safetyNumber, sign,
// seal, open, replaceIdentity, explain. See symbolic/identity_keys.js for what each one returns.
import "./install_prng.js";
import { createIdentityKeys, verifySignature } from "../../symbolic/identity_keys.js";
import { peerVault } from "./mesh_keys.js";

const keys = createIdentityKeys(peerVault());

export const getOrCreateIdentity = keys.getOrCreateIdentity;
export const publicKey = keys.publicKey;
export const safetyNumber = keys.safetyNumber;
export const sign = keys.sign;
export const seal = keys.seal;
export const open = keys.open;
export const replaceIdentity = keys.replaceIdentity;
export const explain = keys.explain;
export { verifySignature };
