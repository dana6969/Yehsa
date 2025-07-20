module.exports = function symbolicLogger(entry) { const fs = require("fs"); const path = "logs/symbolic_output.log"; const timestamp = new Date().toISOString(); const log = `[${timestamp}] ${JSON.stringify(entry)}\n`; fs.appendFileSync(path, log); };
export function logReasoning(symbol, message) { console.log(`[🧠 REASON] ${symbol}: ${message}`); }
