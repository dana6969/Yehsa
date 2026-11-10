// Web pack: fetch the file copied into the export. It is not in the startup bundle.
let pending = null;

export function loadScriptureIndex() {
  if (!pending) {
    pending = fetch("/spiritual_index.json").then((response) => {
      if (!response.ok) throw new Error("The scripture index did not load.");
      return response.json();
    });
  }
  return pending;
}
