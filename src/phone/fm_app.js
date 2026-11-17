// Opening the phone maker's own FM radio app, where there is one. Yehsa does not tune FM.
// Web and test build: nothing to open.
export const FM_APP_PACKAGES = [];

export async function openPhoneFmApp() {
  return { ok: false, reason: "This only works in the phone app." };
}
