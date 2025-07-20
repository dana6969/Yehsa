import { actionMap } from "./symbolic_action_executor.js"; export function getMappedAction(symbol) { return actionMap[symbol] || "echo_symbol"; }
