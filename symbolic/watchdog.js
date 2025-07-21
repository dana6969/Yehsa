import http from "http";
import fs from "fs";
import { dispatch } from "./symbolic_autonomy_loop.js";
import { nextGoal, markGoalComplete } from "./goal_engine.js";

let last = null;

function dequeue() {
  try {
    const queue = JSON.parse(fs.readFileSync("symbolic_memory/learning_queue.json", "utf8"));
    const next = queue.shift();
    if (!next?.symbol) return;
    fs.writeFileSync("symbolic_memory/learning_queue.json", JSON.stringify(queue, null, 2));
    console.log(`🔁 Dispatching from queue: ${next.symbol}`);
    dispatch(next.symbol);
  } catch (e) {
    console.error("❌ Dequeue error:", e.message);
  }
}

setInterval(() => {
  try {
    const goal = nextGoal();
    if (goal?.symbol) {
      console.log("🎯 Executing goal:", goal.symbol);
      dispatch(goal.symbol);
      markGoalComplete(goal.id);
      return;
    }

    const queue = JSON.parse(fs.readFileSync("symbolic_memory/learning_queue.json", "utf8"));
    const next = queue[0];
    if (next?.symbol && next.symbol !== last) {
      last = next.symbol;
      dequeue();
    }
  } catch (e) {
    console.error("❌ Watchdog loop error:", e.message);
  }
}, 1000);

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("🧠 Yehsa Watchdog active on port 31337");
}).listen(31337);
