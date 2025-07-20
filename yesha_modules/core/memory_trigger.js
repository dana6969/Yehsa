// memory_trigger.js – Yehsa Phase 2 Memory Trigger Core

const fs = require("fs");
const path = require("path");

const memoryLogPath = path.resolve(__dirname, "../logs/memory_events.log");
const debug = true;

/**
 * Logs memory events with optional debug flag
 */
function logMemory(msg, isError = false) {
  const prefix = isError ? "❌" : "🧠";
  const line = `[${new Date().toISOString()}] ${prefix} ${msg}\n`;
  fs.appendFileSync(memoryLogPath, line);
  if (debug) console.log(line.trim());
}

/**
 * Validates memory input and ensures symbolic intent exists
 */
function validateInput(memoryInput) {
  if (!memoryInput || typeof memoryInput !== "object") {
    throw new Error("Invalid memory input: not an object.");
  }
  if (!memoryInput.intent) {
    throw new Error("Missing intent in memory input.");
  }
}

/**
 * Transforms raw input into symbolic AGI memory context
 */
async function handle(memoryInput) {
  try {
    validateInput(memoryInput);

    const symbolicContext = {
      timestamp: new Date().toISOString(),
      source: memoryInput.source || "external",
      intent: memoryInput.intent,
      context: memoryInput.context || {},
      memoryType: "symbolic",
      tags: memoryInput.tags || [],
      metadata: {
        version: "2.0",
        agi_ready: true,
        trace_id: memoryInput.trace_id || `yehsa-${Date.now()}`
      }
    };

    logMemory("Parsed symbolic memory: " + JSON.stringify(symbolicContext));
    return symbolicContext;

  } catch (err) {
    logMemory(`Error handling memory input: ${err.message}`, true);
    return {
      intent: "error",
      context: {},
      memoryType: "symbolic",
      metadata: {
        error: true,
        message: err.message
      }
    };
  }
}

module.exports = { handle };
