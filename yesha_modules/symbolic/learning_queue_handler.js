import fs from "fs";
const queuePath = "./yesha_memory/learning_queue_json";
export function logLearningNeed(prompt) {
  try {
    const queue = fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath)) : [];
    const entry = {
      prompt,
      timestamp: new Date().toISOString(),
      intent: "unknown",
      status: "unresolved"
    };
    queue.push(entry);
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
    console.log("✅ Logged to learning queue.");
  } catch (e) {
    console.error("❌ Failed to log learning need:", e);
  }
}
