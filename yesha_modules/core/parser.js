// parser.js – Yehsa Phase 2 Intent Parser Core

const fs = require("fs");
const path = require("path");

const intentLogPath = path.resolve(__dirname, "../../logs/parser_events.log");
const debug = true;

/**
 * Logs parsing activity
 */
function logParse(msg, isError = false) {
  const prefix = isError ? "❌" : "🧠";
  const line = `[${new Date().toISOString()}] ${prefix} ${msg}\n`;
  fs.appendFileSync(intentLogPath, line);
  if (debug) console.log(line.trim());
}

/**
 * Ensures raw identity or seed input is parseable
 */
function validateSeed(seedData) {
  if (!seedData || typeof seedData !== "object") {
    throw new Error("Invalid identity seed: not an object.");
  }
  if (!seedData.codename || !seedData.seed) {
    throw new Error("Identity seed missing required fields.");
  }
}

/**
 * Parses identity/seed into AGI symbolic format
 */
function parseIntent(rawInput) {
  try {
    validateSeed(rawInput);

    const parsedIntent = {
      codename: rawInput.codename,
      seed: rawInput.seed,
      origin: rawInput.origin || "core_identity",
      intent: rawInput.intent || "boot", // default intent
      context: rawInput.context || {},
      permissions: rawInput.permissions || ["self"],
      timestamp: new Date().toISOString(),
      flags: {
        symbolic: true,
        validated: true,
        phase: 2,
        root_intent: true,
      },
      metadata: {
        engine: "Yehsa-Core",
        parser_version: "2.0",
        trace_id: `parse-${Date.now()}`
      }
    };

    logParse("Parsed intent: " + JSON.stringify(parsedIntent));
    return parsedIntent;

  } catch (err) {
    logParse(`Parser error: ${err.message}`, true);
    return {
      intent: "error",
      codename: "undefined",
      context: {},
      flags: {
        error: true,
        validated: false
      },
      metadata: {
        engine: "Yehsa-Core",
        message: err.message
      }
    };
  }
}

module.exports = parseIntent;
