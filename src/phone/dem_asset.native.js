// Reads one bundled terrain tile (byte range) from the DEM archive on the phone. The archive is
// copied out of the APK once by expo-asset; each tile is one small ranged read, never the whole file.
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { base64ToBytes } from "../../symbolic/meaning/int8_index.js";
import { demRange } from "../../symbolic/dem_archive.js";

let uriPromise = null;
function archiveUri() {
  if (!uriPromise) {
    uriPromise = (async () => {
      const asset = Asset.fromModule(require("../../assets/dem/yehsa_dem_terrain.ydm"));
      await asset.downloadAsync();
      return asset.localUri || asset.uri;
    })().catch((err) => {
      uriPromise = null;
      throw err;
    });
  }
  return uriPromise;
}

export const demAvailable = true;

export async function demTile(z, x, y) {
  const range = demRange(z, x, y);
  if (!range) return null;
  try {
    const uri = await archiveUri();
    const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: range.offset, length: range.length });
    return base64ToBytes(text);
  } catch {
    return null;
  }
}
