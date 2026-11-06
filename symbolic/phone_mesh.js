// Mesh session for the Expo screen. Scanning is a real probe result, never a invented peer list.
// The offline phone hook stays available after this install is bound, with or without a position lock.
// No cipher is claimed. A live primary link is not replaced.

import { acceptRadioPeer, linkBlock, peerKey } from "./mesh_peers.js";

const UNSAFE = /[\u0000-\u001F\u007F]/;
const MAX_PEERS = 64;
const MAX_OUTBOX = 20;

export function assertMeshText(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 500 || UNSAFE.test(trimmed)) return null;
  return trimmed;
}

export function phoneHooks({ radioUp = false, owner, interfered = false } = {}) {
  const recognized = owner?.recognized === true;
  const dropped = interfered === true;
  return {
    service: "offline-phone",
    cellular: false,
    billing: "none",
    status: radioUp && recognized ? "up" : "local-only",
    available: recognized,
    staysUp: recognized,
    held: !dropped,
    interfered: dropped,
    dependsOnPosition: false,
    positionLock: "opt-in",
    positionShared: false,
    positionRequired: false,
    usage: "Offline mesh phone stays up without a position lock. Position lock is a separate local opt-in."
  };
}

export function initialMeshSession() {
  return {
    scanned: false,
    degraded: true,
    invoked: false,
    interfered: false,
    reason: "Discovery has not been run.",
    scanMode: null,
    peers: [],
    link: { primary: null, secondary: null },
    outbox: [],
    owner: null,
    phone: phoneHooks()
  };
}

function withPhone(session) {
  const radioUp = session.link?.primary?.radio === true;
  const interfered = session.interfered === true;
  return {
    ...session,
    interfered,
    phone: phoneHooks({ radioUp, owner: session.owner, interfered })
  };
}

function applyLostIds(link, lostIds, keepKey) {
  if (!Array.isArray(lostIds) || lostIds.length === 0) return link;
  const lost = new Set(lostIds);
  const next = {
    primary: link?.primary || null,
    secondary: link?.secondary || null
  };
  for (const slot of ["primary", "secondary"]) {
    const record = next[slot];
    const key = record?.address || record?.id;
    if (key && lost.has(key) && key !== keepKey) next[slot] = null;
  }
  return next;
}

const LOST_NOTE = "A link that was held before this radio step was no longer connected afterward. Yehsa did not send a disconnect. Peers stay exterior. No cipher is claimed.";

export function attachOwner(session, owner) {
  return withPhone({ ...(session || initialMeshSession()), owner: owner || null });
}

function mergePeers(known, fresh, pinned) {
  const byKey = new Map();
  for (const peer of known) {
    const key = peerKey(peer);
    if (key) byKey.set(key, peer);
  }
  for (const peer of fresh) {
    const key = peerKey(peer);
    if (!key) continue;
    const prev = byKey.get(key);
    let next = peer;
    if (prev && peer.rssi == null && prev.rssi != null) next = { ...peer, rssi: prev.rssi };
    if (prev && !next.name) next = { ...next, name: prev.name };
    byKey.set(key, next);
  }
  const pin = new Set(pinned);
  const list = [...byKey.values()].sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  const held = list.filter((peer) => pin.has(peerKey(peer)));
  const rest = list.filter((peer) => !pin.has(peerKey(peer)));
  return [...held, ...rest].slice(0, MAX_PEERS);
}

function touchLink(link, accepted) {
  const seen = new Set(accepted.map((peer) => peerKey(peer)).filter(Boolean));
  const next = { primary: link?.primary || null, secondary: link?.secondary || null };
  for (const slot of ["primary", "secondary"]) {
    const record = next[slot];
    if (record && seen.has(peerKey(record))) {
      next[slot] = { ...record, lastSeen: Date.now() };
    }
  }
  return next;
}

/**
 * Fold a platform probe into the session.
 * Peers are kept only when the probe says it actually scanned.
 * A missing radio stays degraded and does not invent devices.
 */
export function applyScan(session, report) {
  const current = session || initialMeshSession();
  if (current.owner?.recognized !== true) {
    return withPhone({
      ...current,
      scanned: true,
      degraded: true,
      invoked: false,
      reason: "device ownership denied",
      scanMode: null
    });
  }
  const available = report?.available === true;
  const invoked = report?.invoked === true;
  if (!available || !invoked) {
    const lost = Array.isArray(report?.lostIds) && report.lostIds.length > 0;
    return withPhone({
      ...current,
      scanned: true,
      degraded: true,
      invoked: false,
      interfered: lost,
      reason: lost ? LOST_NOTE : (report?.reason || "Discovery is degraded. No radio scan ran."),
      scanMode: report?.scanMode || null,
      link: applyLostIds(current.link, report?.lostIds, null)
    });
  }
  const accepted = [];
  for (const raw of report.peers || []) {
    const peer = acceptRadioPeer(raw);
    if (peer) accepted.push(peer);
  }
  const pinned = [peerKey(current.link?.primary), peerKey(current.link?.secondary)].filter(Boolean);
  const peers = mergePeers(current.peers, accepted, pinned);
  const lost = Array.isArray(report?.lostIds) && report.lostIds.length > 0;
  const link = applyLostIds(touchLink(current.link, accepted), report?.lostIds, null);
  return withPhone({
    ...current,
    scanned: true,
    degraded: lost && !link.primary,
    invoked: true,
    interfered: lost,
    reason: lost
      ? LOST_NOTE
      : (accepted.length ? null : "Scan finished. No Yehsa peers heard."),
    scanMode: report.scanMode || "passive-observer",
    peers,
    link
  });
}

function roleFor(link, key) {
  if (link?.primary?.radio === true && peerKey(link.primary) !== key) return "secondary";
  return "primary";
}

function linkRecord(peer, radio) {
  return {
    address: peer.address || null,
    id: peer.id || null,
    name: peer.name,
    transport: "le",
    radio: radio === true,
    held: true,
    status: radio === true ? "connected" : "dry-run",
    since: Date.now(),
    lastSeen: peer.lastSeen || Date.now(),
    owner: false,
    relation: "exterior-mesh-peer"
  };
}

/**
 * Connect one remembered peer. A live primary is not replaced.
 * radio stays false unless the platform reports a real connection.
 */
export function applyConnect(session, addressOrId, report) {
  const current = session || initialMeshSession();
  if (current.owner?.recognized !== true) {
    return {
      ok: false,
      degraded: true,
      interfered: false,
      reason: "device ownership denied",
      session: withPhone({ ...current, degraded: true, reason: "device ownership denied" })
    };
  }
  const peer = (current.peers || []).find((item) => {
    return item.address === addressOrId || item.id === addressOrId || peerKey(item) === addressOrId;
  });
  if (!peer) {
    const reason = "address is not a remembered Yehsa mesh peer";
    return {
      ok: false,
      degraded: true,
      interfered: false,
      reason,
      session: withPhone({ ...current, degraded: true, reason })
    };
  }
  const key = peerKey(peer);
  const role = roleFor(current.link, key);
  const blocked = linkBlock(current.link, key, role);
  if (blocked) {
    return {
      ok: blocked.ok === true,
      alreadyConnected: blocked.alreadyConnected === true,
      degraded: blocked.ok !== true,
      interfered: false,
      reason: blocked.reason,
      session: withPhone({
        ...current,
        degraded: blocked.ok !== true,
        reason: blocked.reason || current.reason
      })
    };
  }
  if (report?.radio !== true) {
    const reason = report?.reason || "BLE connect is not available. No radio link was invented.";
    return {
      ok: false,
      degraded: true,
      interfered: false,
      reason,
      session: withPhone({ ...current, degraded: true, invoked: false, reason })
    };
  }
  const record = linkRecord(peer, true);
  let link = {
    primary: current.link?.primary || null,
    secondary: current.link?.secondary || null
  };
  if (role === "secondary") link.secondary = record;
  else link.primary = record;
  const lost = Array.isArray(report?.lostIds) && report.lostIds.length > 0;
  link = applyLostIds(link, report?.lostIds, key);
  const next = withPhone({
    ...current,
    degraded: false,
    invoked: true,
    interfered: lost,
    reason: lost ? LOST_NOTE : null,
    link
  });
  return { ok: true, degraded: false, interfered: lost, reason: lost ? LOST_NOTE : null, session: next };
}

export function rememberRadioPeer(session, raw, report) {
  const current = session || initialMeshSession();
  const peer = acceptRadioPeer(raw);
  if (current.owner?.recognized !== true) {
    const denied = withPhone({
      ...current,
      scanned: true,
      degraded: true,
      invoked: false,
      reason: "device ownership denied"
    });
    return { ok: false, reason: "device ownership denied", session: denied };
  }
  if (!peer) {
    const reason = "That device is not a Yehsa peer. No link was invented.";
    return {
      ok: false,
      reason,
      session: withPhone({ ...current, scanned: true, degraded: true, reason })
    };
  }
  const scanned = applyScan(current, {
    available: true,
    invoked: true,
    peers: [raw],
    scanMode: report?.scanMode || "chooser",
    reason: null
  });
  return applyConnect(scanned, peer.address || peer.id, report);
}

export function queueServiceText(session, text) {
  const current = session || initialMeshSession();
  if (current.owner?.recognized !== true) {
    return {
      ok: false,
      reason: "device ownership denied",
      positionShared: false,
      transmitted: false,
      session: current
    };
  }
  const spoken = assertMeshText(text);
  if (!spoken) {
    return {
      ok: false,
      reason: "mesh message rejected",
      positionShared: false,
      transmitted: false,
      session: current
    };
  }
  const item = {
    text: spoken,
    queuedAt: Date.now(),
    delivered: "held-on-device",
    transmitted: false,
    cellular: false,
    positionShared: false
  };
  const outbox = [...(current.outbox || []), item].slice(-MAX_OUTBOX);
  return {
    ok: true,
    item,
    positionShared: false,
    transmitted: false,
    session: withPhone({ ...current, outbox })
  };
}

export function markTransmitted(session, queuedAt, sent) {
  const current = session || initialMeshSession();
  if (sent !== true) return current;
  const outbox = (current.outbox || []).map((item) => {
    if (item.queuedAt !== queuedAt || item.transmitted === true) return item;
    return { ...item, transmitted: true, delivered: "queued-on-held-link", positionShared: false };
  });
  return withPhone({ ...current, outbox });
}

export function meshScreenStatus(session) {
  const current = session || initialMeshSession();
  const radio = current.link?.primary?.radio === true;
  const peerCount = Array.isArray(current.peers) ? current.peers.length : 0;
  let readiness = "degraded";
  let headline = "Discovery is degraded on this device.";
  if (!current.scanned) {
    readiness = "degraded";
    headline = "Discovery has not been run.";
  } else if (current.invoked && radio) {
    readiness = "linked";
    headline = `BLE link held. ${peerCount} remembered peer${peerCount === 1 ? "" : "s"}.`;
  } else if (current.invoked && peerCount > 0) {
    readiness = "heard";
    headline = `${peerCount} Yehsa peer${peerCount === 1 ? "" : "s"} heard. No link is held.`;
  } else if (current.invoked) {
    readiness = "empty";
    headline = "Scan finished. No Yehsa peers heard.";
  }
  const detail = current.reason
    || "Peers are exterior and cannot run symbols here. No cipher is claimed.";
  const ownerLine = current.owner?.recognized
    ? `This install is bound to this device (${current.owner.source || "this device"}). Exterior access is denied. No cipher is claimed.`
    : (current.owner?.reason || "This install is not bound yet.");
  return {
    readiness,
    title: "Offline phone",
    headline,
    detail,
    rows: [
      {
        label: "Service",
        value: "Offline phone. No cellular call and no bill. This stays up without a position lock."
      },
      {
        label: "Radio",
        value: radio
          ? "A BLE link is held. Discovery does not disconnect it."
          : (current.invoked
            ? "Scan ran. No link is held."
            : "Not ready. Discovery was not run, or the radio is unavailable.")
      },
      {
        label: "Position",
        value: "The phone service stays up without a position lock. Locking a position is a separate consent."
      },
      { label: "Ownership", value: ownerLine }
    ],
    peers: current.peers || [],
    phone: current.phone || phoneHooks({ radioUp: radio, owner: current.owner })
  };
}
