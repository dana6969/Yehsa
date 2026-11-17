// On-device image embedding for camera ID. Loaded only when the Identify screen runs a photo:
// the DINOv2-small model is opened on first use with onnxruntime (already on the phone for the
// meaning matcher) and the photo never leaves the phone. No network, no account.
import { Asset } from "expo-asset";
import * as ImageManipulator from "expo-image-manipulator";
import { decode as decodePng } from "fast-png";
import { base64Bytes, normalize, pixelsToInputs } from "./camera_id_match.js";

let sessionPromise = null;

export function cameraIdAvailable() {
  return true;
}

export const CAMERA_ID_UNAVAILABLE = "The on-device photo model could not load on this phone.";

function loadSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      // eslint-disable-next-line global-require
      const ort = require("onnxruntime-react-native");
      const asset = Asset.fromModule(require("../../assets/camera_id/dinov2_small_w8.onnx"));
      await asset.downloadAsync();
      return { ort, session: await ort.InferenceSession.create(asset.localUri || asset.uri) };
    })().catch((err) => {
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

export function releaseCameraModel() {
  const pending = sessionPromise;
  sessionPromise = null;
  if (pending) pending.then(({ session }) => session.release?.()).catch(() => {});
}

async function embedOne({ ort, session }, data, size) {
  const input = new ort.Tensor("float32", data, [1, 3, size, size]);
  const out = await session.run({ pixel_values: input });
  const hidden = out.last_hidden_state || Object.values(out)[0];
  const dim = hidden.dims[hidden.dims.length - 1];
  return normalize(hidden.data.slice(0, dim)); // CLS token
}

export async function embedPhoto({ uri, width, height }, model) {
  const size = model.input[2];
  const actions = [];
  let side = Math.min(width, height);
  if (width > 0 && height > 0) {
    actions.push({ crop: { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side } });
  }
  // A single big bilinear shrink skips pixels and aliases, which the reference photos did not.
  // Halving steps average neighbouring pixels, close to the antialiased resize used when
  // the reference embeddings were made.
  while (side > size * 3) {
    side = Math.round(side / 2);
    actions.push({ resize: { width: side, height: side } });
  }
  actions.push({ resize: { width: size, height: size } });
  const shrunk = await ImageManipulator.manipulateAsync(uri, actions, { format: ImageManipulator.SaveFormat.PNG, base64: true, compress: 1 });
  const png = decodePng(base64Bytes(shrunk.base64));
  const [plain, mirror] = pixelsToInputs(png, model);
  const runtime = await loadSession();
  const a = await embedOne(runtime, plain, size);
  const b = await embedOne(runtime, mirror, size);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = (a[i] + b[i]) / 2;
  return normalize(out);
}
