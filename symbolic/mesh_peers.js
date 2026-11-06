// Peer identity for the Yehsa mesh. No filesystem and no radio calls.
// A peer is another install. It is never the owner of this one.

export const MESH_NAME_PREFIX = "YEHSA";
export const MESH_SERVICE_UUID = "59454853-4100-4d45-5348-000000000001";
// Optional write target for a short offline note. Absent means the note stays on the phone.
export const MESH_NOTE_UUID = "59454853-4100-4d45-5348-000000000002";

export const EXTERIOR_PEER = Object.freeze({
  owner: false,
  relation: "exterior-mesh-peer"
});

const MAC_RE = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/;

export function isYehsaName(name) {
  return typeof name === "string" && /^yehsa($|[^a-z0-9])/i.test(name.trim());
}

export function cleanName(name) {
  if (typeof name !== "string") return "";
  const cleaned = name.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned || cleaned.length > 64) return "";
  return cleaned;
}

export function normalizeMac(address) {
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

function readRssi(raw) {
  if (typeof raw.rssi === "number" && Number.isFinite(raw.rssi) && raw.rssi <= 20 && raw.rssi >= -127) {
    return raw.rssi;
  }
  return null;
}

export function normalizePeer(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const address = normalizeMac(raw.address);
  if (!address) return null;
  const uuids = collectUuids(raw);
  const uuidHit = uuids.some((uuid) => uuid.toLowerCase() === MESH_SERVICE_UUID);
  const name = cleanName(raw.name);
  if (!uuidHit && !isYehsaName(name)) return null;
  return {
    address,
    name: isYehsaName(name) ? name : MESH_NAME_PREFIX,
    rssi: readRssi(raw),
    serviceUuid: uuidHit ? MESH_SERVICE_UUID : null,
    lastSeen: Date.now(),
    source: "ble-passive",
    ...EXTERIOR_PEER
  };
}

function cleanRadioId(id) {
  if (typeof id !== "string") return null;
  const cleaned = id.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned || cleaned.length > 80) return null;
  if (normalizeMac(cleaned)) return null;
  return cleaned;
}

/**
 * A Bluetooth LE peer this phone actually saw.
 * MAC advertisements use the Termux shape. Web Bluetooth has no MAC, so the
 * browser device id is kept as an id and is never rewritten into a fake address.
 */
export function acceptRadioPeer(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (normalizeMac(raw.address)) return normalizePeer(raw);
  const id = cleanRadioId(raw.id);
  if (!id) return null;
  const uuids = collectUuids(raw);
  const uuidHit = uuids.some((uuid) => uuid.toLowerCase() === MESH_SERVICE_UUID.toLowerCase());
  const name = cleanName(raw.name);
  if (!uuidHit && !isYehsaName(name)) return null;
  const source = raw.source === "web-bluetooth" ? "web-bluetooth" : "ble-radio";
  return {
    address: null,
    id,
    name: isYehsaName(name) ? name : MESH_NAME_PREFIX,
    rssi: readRssi(raw),
    serviceUuid: uuidHit ? MESH_SERVICE_UUID : null,
    lastSeen: Date.now(),
    source,
    ...EXTERIOR_PEER
  };
}

export function peerKey(peer) {
  if (!peer || typeof peer !== "object") return null;
  if (typeof peer.address === "string" && peer.address) return peer.address;
  if (typeof peer.id === "string" && peer.id) return `id:${peer.id}`;
  return null;
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

/**
 * Same refusal as the Termux join path: do not replace a live primary,
 * and do not open a second secondary over one already held.
 */
export function linkBlock(link, key, role) {
  const primary = link?.primary;
  const secondary = link?.secondary;
  if (primary?.radio === true && peerKey(primary) === key) {
    return { ok: true, alreadyConnected: true, reason: null };
  }
  if (primary?.radio === true && role !== "secondary") {
    return { ok: false, alreadyConnected: false, reason: "refusing to replace the active mesh link" };
  }
  if (role === "secondary" && secondary?.radio === true) {
    return { ok: true, alreadyConnected: true, reason: null };
  }
  return null;
}
