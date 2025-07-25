import fs from "fs";
import { dispatch } from "./symbolic_autonomy_loop.js";

let last = null;

function dequeue() {
  try {
    const queue = JSON.parse(fs.readFileSync("symbolic_memory/learning_queue.json", "utf8"));
    const next = queue.shift();
    if (!next?.symbol) return;
    fs.writeFileSync("symbolic_memory/learning_queue.json", JSON.stringify(queue, null, 2));
    const start = Date.now();
    console.log(`🔁 Dispatching: ${next.symbol}`);
    dispatch(next.symbol);
    const dur = Date.now() - start;
    console.log(`[⏱ ${dur}ms] ✅ Finished: ${next.symbol}`);
  } catch (e) {
    console.error("❌ Dequeue error:", e.message);
  }
}

setInterval(() => {
  try {
    const data = fs.readFileSync("symbolic_memory/learning_queue.json", "utf8");
    const queue = JSON.parse(data);
    const next = queue[0];
    if (next?.symbol && next.symbol !== last) {
      last = next.symbol;
      dequeue();
    }
  } catch (e) {
    console.error("❌ Watchdog loop error:", e.message);
  }
}, 300);
