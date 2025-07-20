import { sendMeshSignal } from "./utils/mesh_utils.js";
import { parseSymbolAction } from "./yehsa_modules/core/action_interpreter.js";
import { logSymbolInteraction } from "./symbolic/logger.js";

export function handleMeshTrigger(symbols, context) {
  const action = parseSymbolAction(symbols, context);
  if (action?.type === "relay") {
    sendMeshSignal(action.payload);
    logSymbolInteraction(symbols, context + ":mesh_triggered");
  }
}
