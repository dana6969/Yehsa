// Lazy loader for the camera-ID reference index. The JSON is only required the
// first time the Identify screen asks for it, so app start and the knowledge
// hot path never pay for it.
import { decodeIndex } from "./camera_id_match.js";

let cached = null;

export function loadCameraIndex() {
  if (!cached) {
    // eslint-disable-next-line global-require
    const raw = require("../../assets/camera_id/index.json");
    cached = decodeIndex(raw);
  }
  return cached;
}
