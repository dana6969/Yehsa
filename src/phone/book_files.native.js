// File picking on the phone through the system document picker. Nothing is uploaded.
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

function unbase64(text) {
  const binary = globalThis.atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function pickFile({ types = ["application/epub+zip", "text/plain", "application/octet-stream", "*/*"] } = {}) {
  let result;
  try {
    result = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  } catch {
    return { ok: false, reason: "The file picker did not open." };
  }
  if (result?.canceled || !result?.assets?.length) return { ok: false, reason: "No file was picked." };
  const asset = result.assets[0];
  const uri = asset.uri;
  return {
    ok: true,
    name: asset.name || uri.split("/").pop(),
    size: asset.size ?? null,
    uri,
    readAll: async () => unbase64(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })),
    readAt: async (offset, length) => {
      if (length <= 0) return new Uint8Array();
      const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: offset, length });
      return unbase64(text);
    },
    // The picker copy lives in the cache; keep a ZIM in Yehsa's own folder so it survives.
    keep: async (folder = "yehsa-zim/") => {
      const dir = `${FileSystem.documentDirectory}${folder}`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const to = `${dir}${(asset.name || "library.zim").replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await FileSystem.copyAsync({ from: uri, to });
      return to;
    }
  };
}

export function readerForUri(uri) {
  return async (offset, length) => {
    const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: offset, length });
    return unbase64(text);
  };
}
