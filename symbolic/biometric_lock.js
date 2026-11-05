/**
 * Local stdin confirm prompt. This is not a device biometric API and does not
 * read fingerprints, face data, or Android BiometricPrompt.
 */
import readline from "readline";

export async function localConfirm(symbol) {
  const protectedSymbols = ["unlock", "erase", "shutdown"];
  if (typeof symbol !== "string" || !protectedSymbols.includes(symbol.toLowerCase())) return true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return await new Promise((resolve) => {
    rl.question(`[LOCAL CONFIRM] Confirm access for "${symbol}" (yes/no): `, ans => {
      rl.close();
      resolve(ans.trim().toLowerCase() === "yes");
    });
  });
}

export { localConfirm as biometricConfirm };
