// On-device image embedding for camera ID. Loaded only when the Identify screen
// runs a photo: the TFLite model is opened on first use and the photo never
// leaves the phone. No network, no account.
import * as ImageManipulator from "expo-image-manipulator";
import { decode as decodePng } from "fast-png";
import { normalize, pixelsToInputs } from "./camera_id_match.js";

const SIZE = 224; // must match pixelsToInputs in camera_id_match.js
let modelPromise = null;

export function cameraIdAvailable() {
  return true;
}

export const CAMERA_ID_UNAVAILABLE = "The on-device photo model could not load on this phone.";

function loadModel() {
  if (!modelPromise) {
    // eslint-disable-next-line global-require
    const { loadTensorflowModel } = require("react-native-fast-tflite");
    // eslint-disable-next-line global-require
    modelPromise = loadTensorflowModel(require("../../assets/camera_id/mobilenet_v3_small_embedder.tflite"), "default").catch((err) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

export function releaseCameraModel() {
  modelPromise = null;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64ToBytes(text) {
  const clean = String(text || "").replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i += 1) {
    buffer = (buffer << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (o < out.length) out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

export async function embedPhoto({ uri, width, height }) {
  const actions = [];
  if (width > 0 && height > 0) {
    const side = Math.min(width, height);
    actions.push({ crop: { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side } });
  }
  actions.push({ resize: { width: SIZE, height: SIZE } });
  const shrunk = await ImageManipulator.manipulateAsync(uri, actions, { format: ImageManipulator.SaveFormat.PNG, base64: true, compress: 1 });
  const png = decodePng(base64ToBytes(shrunk.base64));
  const [plain, mirror] = pixelsToInputs(png);
  const model = await loadModel();
  const a = normalize((await model.run([plain]))[0]);
  const b = normalize((await model.run([mirror]))[0]);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = (a[i] + b[i]) / 2;
  return normalize(out);
}
