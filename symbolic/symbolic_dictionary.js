import { actionMap } from "./symbolic_action_executor.js"; export function getMappedAction(symbol) { return actionMap[symbol] || "echo_symbol"; }






import fs from "fs";
const symbolMap = JSON.parse(fs.readFileSync("symbolic_memory/full_dictionary.json"));

export function getDefinitions(symbol) {
  return symbolMap[symbol] || null;
}
