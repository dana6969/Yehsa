// Read-only device checks for Before you go. No prompt opens unless the caller asks.
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { nativeModulePresent } from "./ble_native";

export async function probeBattery() {
  try {
    const level = await Battery.getBatteryLevelAsync();
    let lowPowerMode = false;
    try {
      lowPowerMode = await Battery.isLowPowerModeEnabledAsync();
    } catch {
      lowPowerMode = false;
    }
    return { level, lowPowerMode };
  } catch {
    return { level: null };
  }
}

export async function probeGps({ ask = false } = {}) {
  try {
    const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
    const precise = perm?.android?.accuracy ? perm.android.accuracy === "fine" : undefined;
    return { status: perm?.status || "undetermined", precise };
  } catch {
    return { status: "unknown" };
  }
}

export function probeMesh() {
  try {
    return { native: Boolean(nativeModulePresent()) };
  } catch {
    return { native: false };
  }
}
