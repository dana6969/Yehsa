


import { logExecution } from "./memory_logger.js";
export function execute(s) {
  console.log("⚡ " + s);
  logExecution(s);
}
