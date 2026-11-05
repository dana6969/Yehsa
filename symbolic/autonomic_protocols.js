import { run as runFear } from "./protocols/fear_protocol.js";
import { run as runUnlock } from "./protocols/unlock_protocol.js";

export async function runProtocol(name, context) {
  const key = String(name || "").toLowerCase();
  if (key === "fear") return runFear(context);
  if (key === "unlock") return runUnlock(context);
  return { protocol: key || "observe", action: "observe", context: context ?? "" };
}
