// Talks to the YehsaTorch native module (modules/yehsa-torch): the phone flashlight through
// CameraManager.setTorchMode, with a Morse pattern timed on its own thread.
import { requireOptionalNativeModule } from "expo";

const native = requireOptionalNativeModule("YehsaTorch");

export function torchModule() {
  return native || null;
}

export function torchAvailable() {
  try { return !!native?.available?.(); } catch { return false; }
}

export function playTorch(steps, loop = false) {
  if (!native?.play) return false;
  try { return native.play(steps.map((ms) => Math.max(1, Math.round(ms))), !!loop) === true; } catch { return false; }
}

export function stopTorch() {
  try { native?.stop?.(); } catch {}
}

export function keepTorchInBackground(keep) {
  try { native?.setKeepInBackground?.(!!keep); } catch {}
}

export function onTorchState(listener) {
  if (!native?.addListener) return () => {};
  const sub = native.addListener("onTorchState", listener);
  return () => { try { sub.remove(); } catch {} };
}
