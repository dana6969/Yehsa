// Talks to the YehsaRadioPlayback native module: a media-playback foreground
// service with a notification and lock-screen play, pause, and stop controls.
import { requireOptionalNativeModule } from "expo";

const native = requireOptionalNativeModule("YehsaRadioPlayback");

export function radioBackgroundAvailable() {
  return !!native;
}

export function startRadioService({ title = "Yehsa Radio", artist = "Yehsa" } = {}) {
  if (!native?.start) return false;
  try {
    return native.start(String(title || "Yehsa Radio"), String(artist || "Yehsa")) === true;
  } catch {
    return false;
  }
}

export function stopRadioService() {
  if (!native?.stop) return;
  try { native.stop(); } catch {}
}

export function setRadioPaused(paused) {
  if (!native?.setPaused) return;
  try { native.setPaused(!!paused); } catch {}
}

export function addRadioCommandListener(onCommand) {
  if (!native?.addListener) return () => {};
  const sub = native.addListener("onRadioCommand", (event) => {
    const action = event?.action;
    if (action) onCommand(action);
  });
  return () => {
    try { sub?.remove?.(); } catch {}
  };
}
