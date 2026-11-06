// Native BLE for the Expo shell on Android and iOS.
// Scan and connect do not cancel a link already held.
// A missing module or a missing radio stays unavailable. No peers are invented.

import { MESH_NOTE_UUID, MESH_SERVICE_UUID, acceptRadioPeer } from "../../symbolic/mesh_peers.js";

const SCAN_MS = 12000;
const links = new Map();
let manager = null;
let modulePromise = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadModule() {
  if (!modulePromise) {
    modulePromise = import("react-native-ble-plx").then(
      (mod) => mod,
      () => null
    );
  }
  return modulePromise;
}

export function nativeModulePresent() {
  return true;
}

async function permissions(mod) {
  let rn = null;
  try {
    rn = await import("react-native");
  } catch {
    return false;
  }
  const Platform = rn.Platform;
  const PermissionsAndroid = rn.PermissionsAndroid;
  if (Platform?.OS !== "android" || !PermissionsAndroid?.requestMultiple) return true;
  const P = PermissionsAndroid.PERMISSIONS || {};
  const perms = [];
  if (Number(Platform.Version) >= 31) {
    if (P.BLUETOOTH_SCAN) perms.push(P.BLUETOOTH_SCAN);
    if (P.BLUETOOTH_CONNECT) perms.push(P.BLUETOOTH_CONNECT);
  } else if (P.ACCESS_FINE_LOCATION) {
    perms.push(P.ACCESS_FINE_LOCATION);
  }
  if (perms.length === 0) return true;
  const result = await PermissionsAndroid.requestMultiple(perms);
  return perms.every((perm) => result?.[perm] === PermissionsAndroid.RESULTS.GRANTED);
}

async function bleManager(mod) {
  if (manager) return manager;
  if (typeof mod?.BleManager !== "function") return null;
  try {
    manager = new mod.BleManager();
    return manager;
  } catch {
    manager = null;
    return null;
  }
}

async function connectedIds() {
  const ids = [];
  for (const [id, device] of links) {
    try {
      if (await device.isConnected()) ids.push(id);
    } catch {
      // A failed status read is not a disconnect.
    }
  }
  return ids;
}

function lostSince(before, after) {
  const still = new Set(after);
  return before.filter((id) => !still.has(id));
}

function peerFromDevice(device) {
  const id = typeof device?.id === "string" ? device.id : "";
  const name = device?.localName || device?.name || "";
  const uuids = [];
  if (Array.isArray(device?.serviceUUIDs)) uuids.push(...device.serviceUUIDs);
  if (Array.isArray(device?.serviceUuids)) uuids.push(...device.serviceUuids);
  const mac = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(id);
  return {
    name,
    id: mac ? undefined : id,
    address: mac ? id : undefined,
    rssi: typeof device?.rssi === "number" ? device.rssi : null,
    serviceUuids: uuids,
    source: "ble-radio"
  };
}

function rememberPeer(bag, device) {
  const peer = acceptRadioPeer(peerFromDevice(device));
  if (!peer) return;
  const key = peer.address || peer.id;
  if (!key) return;
  const prev = bag.get(key);
  if (!prev || (typeof peer.rssi === "number" && (prev.rssi == null || peer.rssi > prev.rssi))) {
    bag.set(key, peer);
  }
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return globalThis.btoa(binary);
}

async function radioState(radio) {
  try {
    const current = await radio.state();
    if (current === "PoweredOn") return current;
    return await new Promise((resolve) => {
      let settled = false;
      let subscription = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          subscription?.remove?.();
        } catch {
          // Removing a state listener is not a link disconnect.
        }
        resolve(value);
      };
      const timer = setTimeout(() => finish(current), 4000);
      try {
        subscription = radio.onStateChange((next) => {
          if (next === "PoweredOn" || next === "PoweredOff" || next === "Unauthorized" || next === "Unsupported") {
            finish(next);
          }
        }, false);
      } catch {
        finish(current);
      }
    });
  } catch {
    return "Unknown";
  }
}

function stateReason(state) {
  if (state === "PoweredOff") return "Bluetooth is off. No peers were invented.";
  if (state === "Unauthorized") return "Bluetooth permission was not granted. No peers were invented.";
  if (state === "Unsupported") return "This device has no Bluetooth radio. No peers were invented.";
  return "Bluetooth is not ready. No peers were invented.";
}

export async function scanNative() {
  const before = await connectedIds();
  const mod = await loadModule();
  if (!mod?.BleManager) {
    return {
      route: "none",
      available: false,
      invoked: false,
      peers: [],
      lostIds: [],
      reason: "Native BLE is not linked in this install. Expo Go does not include it. An EAS preview build does. No peers were invented.",
      scanMode: null
    };
  }
  if (!(await permissions(mod))) {
    return {
      route: "native-ble",
      available: false,
      invoked: false,
      peers: [],
      lostIds: [],
      reason: "Bluetooth permission was not granted. No peers were invented.",
      scanMode: null
    };
  }
  const radio = await bleManager(mod);
  if (!radio) {
    return {
      route: "none",
      available: false,
      invoked: false,
      peers: [],
      lostIds: [],
      reason: "Native BLE is not linked in this install. Expo Go does not include it. An EAS preview build does. No peers were invented.",
      scanMode: null
    };
  }
  const state = await radioState(radio);
  if (state !== "PoweredOn") {
    return {
      route: "native-ble",
      available: false,
      invoked: false,
      peers: [],
      lostIds: [],
      reason: stateReason(state),
      scanMode: null
    };
  }
  const seen = new Map();
  let scanError = null;
  try {
    try {
      radio.stopDeviceScan();
    } catch {
      // Stopping a previous scan is not a disconnect.
    }
    const scanMode = mod.ScanMode?.LowPower ?? 0;
    radio.startDeviceScan(null, { allowDuplicates: true, scanMode }, (error, device) => {
      if (error) {
        scanError = "The scan failed. The link already in use was not told to disconnect.";
        return;
      }
      rememberPeer(seen, device);
    });
    await delay(SCAN_MS);
  } catch {
    scanError = "The scan did not run. The link already in use was not told to disconnect.";
  } finally {
    try {
      radio.stopDeviceScan();
    } catch {
      // Stopping the scan is not a disconnect.
    }
  }
  const after = await connectedIds();
  const lostIds = lostSince(before, after);
  const peers = [...seen.values()];
  if (scanError && peers.length === 0) {
    return {
      route: "native-ble",
      available: true,
      invoked: false,
      peers: [],
      lostIds,
      reason: scanError,
      scanMode: null
    };
  }
  return {
    route: "native-ble",
    available: true,
    invoked: true,
    peers,
    lostIds,
    reason: peers.length ? null : "Scan finished. No Yehsa peers heard.",
    scanMode: "low-power"
  };
}

export async function connectNative(peer) {
  const id = peer?.id || peer?.address;
  if (!id) {
    return {
      radio: false,
      alreadyConnected: false,
      disconnectedOthers: false,
      lostIds: [],
      reason: "That peer has no device id. No link was invented.",
      peer: null
    };
  }
  const mod = await loadModule();
  const radio = mod ? await bleManager(mod) : null;
  if (!radio) {
    return {
      radio: false,
      alreadyConnected: false,
      disconnectedOthers: false,
      lostIds: [],
      reason: "Native BLE is not linked in this install. No link was invented.",
      peer: null
    };
  }
  if (!(await permissions(mod))) {
    return {
      radio: false,
      alreadyConnected: false,
      disconnectedOthers: false,
      lostIds: [],
      reason: "Bluetooth permission was not granted. The link already in use was left alone.",
      peer: null
    };
  }
  const before = await connectedIds();
  const held = links.get(id);
  if (held) {
    try {
      if (await held.isConnected()) {
        return {
          radio: true,
          alreadyConnected: true,
          disconnectedOthers: false,
          lostIds: [],
          reason: null,
          peer: null
        };
      }
    } catch {
      // A failed status read falls through to a new connect. It does not cancel other links.
    }
  }
  let device = null;
  try {
    device = await radio.connectToDevice(id, { timeout: 12000, autoConnect: false });
  } catch {
    const lostIds = lostSince(before, await connectedIds());
    return {
      radio: false,
      alreadyConnected: false,
      disconnectedOthers: lostIds.length > 0,
      lostIds,
      reason: "The device did not connect. The link already in use was left alone.",
      peer: null
    };
  }
  try {
    await device.discoverAllServicesAndCharacteristics();
  } catch {
    // A Yehsa name can still identify the peer when service discovery fails.
  }
  const seen = acceptRadioPeer(peerFromDevice(device)) || acceptRadioPeer(peer);
  if (!seen) {
    try {
      await radio.cancelDeviceConnection(id);
    } catch {
      // Only the device opened in this call is cancelled. Other links are not in this call.
    }
    links.delete(id);
    const lostIds = lostSince(before, await connectedIds());
    return {
      radio: false,
      alreadyConnected: false,
      disconnectedOthers: lostIds.length > 0,
      lostIds,
      reason: "That device is not a Yehsa peer. The link already in use was left alone.",
      peer: null
    };
  }
  links.set(id, device);
  const lostIds = lostSince(before, await connectedIds()).filter((lost) => lost !== id);
  return {
    radio: true,
    alreadyConnected: false,
    disconnectedOthers: lostIds.length > 0,
    lostIds,
    reason: null,
    peer: seen
  };
}

export async function writeNativeNote(text, primary) {
  const id = primary?.id || primary?.address;
  const device = id ? links.get(id) : null;
  if (!device) return null;
  let connected = false;
  try {
    connected = await device.isConnected();
  } catch {
    connected = false;
  }
  if (!connected) {
    return { sent: false, reason: "The held link is not connected. The note stays on this phone." };
  }
  try {
    const services = await device.services();
    const service = (services || []).find((item) => String(item?.uuid || "").toLowerCase() === MESH_SERVICE_UUID.toLowerCase());
    if (!service) {
      return { sent: false, reason: "The held link has no Yehsa service. The note stays on this phone." };
    }
    const chars = await service.characteristics();
    const note = (chars || []).find((item) => String(item?.uuid || "").toLowerCase() === MESH_NOTE_UUID.toLowerCase());
    if (!note || (note.isWritableWithResponse !== true && note.isWritableWithoutResponse !== true)) {
      return { sent: false, reason: "The held link has no note characteristic. The note stays on this phone." };
    }
    const payload = utf8ToBase64(text);
    if (note.isWritableWithResponse === true) {
      await device.writeCharacteristicWithResponseForService(service.uuid, note.uuid, payload);
    } else {
      await device.writeCharacteristicWithoutResponseForService(service.uuid, note.uuid, payload);
    }
    return { sent: true, reason: null };
  } catch {
    return { sent: false, reason: "The held link did not take the note. It stays on this phone." };
  }
}
