// The web preview keeps a demo identity in memory for this tab only.
// It is not written to a secure store and does not survive a reload.

import { createPeerVault, memoryAdapter } from "../../symbolic/peer_vault.js";

const DEMO = "This web preview is a demo identity only. It is not saved.";
const vault = createPeerVault(memoryAdapter());
let session = null;

export function peerVault() {
  return vault;
}

export async function loadOrCreateIdentity() {
  if (!session) session = vault.loadOrCreate();
  const loaded = await session;
  return { identity: loaded.identity, persisted: false, demo: true, created: loaded.created, reason: DEMO };
}

export async function savePeerSecret() {
  return { ok: false, demo: true, reason: DEMO };
}

export async function readPeerSecret() {
  return null;
}

export async function readChatUnlock() {
  return false;
}

export async function setChatUnlock() {
  return { ok: false, demo: true, reason: DEMO };
}

export async function resetPeerIdentity({ approved } = {}) {
  const result = await vault.reset({ approved });
  if (result.ok) session = null;
  return result;
}

export async function savePeerHistory(record) {
  return vault.saveHistory(record);
}

export async function loadPeerHistory() {
  return vault.loadHistory();
}

export async function exportPeerBackup() {
  return { ok: false, demo: true, reason: DEMO };
}

export async function importPeerBackup() {
  return { ok: false, demo: true, identity: null, reason: DEMO };
}
