// The public-domain books bundled in the app (assets/books), read on the phone. Loaded only when
// a book is opened in the reader or asked about, never at launch.
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";

const FILES = {
  tao_te_ching: require("../../assets/books/tao_te_ching.ybk"),
  the_kybalion: require("../../assets/books/the_kybalion.ybk"),
  bhagavad_gita: require("../../assets/books/bhagavad_gita.ybk"),
  dhammapada: require("../../assets/books/dhammapada.ybk"),
  kjv: require("../../assets/books/kjv.ybk"),
  great_war_vol_v: require("../../assets/books/great_war_vol_v.ybk"),
  hermetica_mead_vol2: require("../../assets/books/hermetica_mead_vol2.ybk"),
  barddas: require("../../assets/books/barddas.ybk"),
  us_constitution: require("../../assets/books/us_constitution.ybk")
};

export const bookAssetsAvailable = true;

export async function readBookAsset(file) {
  const mod = FILES[file];
  if (!mod) return null;
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  return FileSystem.readAsStringAsync(asset.localUri || asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
}
