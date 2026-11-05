import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { ensureLocalOwner } from "../symbolic/device_owner.js";
import { lockPosition } from "../symbolic/position_lock.js";
import { joinMesh, sendMeshSignal } from "./mesh_utils.mjs";

const DEFAULT_QUEUE = "symbolic_memory/mesh_queue.jsonl";
const UNSAFE = /[\u0000-\u001F\u007F]/;

export function assertMeshText(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 500 || UNSAFE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Offline mesh phone service for the person on this device.
 * Stays up without a position lock. Does not place a cellular call.
 */
export async function meshPhoneService(options = {}) {
  const mesh = await joinMesh(options);
  const phone = mesh.phoneService || {
    service: "offline-phone",
    cellular: false,
    billing: "none",
    status: "local-only",
    available: mesh.ok !== false,
    staysUp: mesh.ok !== false,
    held: true,
    interfered: false,
    dependsOnPosition: false,
    positionLock: "opt-in",
    positionShared: false
  };
  return {
    ...phone,
    ok: mesh.ok !== false,
    peerCount: Array.isArray(mesh.peers) ? mesh.peers.length : 0,
    activeLink: mesh.link?.primary
      ? { address: mesh.link.primary.address, held: true, owner: false }
      : null,
    usage: "Offline mesh phone stays up without a position lock. Position lock is a separate local opt-in."
  };
}

export function sendMeshMessage(text, options = {}) {
  const spoken = assertMeshText(text);
  if (!spoken) {
    return { ok: false, service: "offline-phone", reason: "mesh message rejected", positionShared: false };
  }
  const owner = ensureLocalOwner(options.ownerPath ? { ownerPath: options.ownerPath } : {});
  if (!owner.recognized) {
    return { ok: false, service: "offline-phone", reason: "device ownership denied", positionShared: false };
  }
  const payload = {
    channel: "ble",
    service: "offline-phone",
    text: spoken,
    queuedAt: Date.now()
  };
  const queue = options.queuePath || DEFAULT_QUEUE;
  fs.mkdirSync(path.dirname(queue), { recursive: true });
  fs.appendFileSync(queue, `${JSON.stringify(payload)}\n`);
  const send = options.send || sendMeshSignal;
  send(payload);
  return {
    ok: true,
    service: "offline-phone",
    cellular: false,
    delivered: "queued-on-held-link",
    text: spoken,
    positionShared: false
  };
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const words = args.filter((arg) => !arg.startsWith("--"));
  const command = words[0] === "send" || words[0] === "lock" ? words[0] : "phone";
  const run = command === "lock"
    ? lockPosition({ consent: flags.has("--consent"), share: flags.has("--share"), ingress: "local" })
    : command === "send"
      ? Promise.resolve(sendMeshMessage(words.slice(1).join(" ")))
      : meshPhoneService();
  run.then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok === false ? 1 : 0;
  }).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
