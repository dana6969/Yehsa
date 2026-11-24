// The two sealed stores: learned-from-the-web notes, and the online channel (contacts, ratchet
// sessions, held messages). Each has its own key in secure storage.
import { createSealedVault } from "../../symbolic/sealed_vault.js";
import { createAdapter } from "./secure_adapter";

export const webNotesVault = createSealedVault(createAdapter("yehsa.web"), { keyName: "key.v1", dataName: "notes.v1" });
export const onlineVault = createSealedVault(createAdapter("yehsa.online"), { keyName: "key.v1", dataName: "state.v1" });
