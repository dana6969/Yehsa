// Node and plain-JS fallback. The phone loads picture_assets.native.js and web loads
// picture_assets.web.js (both generated, with static require() calls Metro bundles).
// Node cannot require() image files, so here a picture is a path to the copy under public/.
import { imageHref } from "./picture_guide.js";

export const PICTURE_ASSETS = {};

export function pictureSource(file) {
  return file ? { uri: imageHref(file) } : null;
}
