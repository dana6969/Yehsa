// File picking on the web preview: a hidden <input type="file">. Nothing is uploaded.
export async function pickFile({ accept = ".epub,.txt,.text,.md" } = {}) {
  if (typeof document === "undefined") return { ok: false, reason: "This preview cannot open files." };
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ ok: false, reason: "No file was picked." });
        return;
      }
      resolve({
        ok: true,
        name: file.name,
        size: file.size,
        readAll: async () => new Uint8Array(await file.arrayBuffer()),
        readAt: async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer())
      });
    };
    input.click();
  });
}

export function readerForUri() {
  return null;
}
