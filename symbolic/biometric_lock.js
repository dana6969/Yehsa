/**
 * Local stdin confirm for unlock, erase, and shutdown.
 * This is not Android BiometricPrompt, not a fingerprint read, and not encryption.
 * Those actions also require the phone this install is bound to. Any other machine is refused.
 */
import readline from "readline";
import { ensureLocalOwner } from "./device_owner.js";

export async function localConfirm(symbol, options = {}) {
  const protectedSymbols = ["unlock", "erase", "shutdown"];
  if (typeof symbol !== "string" || !protectedSymbols.includes(symbol.toLowerCase())) return true;
  const owner = ensureLocalOwner(options);
  if (!owner.phoneBound || !owner.recognized) return false;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return await new Promise((resolve) => {
    rl.question(`[LOCAL CONFIRM] Confirm access for "${symbol}" (yes/no): `, ans => {
      rl.close();
      resolve(ans.trim().toLowerCase() === "yes");
    });
  });
}

export { localConfirm as biometricConfirm };
