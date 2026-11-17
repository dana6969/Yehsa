// Lazy loader for the camera-ID classifier head and class notes. The JSON is only required the
// first time the Identify screen asks for it, so app start and the knowledge hot path never pay for it.
import { decodeIndex } from "./camera_id_match.js";

let cached = null;

export function loadCameraIndex() {
  if (!cached) {
    // eslint-disable-next-line global-require
    cached = decodeIndex(require("../../assets/camera_id/index.json"), require("../../assets/camera_id/classes.json"));
  }
  return cached;
}

// Photo credits (observer and license for every reference photo). Loaded only when the user opens them.
export function loadCameraCredits() {
  // eslint-disable-next-line global-require
  return require("../../assets/camera_id/credits.json");
}
