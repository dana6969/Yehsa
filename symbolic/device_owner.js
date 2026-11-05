import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const DEFAULT_OWNER = "symbolic_memory/device_owner.json";
const INSTALL_ID_RE = /^[a-f0-9]{32}$/;

const PHONE_ID_RE = /^[A-Za-z0-9]{8,64}$/;

/**
 * The phone this process is actually on. A Linux machine-id or hostname is not a phone.
 * options.phoneId is only for a local test harness; it is not read from the environment
 * or from a network client.
 */
export function readPhoneId(options = {}) {
  if (typeof options.phoneId === "string" && PHONE_ID_RE.test(options.phoneId)) {
    return { id: options.phoneId, source: "android-id" };
  }
  try {
    const androidId = execFileSync("settings", ["get", "secure", "android_id"], {
      encoding: "utf8",
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (PHONE_ID_RE.test(androidId) && androidId.toLowerCase() !== "null") {
      return { id: androidId, source: "android-id" };
    }
  } catch {
    // Not the Termux/Android shell.
  }
  return null;
}

export function currentDeviceMark(options = {}) {
  const phone = readPhoneId(options);
  if (!phone) return { mark: null, sources: [], phoneBound: false };
  return {
    mark: crypto.createHash("sha256").update(`android-id:${phone.id}`).digest("hex"),
    sources: [phone.source],
    phoneBound: true
  };
}

function readOwner(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function labels(extra) {
  return {
    recognized: false,
    ownership: "local-device",
    exterior: "deny",
    installScope: "every-phone",
    phoneWhitelist: "none",
    binding: "this-phone",
    phoneBound: false,
    installId: null,
    ...extra
  };
}

/**
 * Create or check the owner record for this install.
 * The record is minted here, on this device. It is not a global phone list.
 * A record whose device mark does not match is left in place and denied.
 */
export function ensureLocalOwner(options = {}) {
  const file = options.ownerPath || DEFAULT_OWNER;
  const current = currentDeviceMark(options);
  if (!current.phoneBound) {
    return labels({
      recognized: false,
      phoneBound: false,
      reason: "no phone identity; access refused"
    });
  }
  const existing = readOwner(file);
  if (existing) {
    const recognized = typeof existing.installId === "string"
      && INSTALL_ID_RE.test(existing.installId)
      && existing.deviceMark === current.mark
      && existing.ownership === "local-device"
      && existing.exterior === "deny";
    return labels({
      recognized,
      phoneBound: true,
      installId: recognized ? existing.installId : null,
      reason: recognized ? null : "owner file is not this phone"
    });
  }

  const record = {
    ownership: "local-device",
    exterior: "deny",
    installScope: "every-phone",
    phoneWhitelist: "none",
    binding: "this-phone",
    installId: crypto.randomBytes(16).toString("hex"),
    deviceMark: current.mark,
    markSources: current.sources,
    createdAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Some platforms ignore mode bits.
  }
  return labels({
    recognized: true,
    phoneBound: true,
    installId: record.installId,
    reason: null
  });
}
