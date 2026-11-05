import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { pathToFileURL } from "url";
import { ensureLocalOwner } from "./device_owner.js";
import { sendMeshSignal } from "../utils/mesh_utils.mjs";

const DEFAULT_POSITION = "symbolic_memory/position_lock.json";
// Satellite GNSS via the existing Termux location helper. Network and peer fixes are not used.
export const GPS_COMMAND = "termux-location";
export const GPS_ARGS = Object.freeze(["-p", "gps"]);

function runFile(run, file, args, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ err: new Error("timeout"), stdout: "", timedOut: true });
    }, timeoutMs + 500);
    try {
      run(file, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (err, stdout) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ err: err || null, stdout: stdout == null ? "" : String(stdout), timedOut: Boolean(err && err.killed) });
      });
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ err, stdout: "", timedOut: false });
      }
    }
  });
}

export function normalizeFix(raw, source) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  let accuracy = null;
  if (raw.accuracy != null && raw.accuracy !== "") {
    accuracy = Number(raw.accuracy);
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000) return null;
  }
  return {
    latitude,
    longitude,
    accuracy,
    source: source || "local-coords"
  };
}

function parseGps(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(String(stdout || "").trim());
  } catch {
    return null;
  }
  const provider = typeof parsed.provider === "string" ? parsed.provider.toLowerCase() : "gps";
  if (provider !== "gps") return null;
  return normalizeFix(parsed, "gnss");
}

function writePosition(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Some platforms ignore mode bits.
  }
}

/**
 * Lock this device's position only after explicit local consent.
 * Does not read satellites, write a fix, or share coordinates otherwise.
 * A mesh or BLE caller cannot lock this install.
 */
export async function lockPosition(options = {}) {
  if (options.ingress && options.ingress !== "local") {
    return { ok: false, locked: false, shared: false, degraded: false, fix: null, reason: "exterior denied" };
  }
  const owner = ensureLocalOwner(options.ownerPath ? { ownerPath: options.ownerPath } : {});
  if (!owner.recognized) {
    return { ok: false, locked: false, shared: false, degraded: false, fix: null, reason: "device ownership denied" };
  }
  if (options.consent !== true) {
    return {
      ok: true,
      locked: false,
      shared: false,
      degraded: false,
      provider: null,
      fix: null,
      reason: "position lock is opt-in; local consent is required"
    };
  }

  let fix = normalizeFix(options.fix, "local-coords");
  let degraded = false;
  let reason = null;
  if (!fix) {
    const run = options.runFile || execFile;
    const result = await runFile(run, GPS_COMMAND, GPS_ARGS.slice(), 15000);
    fix = parseGps(result.stdout);
    if (!fix) {
      degraded = true;
      if (result.err && result.err.code === "ENOENT") reason = "termux-location is not installed";
      else if (result.timedOut) reason = "satellite fix timed out";
      else reason = "satellite fix unavailable";
    }
  }

  if (!fix) {
    return { ok: true, locked: false, shared: false, degraded, provider: "gps", fix: null, reason };
  }

  const file = options.positionPath || DEFAULT_POSITION;
  const record = {
    locked: true,
    shared: false,
    provider: "gps",
    source: fix.source,
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    lockedAt: new Date().toISOString(),
    consent: "local",
    exterior: "deny",
    owner: true
  };
  writePosition(file, record);

  let shared = false;
  if (options.share === true) {
    const payload = {
      channel: "ble",
      service: "position",
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy,
      provider: "gps",
      consent: "local"
    };
    const send = options.send || sendMeshSignal;
    send(payload);
    shared = true;
    writePosition(file, { ...record, shared: true });
  }

  return {
    ok: true,
    locked: true,
    shared,
    degraded: false,
    provider: "gps",
    source: fix.source,
    fix: { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy },
    reason: null
  };
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const args = new Set(process.argv.slice(2));
  lockPosition({
    consent: args.has("--consent"),
    share: args.has("--share"),
    ingress: "local"
  }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  }).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
