// BLE probe for the Expo shell.
// A Termux bridge is used when it exists. Otherwise Web Bluetooth, if the browser has it.
// Nothing here invents peers, and nothing here disconnects a link it did not just open.

import { MESH_SERVICE_UUID, acceptRadioPeer } from "../../symbolic/mesh_peers.js";

const links = new Map();

function termuxBle() {
  return globalThis.__YEHSA_PLATFORM__?.ble || null;
}

function bluetooth() {
  return globalThis.navigator?.bluetooth || null;
}

export async function scanWithPlatform() {
  const bridge = termuxBle();
  if (typeof bridge?.scan === "function") {
    try {
      const result = await bridge.scan();
      return {
        route: "termux-bluetooth",
        available: result?.available !== false,
        invoked: result?.invoked === true,
        peers: Array.isArray(result?.peers) ? result.peers : [],
        reason: result?.reason || null,
        scanMode: "passive-observer"
      };
    } catch {
      return {
        route: "termux-bluetooth",
        available: true,
        invoked: false,
        peers: [],
        reason: "termux-bluetooth-scan failed. The link already in use was not told to disconnect.",
        scanMode: null
      };
    }
  }

  const radio = bluetooth();
  if (!radio) {
    return {
      route: "none",
      available: false,
      invoked: false,
      peers: [],
      reason: "This runtime has no Bluetooth API. termux-bluetooth-scan is not on this screen. No peers were invented.",
      scanMode: null
    };
  }

  let available = false;
  try {
    available = typeof radio.getAvailability === "function" ? await radio.getAvailability() : true;
  } catch {
    available = false;
  }
  if (!available) {
    return {
      route: "none",
      available: false,
      invoked: false,
      peers: [],
      reason: "Bluetooth is off or missing on this device. No peers were invented.",
      scanMode: null
    };
  }
  if (typeof radio.requestLEScan !== "function") {
    return {
      route: "web-bluetooth-chooser",
      available: true,
      invoked: false,
      peers: [],
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

export async function connectRemembered(peer) {
  const bridge = termuxBle();
  if (typeof bridge?.connect === "function" && peer?.address) {
    try {
      const result = await bridge.connect(peer.address);
      return {
        radio: result?.radio === true,
        alreadyConnected: result?.alreadyConnected === true,
        reason: result?.reason || null,
        disconnectedOthers: false
      };
    } catch {
      return {
        radio: false,
        reason: "termux-bluetooth-connect failed. The active link was left alone.",
        disconnectedOthers: false
      };
    }
  }
  if (peer?.id && links.get(peer.id)?.server?.connected) {
    return { radio: true, alreadyConnected: true, disconnectedOthers: false, reason: null };
  }
  if (peer?.address) {
    return {
      radio: false,
      reason: "Connecting by MAC needs termux-bluetooth-connect. This screen cannot open that address. No link was invented.",
      disconnectedOthers: false
    };
  }
  return {
    radio: false,
    reason: "BLE connect is not available. No radio link was invented.",
    disconnectedOthers: false
  };
}

export async function chooseYehsaDevice() {
  const radio = bluetooth();
  if (!radio?.requestDevice) {
    return {
      radio: false,
      peer: null,
      reason: "This runtime has no Bluetooth device chooser. No link was invented.",
      disconnectedOthers: false
    };
  }
  let device;
  try {
    device = await radio.requestDevice({
      filters: [
        { namePrefix: "YEHSA" },
        { services: [MESH_SERVICE_UUID] }
      ],
      optionalServices: [MESH_SERVICE_UUID]
    });
  } catch (err) {
    const reason = err?.name === "NotFoundError"
      ? "No Yehsa device was chosen."
      : "The Bluetooth chooser closed without a device. No link was invented.";
    return { radio: false, peer: null, reason, disconnectedOthers: false };
  }
  const id = device?.id;
  if (id && links.get(id)?.server?.connected) {
    const held = links.get(id);
    return {
      radio: true,
      alreadyConnected: true,
      peer: await peerFromDevice(device, held.server),
      disconnectedOthers: false,
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
        disconnectedOthers: false
      };
    }
    if (id) links.set(id, { device, server });
    return { radio: true, peer, disconnectedOthers: false, reason: null };
  } catch {
    return {
      radio: false,
      peer: null,
      reason: "The device did not connect. The link already in use was left alone.",
      disconnectedOthers: false
    };
  }
}

export async function transmitNote(text) {
  const send = termuxBle()?.send;
  if (typeof send !== "function") {
    return { sent: false, reason: "No write path is open. The note stays on this phone." };
  }
  try {
    const result = await send(text);
    return { sent: result?.sent === true, reason: result?.reason || null };
  } catch {
    return { sent: false, reason: "The held link did not take the note. It stays on this phone." };
  }
}
