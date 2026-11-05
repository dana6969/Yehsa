import fs from "fs";
import { dispatch } from "./symbolic_autonomy_loop.js";
import { isDirectRun } from "./direct_run.js";

const QUEUE = "symbolic_memory/learning_queue.json";
const CURSOR = "symbolic_memory/watchdog_cursor.json";
let last = null;

function readCursor() {
  try {
    const value = JSON.parse(fs.readFileSync(CURSOR, "utf8")).index;
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeCursor(index) {
  fs.writeFileSync(CURSOR, JSON.stringify({ index }));
}

function dequeue() {
  try {
    const queue = JSON.parse(fs.readFileSync(QUEUE, "utf8"));
    if (!Array.isArray(queue) || queue.length === 0) return;
    const index = Math.min(readCursor(), queue.length);
    const next = queue[index];
    if (!next?.symbol) return;
    // Advance a cursor. Do not rewrite learning_queue.json; a crash mid-write
    // previously wiped the corpus.
    writeCursor(index + 1);
    const start = Date.now();
    console.log(`🔁 Dispatching: ${next.symbol}`);
    dispatch(next.symbol);
    console.log(`[⏱ ${Date.now() - start}ms] ✅ Finished: ${next.symbol}`);
  } catch (e) {
    console.error("❌ Dequeue error:", e.message);
  }
}

export function startWatchdog() {
  setInterval(() => {
    try {
      const queue = JSON.parse(fs.readFileSync(QUEUE, "utf8"));
      const index = Math.min(readCursor(), Array.isArray(queue) ? queue.length : 0);
      const next = Array.isArray(queue) ? queue[index] : null;
      if (next?.symbol && next.symbol !== last) {
        last = next.symbol;
        dequeue();
      }
    } catch (e) {
      console.error("❌ Watchdog loop error:", e.message);
    }
  }, 300);
  console.log("Watchdog cursor started. learning_queue.json is left intact.");
}

if (isDirectRun(import.meta.url)) startWatchdog();
