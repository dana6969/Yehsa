// Default Bluetooth stub for Node and for the web bundle.
// Metro loads ble_native.native.js on Android and iOS instead of this file.
// This stub does not invent peers and does not claim a radio.

export function nativeModulePresent() {
  return false;
}

export async function scanNative() {
  return {
    route: "none",
    available: false,
    invoked: false,
    peers: [],
    lostIds: [],
    reason: "Native BLE is not in this runtime. An EAS preview build includes it on Android and iOS. No peers were invented.",
    scanMode: null
  };
}

export async function connectNative() {
  return {
    radio: false,
    alreadyConnected: false,
    disconnectedOthers: false,
    lostIds: [],
    reason: "Native BLE is not in this runtime. No link was invented.",
    peer: null
  };
}

export async function writeNativeNote() {
  return null;
}
