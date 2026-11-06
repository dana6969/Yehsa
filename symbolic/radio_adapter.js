// Choose a Bluetooth path for the Expo shell. No radio calls.
// Termux wins when that bridge is present. Android and iOS use the native
// module when this build includes it. The browser keeps Web Bluetooth.
// A phone runtime without the native module does not pretend to be the browser.

export function chooseRadioRoute(caps = {}) {
  if (caps.termuxAvailable === true) return "termux-bluetooth";
  if (caps.nativeOs === true) return caps.nativeModule === true ? "native-ble" : "none";
  if (caps.webBluetooth === true) return "web-bluetooth";
  return "none";
}
