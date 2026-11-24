// Web preview: nothing is saved. The sealed stores live in memory for this tab only.
import { memoryAdapter } from "../../symbolic/peer_vault.js";

export function createAdapter() {
  return memoryAdapter(new Map(), "web-preview");
}
