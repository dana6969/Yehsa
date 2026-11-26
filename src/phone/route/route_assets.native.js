// Reads the bundled offline road graphs and place lists on the phone. Loaded only when you
// search or route on the Map (or Ask opens it), never at launch and never on the symbol hot path.
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { base64ToBytes } from "../../../symbolic/meaning/int8_index.js";
import { ROUTE_ASSETS } from "./route_asset_map";

export const routeAssetsAvailable = true;

export async function loadRouteAsset(region, kind) {
  const entry = ROUTE_ASSETS[region];
  if (!entry) return null;
  const asset = Asset.fromModule(kind === "graph" ? entry.graph : entry.places);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (kind === "graph") {
    const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return base64ToBytes(text);
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}
