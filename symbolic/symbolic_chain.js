import { execute } from "./symbolic_action_executor.js";
import { echoSymbolic } from "./symbolic_echo.js";
import { getMappedAction } from "./symbolic_dictionary.js";

// Main chain dispatcher
export function chainSymbol(symbol) {
  const action = getMappedAction(symbol);

  if (action && typeof action === "string") {
    // Execute mapped symbolic action
    execute(symbol);
  } else {
    // Echo fallback for unknown or unmapped symbols
    echoSymbolic(symbol);
  }
}
