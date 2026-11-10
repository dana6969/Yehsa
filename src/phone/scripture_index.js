// Native pack: the scripture index is in the JS bundle for this platform.
import index from "../../symbolic_memory/spiritual_index.json";

export function loadScriptureIndex() {
  return Promise.resolve(index);
}
