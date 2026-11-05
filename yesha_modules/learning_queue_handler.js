import fs from "fs";

export function logLearningNeed(data) {
  const path = "./yesha_modules/memory/learning_queue.json";
  let queue = [];
  if (fs.existsSync(path)) {
    queue = JSON.parse(fs.readFileSync(path, "utf8"));
  }
  queue.push({ timestamp: Date.now(), data });
  fs.writeFileSync(path, JSON.stringify(queue, null, 2));
}
