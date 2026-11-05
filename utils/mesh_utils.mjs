import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { pathToFileURL } from "url";

const MAX_PAYLOAD_BYTES = 16 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const sentSet = new Set();

const MAC_RE = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const SCAN_COMMAND = "termux-bluetooth-scan";
const CONNECT_COMMAND = "termux-bluetooth-connect";
const SEND_COMMAND = "termux-bluetooth-send";
const MAX_HELPER_BYTES = 64 * 1024;
const MAX_PEERS = 64;

// Local Yehsa mesh marker. Advertisements that do not carry this name or
// service UUID are not stored. This is peer discovery for this mesh, not a
// log of every nearby radio.
export const MESH_NAME_PREFIX = "YEHSA";
export const MESH_SERVICE_UUID = "59454853-4100-4d45-5348-000000000001";
export const PASSIVE_SCAN_MARKER = "YEHSA_PASSIVE_LE_SCAN";
export const PASSIVE_CONNECT_MARKER = "YEHSA_PASSIVE_LE_CONNECT";

// BLE passive / low-power observer. Android can hear advertisements while a
// GATT link stays up. Classic inquiry (startDiscovery) is intentionally absent:
// the platform documents it as heavyweight against existing ACL links.
export const PASSIVE_SCAN_ARGS = Object.freeze([
  "--transport", "le",
  "--scan-type", "passive",
  "--scan-mode", "low-power",
  "--mode", "observer",
  "--filter", MESH_NAME_PREFIX,
  "--service-uuid", MESH_SERVICE_UUID,
  "--keep-link", "1",
  "--timeout", "12"
]);

const DEFAULT_PEERS = "symbolic_memory/mesh_peers.json";
const DEFAULT_LINK = "symbolic_memory/mesh_link.json";

const BLOCKED_HELPER_TEXT = [
  ["startdiscovery", "classic inquiry (startDiscovery) interferes with an active link"],
  ["canceldiscovery", "cancelDiscovery is not used while a link is held"],
  ["scaninfo", "termux-bluetooth-scaninfo uses classic discovery"],
  ["gatt.disconnect", "GATT disconnect would drop the active link"],
  ["gatt.close", "GATT close would drop the active link"],
  ["adapter.disable", "disabling the adapter would drop the active link"],
  ["bluetoothsocket", "classic RFCOMM is not the mesh join path"]
];

function meshTokenPresent() {
  // Same gate as symbolic/mesh_guard.js meshToken(). A direct env read avoids
  // loading the symbol dictionary on the Bluetooth path.
  return Boolean(process.env.YEHSA_MESH_TOKEN);
}

function isDry(options) {
  return options.dryRun === true
    || Array.isArray(options.observations)
    || process.env.YEHSA_MESH_DRY_RUN === "1";
}

function peersPath(options) {
  return options.peersPath || DEFAULT_PEERS;
}

function linkPath(options) {
  return options.linkPath || DEFAULT_LINK;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function isYehsaName(name) {
  return typeof name === "string" && /^yehsa($|[^a-z0-9])/i.test(name.trim());
}

function cleanName(name) {
  if (typeof name !== "string") return "";
  const cleaned = name.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned || cleaned.length > 64) return "";
  return cleaned;
}

function normalizeMac(address) {
  if (typeof address !== "string") return null;
  const mac = address.trim().toUpperCase();
  if (!MAC_RE.test(mac)) return null;
  if (mac === "00:00:00:00:00:00" || mac === "FF:FF:FF:FF:FF:FF") return null;
  return mac;
}

function collectUuids(raw) {
  const found = [];
  const push = (value) => {
    if (typeof value === "string" && value.trim()) found.push(value.trim());
  };
  push(raw.serviceUuid);
  push(raw.uuid);
  if (Array.isArray(raw.serviceUuids)) raw.serviceUuids.forEach(push);
  if (Array.isArray(raw.uuids)) raw.uuids.forEach(push);
  return found;
}

export function normalizePeer(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const address = normalizeMac(raw.address);
  if (!address) return null;
  const uuids = collectUuids(raw);
  const uuidHit = uuids.some((uuid) => uuid.toLowerCase() === MESH_SERVICE_UUID);
  const name = cleanName(raw.name);
  if (!uuidHit && !isYehsaName(name)) return null;
  let rssi = null;
  if (typeof raw.rssi === "number" && Number.isFinite(raw.rssi) && raw.rssi <= 20 && raw.rssi >= -127) {
    rssi = raw.rssi;
  }
  return {
    address,
    name: isYehsaName(name) ? name : MESH_NAME_PREFIX,
    rssi,
    serviceUuid: uuidHit ? MESH_SERVICE_UUID : null,
    lastSeen: Date.now(),
    source: "ble-passive"
  };
}

export function parseSightings(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return [];
  const absorb = (parsed, into) => {
    if (Array.isArray(parsed)) {
      into.push(...parsed);
      return;
    }
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.devices)) into.push(...parsed.devices);
      else if (Array.isArray(parsed.peers)) into.push(...parsed.peers);
    }
  };
  try {
    const parsed = JSON.parse(text);
    const rows = [];
    absorb(parsed, rows);
    return rows;
  } catch {
    const rows = [];
    for (const line of text.split(/\n+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        absorb(JSON.parse(trimmed), rows);
      } catch {
        // Helper chatter that is not a sighting is ignored.
      }
    }
    return rows;
  }
}

function readPeers(file) {
  const parsed = readJson(file, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((peer) => normalizePeer(peer)).filter(Boolean);
}

function readLink(file) {
  const parsed = readJson(file, {});
  const record = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const address = normalizeMac(value.address);
    if (!address) return null;
    return {
      address,
      name: cleanName(value.name) || MESH_NAME_PREFIX,
      transport: "le",
      radio: value.radio === true,
      held: true,
      status: value.radio === true ? "connected" : "dry-run",
      since: typeof value.since === "number" ? value.since : Date.now(),
      lastSeen: typeof value.lastSeen === "number" ? value.lastSeen : null
    };
  };
  return {
    primary: record(parsed.primary),
    secondary: record(parsed.secondary)
  };
}

function mergePeers(known, fresh, pinned) {
  const byAddress = new Map();
  for (const peer of known) byAddress.set(peer.address, peer);
  for (const peer of fresh) {
    const prev = byAddress.get(peer.address);
    let next = peer;
    if (prev && peer.rssi == null && prev.rssi != null) next = { ...peer, rssi: prev.rssi };
    if (prev && !next.name) next = { ...next, name: prev.name };
    byAddress.set(peer.address, next);
  }
  const pin = new Set(pinned);
  const list = [...byAddress.values()].sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  const held = list.filter((peer) => pin.has(peer.address));
  const rest = list.filter((peer) => !pin.has(peer.address));
  return [...held, ...rest].slice(0, MAX_PEERS);
}

function noteSightings(link, accepted) {
  const seen = new Set(accepted.map((peer) => peer.address));
  let changed = false;
  const next = { primary: link.primary, secondary: link.secondary };
  for (const key of ["primary", "secondary"]) {
    const record = next[key];
    if (record && seen.has(record.address)) {
      next[key] = { ...record, lastSeen: Date.now() };
      changed = true;
    }
  }
  return changed ? next : link;
}

function assertNonInterfering(args) {
  for (const arg of args) {
    const lower = String(arg).toLowerCase();
    if (
      lower.includes("disconnect")
      || lower.includes("startdiscovery")
      || lower.includes("canceldiscovery")
      || lower === "classic"
      || lower === "bredr"
      || lower === "inquiry"
      || lower === "disable"
      || lower === "unpair"
      || lower === "reset"
    ) {
      throw new Error("refusing interfering bluetooth argument");
    }
  }
}

export function connectArgs(address) {
  return [
    "--transport", "le",
    "--keep-existing", "1",
    "--address", address,
    "--service-uuid", MESH_SERVICE_UUID
  ];
}

function resolveCommand(name, options) {
  if (name !== SCAN_COMMAND && name !== CONNECT_COMMAND) return null;
  const custom = options.resolveCommand;
  const found = typeof custom === "function" ? custom(name) : defaultResolve(name);
  if (typeof found !== "string" || !found) return null;
  if (found.includes("\0") || /[\r\n]/.test(found)) return null;
  const base = path.basename(found);
  if (base !== name) return null;
  if (base === "sh" || base === "bash" || base === "dash" || base.includes("scaninfo")) return null;
  return found;
}

function defaultResolve(name) {
  const pathEnv = process.env.PATH || "";
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const full = path.join(dir, name);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch {
      // Next PATH entry.
    }
  }
  return null;
}

function readHelperContract(file, marker) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return { ok: false, reason: `${path.basename(file)} is not installed` };
  }
  if (!stat.isFile() || stat.size > MAX_HELPER_BYTES || stat.size === 0) {
    return { ok: false, reason: `${path.basename(file)} is not a small script Yehsa can check` };
  }
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { ok: false, reason: `${path.basename(file)} is not readable` };
  }
  if (text.includes("\u0000")) {
    return { ok: false, reason: `${path.basename(file)} is a binary; Yehsa only runs a checked passive script` };
  }
  const lower = text.toLowerCase();
  for (const [needle, why] of BLOCKED_HELPER_TEXT) {
    if (lower.includes(needle)) {
      return { ok: false, reason: `refusing ${path.basename(file)}: ${why}` };
    }
  }
  if (!text.includes(marker)) {
    return { ok: false, reason: `${path.basename(file)} does not declare ${marker}` };
  }
  if (marker === PASSIVE_CONNECT_MARKER && !text.includes("keep-existing")) {
    return { ok: false, reason: `${path.basename(file)} does not declare keep-existing` };
  }
  return { ok: true };
}

function prepareRadio(command, marker, options) {
  if (isDry(options)) {
    return { run: false, absent: true, reason: "dry-run: radio was not started" };
  }
  const resolved = resolveCommand(command, options);
  if (!resolved) {
    return { run: false, absent: true, reason: `${command} is not installed; active link unchanged` };
  }
  const contract = readHelperContract(resolved, marker);
  if (!contract.ok) return { run: false, absent: false, reason: contract.reason };
  if (!meshTokenPresent()) {
    return { run: false, absent: false, reason: "YEHSA_MESH_TOKEN is not set" };
  }
  return { run: true, absent: false, resolved, reason: null };
}

function runFile(run, file, args, timeoutMs) {
  assertNonInterfering(args);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ err: new Error("timeout"), stdout: "", stderr: "", timedOut: true });
    }, timeoutMs + 1000);
    try {
      run(file, args, { timeout: timeoutMs, maxBuffer: 256 * 1024 }, (err, stdout, stderr) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          err: err || null,
          stdout: stdout == null ? "" : String(stdout),
          stderr: stderr == null ? "" : String(stderr),
          timedOut: Boolean(err && (err.killed || err.code === "ETIMEDOUT"))
        });
      });
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ err, stdout: "", stderr: "", timedOut: false });
      }
    }
  });
}

/**
 * Send on the Bluetooth session that is already up.
 * Does not scan, connect, or disconnect.
 */
export function sendMeshSignal(data) {
  const key = JSON.stringify(data);
  if (key === undefined) {
    console.error("[Mesh Error] payload is not JSON-serializable");
    return;
  }
  if (sentSet.has(key)) {
    console.log("[🛑 DUPLICATE TX]", key);
    return;
  }

  const payload = Buffer.from(key, "utf8");
  if (payload.length === 0 || payload.length > MAX_PAYLOAD_BYTES) {
    console.error("[Mesh Error] payload empty or larger than 16KB");
    return;
  }

  const encoded = payload.toString("base64");
  if (!BASE64_RE.test(encoded) || encoded.length > MAX_PAYLOAD_BYTES * 2) {
    console.error("[Mesh Error] encoded payload failed charset or size check");
    return;
  }

  sentSet.add(key);
  execFile(SEND_COMMAND, ["--data", encoded], (err) => {
    if (err) {
      console.error("[Mesh Error]", err);
    } else {
      console.log("[Mesh Sent]", data);
    }
  });
}

export async function discoverMeshPeers(options = {}) {
  const peersFile = peersPath(options);
  const linkFile = linkPath(options);
  const known = readPeers(peersFile);
  const link = readLink(linkFile);
  let sightings = [];
  let invoked = false;
  let degraded = false;
  let reason = null;

  if (isDry(options)) {
    sightings = Array.isArray(options.observations) ? options.observations : [];
    degraded = true;
    reason = "dry-run: radio scan was not started";
  } else {
    const prepared = prepareRadio(SCAN_COMMAND, PASSIVE_SCAN_MARKER, options);
    if (!prepared.run) {
      degraded = true;
      reason = prepared.reason;
    } else {
      invoked = true;
      const args = PASSIVE_SCAN_ARGS.slice();
      const run = options.runFile || execFile;
      const result = await runFile(run, prepared.resolved, args, 15000);
      sightings = parseSightings(result.stdout);
      if (result.timedOut) {
        degraded = true;
        reason = "passive scan helper timed out; it was not told to disconnect";
      } else if (result.err && result.err.code === "ENOENT") {
        degraded = true;
        reason = "termux-bluetooth-scan is not installed; active link unchanged";
      } else if (result.err) {
        degraded = true;
        reason = "passive scan helper failed; active link unchanged";
      }
    }
  }

  const accepted = [];
  for (const raw of sightings) {
    const peer = normalizePeer(raw);
    if (peer) accepted.push(peer);
  }
  const pinned = [link.primary?.address, link.secondary?.address].filter(Boolean);
  const peers = mergePeers(known, accepted, pinned);
  writeJson(peersFile, peers);
  const nextLink = noteSightings(link, accepted);
  if (nextLink !== link) writeJson(linkFile, nextLink);

  return {
    ok: true,
    degraded,
    reason,
    invoked,
    interfered: false,
    scanMode: "passive-observer",
    activeLink: nextLink.primary || null,
    peers
  };
}

function rememberDryLink(link, peer, role) {
  const record = {
    address: peer.address,
    name: peer.name,
    transport: "le",
    radio: false,
    held: true,
    status: "dry-run",
    since: Date.now(),
    lastSeen: peer.lastSeen
  };
  const next = { primary: link.primary, secondary: link.secondary };
  if (role === "secondary") {
    next.secondary = record;
    return next;
  }
  if (link.primary?.radio === true) return null;
  next.primary = record;
  return next;
}

export async function connectMeshPeer(address, options = {}) {
  const mac = normalizeMac(address);
  if (!mac) {
    return { ok: false, invoked: false, degraded: true, interfered: false, reason: "address is not a bluetooth mac" };
  }
  const peers = readPeers(peersPath(options));
  const peer = peers.find((item) => item.address === mac);
  if (!peer) {
    return {
      ok: false,
      invoked: false,
      degraded: true,
      interfered: false,
      reason: "address is not a remembered Yehsa mesh peer"
    };
  }

  const file = linkPath(options);
  const link = readLink(file);
  const role = options.role === "secondary" ? "secondary" : "primary";
  if (link.primary?.radio === true && link.primary.address === mac) {
    return { ok: true, alreadyConnected: true, invoked: false, degraded: false, interfered: false, reason: null };
  }
  if (link.primary?.radio === true && role === "primary") {
    return {
      ok: false,
      invoked: false,
      degraded: true,
      interfered: false,
      reason: "refusing to replace the active mesh link"
    };
  }
  if (role === "secondary" && link.secondary?.radio === true) {
    return { ok: true, alreadyConnected: true, invoked: false, degraded: false, interfered: false, reason: null };
  }

  const prepared = prepareRadio(CONNECT_COMMAND, PASSIVE_CONNECT_MARKER, options);
  if (!prepared.run) {
    if (!prepared.absent) {
      return { ok: false, invoked: false, degraded: true, interfered: false, reason: prepared.reason };
    }
    const next = rememberDryLink(link, peer, role);
    if (!next) {
      return {
        ok: false,
        invoked: false,
        degraded: true,
        interfered: false,
        reason: "refusing to replace the active mesh link"
      };
    }
    writeJson(file, next);
    return { ok: true, invoked: false, degraded: true, interfered: false, reason: prepared.reason };
  }

  const args = connectArgs(mac);
  const run = options.runFile || execFile;
  const result = await runFile(run, prepared.resolved, args, 10000);
  if (result.err || result.timedOut) {
    return {
      ok: false,
      invoked: true,
      degraded: true,
      interfered: false,
      reason: result.timedOut
        ? "connect helper timed out; active link was not told to disconnect"
        : "connect helper failed; active link unchanged"
    };
  }

  const fresh = readLink(file);
  const record = {
    address: mac,
    name: peer.name,
    transport: "le",
    radio: true,
    held: true,
    status: "connected",
    since: Date.now(),
    lastSeen: peer.lastSeen
  };
  const next = { primary: fresh.primary, secondary: fresh.secondary };
  if (role === "secondary") {
    if (fresh.primary?.radio === true) next.primary = fresh.primary;
    next.secondary = record;
  } else if (fresh.primary?.radio === true && fresh.primary.address !== mac) {
    return {
      ok: false,
      invoked: true,
      degraded: true,
      interfered: false,
      reason: "refusing to replace the active mesh link"
    };
  } else {
    next.primary = record;
  }
  writeJson(file, next);
  return { ok: true, invoked: true, degraded: false, interfered: false, reason: null };
}

function rssiRank(peer) {
  return typeof peer.rssi === "number" ? peer.rssi : -127;
}

export async function joinMesh(options = {}) {
  const discovered = await discoverMeshPeers(options);
  const file = linkPath(options);
  let link = readLink(file);
  const ranked = [...discovered.peers].sort((a, b) => rssiRank(b) - rssiRank(a));
  const primaryHeld = link.primary?.radio === true ? link.primary : null;
  let connectResult;

  if (primaryHeld) {
    const extra = ranked.find((peer) => peer.address !== primaryHeld.address);
    if (extra && !(link.secondary?.radio === true)) {
      connectResult = await connectMeshPeer(extra.address, { ...options, role: "secondary" });
    } else {
      connectResult = {
        ok: true,
        alreadyConnected: true,
        invoked: false,
        degraded: discovered.degraded,
        reason: null
      };
    }
  } else if (ranked[0]) {
    connectResult = await connectMeshPeer(ranked[0].address, { ...options, role: "primary" });
  } else {
    connectResult = {
      ok: true,
      invoked: false,
      degraded: true,
      reason: "no Yehsa mesh peers in range"
    };
  }

  link = readLink(file);
  return {
    ok: connectResult.ok !== false,
    degraded: Boolean(discovered.degraded || connectResult.degraded),
    reason: connectResult.reason || discovered.reason,
    interfered: false,
    invoked: Boolean(discovered.invoked || connectResult.invoked),
    scanMode: "passive-observer",
    peers: discovered.peers,
    link,
    connected: link.primary?.radio === true
  };
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const cmd = process.argv[2] || "discover";
  const run = cmd === "join" ? joinMesh() : discoverMeshPeers();
  run.then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  }).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
