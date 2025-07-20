import readline from "readline";

export async function biometricConfirm(symbol) {
  const protectedSymbols = ["unlock", "erase", "shutdown"];
  if (!protectedSymbols.includes(symbol.toLowerCase())) return true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return await new Promise((resolve) => {
    rl.question(`[🔐 BIOMETRIC] Confirm access for "${symbol}" (yes/no): `, ans => {
      rl.close();
      resolve(ans.trim().toLowerCase() === "yes");
    });
  });
}