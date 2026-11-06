// BLE probe for the Expo shell.
// Termux wins when a bridge is present. Android and iOS use native BLE when
// this build includes it. The browser keeps Web Bluetooth.
// Nothing here invents peers. A scan does not cancel a link it did not just open.

import { MESH_NOTE_UUID, MESH_SERVICE_UUID, acceptRadioPeer } from "../../symbolic/mesh_peers.js";
import { chooseRadioRoute } from "../../symbolic/radio_adapter.js";
import { connectNative, nativeModulePresent, scanNative, writeNativeNote } from "./ble_native.js";

const links = new Map();

function termuxBle() {
  return globalThis.__YEHSA_PLATFORM__?.ble || null;
}

function bluetooth() {
  return globalThis.navigator?.bluetooth || null;
}

async function hostOs() {
  try {
    const { Platform } = await import("react-native");
    const os = Platform?.OS;
    if (os === "android" || os === "ios" || os === "web") return os;
  } catch {
    // Node has no React Native runtime.
  }
  return "web";
}

function unavailable(reason) {
  return {
    route: "none",
    available: false,
    invoked: false,
    peers: [],
    lostIds: [],
    reason,
    scanMode: null
  };
}

export async function scanWithPlatform() {
  const os = await hostOs();
  const bridge = termuxBle();
  const nativeOs = os === "android" || os === "ios";
  const route = chooseRadioRoute({
    termuxAvailable: typeof bridge?.scan === "function",
    nativeOs,
    nativeModule: nativeOs && nativeModulePresent(),
    webBluetooth: !nativeOs && Boolean(bluetooth())
  });

  if (route === "termux-bluetooth") {
    try {
      const result = await bridge.scan();
      return {
        route: "termux-bluetooth",
        available: result?.available !== false,
        invoked: result?.invoked === true,
        peers: Array.isArray(result?.peers) ? result.peers : [],
        lostIds: Array.isArray(result?.lostIds) ? result.lostIds : [],
        reason: result?.reason || null,
        scanMode: "passive-observer"
      };
    } catch {
      return {
        route: "termux-bluetooth",
        available: true,
        invoked: false,
        peers: [],
        lostIds: [],
        reason: "termux-bluetooth-scan failed. The link already in use was not told to disconnect.",
        scanMode: null
      };
    }
  }

  if (route === "native-ble") {
    const result = await scanNative();
    const peers = Array.isArray(result?.peers) ? result.peers.filter((raw) => acceptRadioPeer(raw)) : [];
    return {
      route: result?.route || "native-ble",
      available: result?.available === true,
      invoked: result?.invoked === true,
      peers,
      lostIds: Array.isArray(result?.lostIds) ? result.lostIds : [],
      reason: result?.reason || null,
      scanMode: result?.scanMode || null
    };
  }

  if (nativeOs) {
    return unavailable("Native BLE is not in this runtime. An EAS preview build includes it on Android and iOS. No peers were invented.");
  }

  const radio = bluetooth();
  if (!radio) {
    return unavailable("This runtime has no Bluetooth API. termux-bluetooth-scan is not on this screen. No peers were invented.");
  }

  let available = false;
  try {
    available = typeof radio.getAvailability === "function" ? await radio.getAvailability() : true;
  } catch {
    available = false;
  }
  if (!available) {
    return unavailable("Bluetooth is off or missing on this device. No peers were invented.");
  }
  if (typeof radio.requestLEScan !== "function") {
    return {
      route: "web-bluetooth-chooser",
      available: true,
      invoked: false,
      peers: [],
      lostIds: [],
      reason: "Bluetooth is present, but this browser has no passive LE scan. Choose a Yehsa device instead. No peers were invented.",
      scanMode: null
    };
  }

  const seen = [];
  const onAd = (event) => {
    const device = event?.device;
    if (!device) return;
    seen.push({
      name: device.name || "",
      id: device.id,
      rssi: typeof event.rssi === "number" ? event.rssi : null,
      serviceUuids: Array.isArray(event.uuids) ? event.uuids : device.uuids,
      source: "web-bluetooth"
    });
  };
  try {
    radio.addEventListener?.("advertisementreceived", onAd);
    const scan = await radio.requestLEScan({
      filters: [
        { namePrefix: "YEHSA" },
        { services: [MESH_SERVICE_UUID] }
      ],
      keepRepeatedDevices: true
    });
    await new Promise((resolve) => setTimeout(resolve, 12000));
    try {
      scan.stop();
    } catch {
      // Stopping a scan is not a disconnect.
    }
    radio.removeEventListener?.("advertisementreceived", onAd);
    const peers = seen.filter((raw) => acceptRadioPeer(raw));
    return {
      route: "web-bluetooth-scan",
      available: true,
      invoked: true,
      peers,
      lostIds: [],
      reason: peers.length ? null : "Scan finished. No Yehsa peers heard.",
      scanMode: "passive-observer"
    };
  } catch {
    try {
      radio.removeEventListener?.("advertisementreceived", onAd);
    } catch {
      // The listener was not attached.
    }
    return {
      route: "web-bluetooth-scan",
      available: true,
      invoked: false,
      peers: [],
      lostIds: [],
      reason: "The passive scan did not run. No peers were invented, and no link was disconnected.",
      scanMode: null
    };
  }
}

async function peerFromDevice(device, server) {
  const uuids = Array.isArray(device.uuids) ? [...device.uuids] : [];
  if (server?.getPrimaryServices) {
    try {
      const services = await server.getPrimaryServices();
      for (const service of services || []) {
        if (service?.uuid) uuids.push(service.uuid);
      }
    } catch {
      // A Yehsa name can still identify the peer when service discovery fails.
    }
  }
  return {
    name: device.name || "",
    id: device.id,
    serviceUuids: uuids,
    source: "web-bluetooth"
  };
}

function webLinkFor(primary) {
  const id = primary?.id || primary?.address;
  if (id && links.get(id)?.server?.connected) return links.get(id);
  for (const held of links.values()) {
    if (held?.server?.connected) return held;
  }
  return null;
}

async function writeWebNote(text, primary) {
  const held = webLinkFor(primary);
  if (!held?.server?.getPrimaryService) return null;
  try {
    const service = await held.server.getPrimaryService(MESH_SERVICE_UUID);
    const characteristic = await service.getCharacteristic(MESH_NOTE_UUID);
    if (!characteristic?.writeValue) {
      return { sent: false, reason: "The held link has no note characteristic. The note stays on this phone." };
    }
    const payload = new TextEncoder().encode(text);
    await characteristic.writeValue(payload);
    return { sent: true, reason: null };
  } catch {
    return { sent: false, reason: "The held link did not take the note. It stays on this phone." };
  }
}

export async function connectRemembered(peer) {
  const bridge = termuxBle();
  if (typeof bridge?.connect === "function" && peer?.address) {
    try {
      const result = await bridge.connect(peer.address);
      return {
        radio: result?.radio === true,
        alreadyConnected: result?.alreadyConnected === true,
        reason: result?.reason || null,
        disconnectedOthers: false,
        lostIds: Array.isArray(result?.lostIds) ? result.lostIds : []
      };
    } catch {
      return {
        radio: false,
        reason: "termux-bluetooth-connect failed. The active link was left alone.",
        disconnectedOthers: false,
        lostIds: []
      };
    }
  }
  const os = await hostOs();
  if ((os === "android" || os === "ios") && nativeModulePresent() && (peer?.id || peer?.address)) {
    const result = await connectNative(peer);
    return {
      radio: result?.radio === true,
      alreadyConnected: result?.alreadyConnected === true,
      reason: result?.reason || null,
      disconnectedOthers: result?.disconnectedOthers === true,
      lostIds: Array.isArray(result?.lostIds) ? result.lostIds : []
    };
  }
  if (peer?.id && links.get(peer.id)?.server?.connected) {
    return { radio: true, alreadyConnected: true, disconnectedOthers: false, lostIds: [], reason: null };
  }
  if (peer?.address) {
    return {
      radio: false,
      reason: "Connecting by MAC needs termux-bluetooth-connect or the native radio. This screen cannot open that address. No link was invented.",
      disconnectedOthers: false,
      lostIds: []
    };
  }
  return {
    radio: false,
    reason: "BLE connect is not available. No radio link was invented.",
    disconnectedOthers: false,
    lostIds: []
  };
}

export async function chooseYehsaDevice() {
  const radio = bluetooth();
  if (!radio?.requestDevice) {
    return {
      radio: false,
      peer: null,
      reason: "This runtime has no Bluetooth device chooser. No link was invented.",
      disconnectedOthers: false,
      lostIds: []
    };
  }
  let device;
  try {
    device = await radio.requestDevice({
      filters: [
        { namePrefix: "YEHSA" },
        { services: [MESH_SERVICE_UUID] }
      ],
      optionalServices: [MESH_SERVICE_UUID, MESH_NOTE_UUID]
    });
  } catch (err) {
    const reason = err?.name === "NotFoundError"
      ? "No Yehsa device was chosen."
      : "The Bluetooth chooser closed without a device. No link was invented.";
    return { radio: false, peer: null, reason, disconnectedOthers: false, lostIds: [] };
  }
  const id = device?.id;
  if (id && links.get(id)?.server?.connected) {
    const held = links.get(id);
    return {
      radio: true,
      alreadyConnected: true,
      peer: await peerFromDevice(device, held.server),
      disconnectedOthers: false,
      lostIds: [],
      reason: null
    };
  }
  try {
    const server = await device.gatt.connect();
    const peer = await peerFromDevice(device, server);
    if (!acceptRadioPeer(peer)) {
      try {
        device.gatt.disconnect();
      } catch {
        // This device was opened just now. Previously held links are not in this call.
      }
      return {
        radio: false,
        peer: null,
        reason: "That device is not a Yehsa peer. The link already in use was left alone.",
        disconnectedOthers: false,
        lostIds: []
      };
    }
    if (id) links.set(id, { device, server });
    return { radio: true, peer, disconnectedOthers: false, lostIds: [], reason: null };
  } catch {
    return {
      radio: false,
      peer: null,
      reason: "The device did not connect. The link already in use was left alone.",
      disconnectedOthers: false,
      lostIds: []
    };
  }
}

export async function transmitNote(text, primary) {
  const send = termuxBle()?.send;
  if (typeof send === "function") {
    try {
      const result = await send(text);
      return { sent: result?.sent === true, reason: result?.reason || null };
    } catch {
      return { sent: false, reason: "The held link did not take the note. It stays on this phone." };
    }
  }
  const os = await hostOs();
  if ((os === "android" || os === "ios") && nativeModulePresent()) {
    const native = await writeNativeNote(text, primary);
    if (native) return native;
  }
  const web = await writeWebNote(text, primary);
  if (web) return web;
  return { sent: false, reason: "No write path is open. The note stays on this phone." };
}
