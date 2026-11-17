// Web and Node stand-in for the on-device camera-ID model. The real model runs
// only in the phone app (camera_id_native.native.js), so this never pretends.
export function cameraIdAvailable() {
  return false;
}

export const CAMERA_ID_UNAVAILABLE = "Camera ID runs in the Yehsa phone app. It is not available in this preview.";

export async function embedPhoto() {
  throw new Error(CAMERA_ID_UNAVAILABLE);
}

export function releaseCameraModel() {}
