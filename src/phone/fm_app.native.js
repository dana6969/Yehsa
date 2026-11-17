// Tries the FM radio apps that phone makers install (Android has no public FM tuner API, so
// the maker's app is the only route). It launches the first one the phone has, or says none.
import { Platform } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";

export const FM_APP_PACKAGES = [
  "com.android.fmradio",
  "com.caf.fmradio",
  "com.sec.android.app.fm",
  "com.motorola.fmplayer",
  "com.miui.fm",
  "com.huawei.android.FMRadio",
  "com.lge.fmradio",
  "com.htc.fm"
];

export async function openPhoneFmApp() {
  if (Platform.OS !== "android") return { ok: false, reason: "Only Android phones can have a maker FM app." };
  for (const packageName of FM_APP_PACKAGES) {
    try {
      await IntentLauncher.startActivityAsync("android.intent.action.MAIN", { packageName, category: "android.intent.category.LAUNCHER" });
      return { ok: true, packageName };
    } catch {
      // not installed, try the next
    }
  }
  return { ok: false, reason: "No FM radio app was found on this phone." };
}
