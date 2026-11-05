import { localConfirm } from "../biometric_lock.js";
import { noteContext } from "../context_manager.js";

export async function run(context, options = {}) {
  noteContext(context || "unlock", { protocol: "unlock" });
  let allowed = false;
  if (options.confirm === true || process.env.YEHSA_LOCAL_CONFIRM === "yes") {
    allowed = true;
  } else if (process.stdin.isTTY) {
    allowed = await localConfirm("unlock");
  }
  return {
    protocol: "unlock",
    allowed,
    context: context ?? "",
    note: allowed ? "Local confirm accepted." : "Unlock stays closed without a local yes."
  };
}
