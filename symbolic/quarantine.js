import fs from "fs";
const quarantinePath = "symbolic_memory/quarantine_log.json";
const learningQueuePath = "symbolic_memory/learning_queue.json";

export function quarantine(symbol, reason = "Unspecified", meta = {}) {
  const now = new Date().toISOString();
  const entry = {
    symbol,
    reason,
    time: now,
    priority: getPriority(reason),
    origin: meta.origin || "unknown",
    notes: meta.notes || ""
  };

  const log = fs.existsSync(quarantinePath)
    ? JSON.parse(fs.readFileSync(quarantinePath, "utf8"))
    : [];

  if (log.some(e => e.symbol === symbol && e.reason === reason)) {
    return console.log(`🟡 Already quarantined: ${symbol}`);
  }

  const filteredLog = log.filter(e => {
    const age = (Date.now() - new Date(e.time)) / (1000 * 60 * 60 * 24);
    return age < 30;
  });

  filteredLog.push(entry);
  fs.writeFileSync(quarantinePath, JSON.stringify(filteredLog, null, 2));
  console.log(`⚠️ Quarantined: ${symbol} | Reason: ${reason} @ ${now}`);

  if (shouldLearn(reason)) {
    try {
      const queue = fs.existsSync(learningQueuePath)
        ? JSON.parse(fs.readFileSync(learningQueuePath, "utf8"))
        : [];
      if (!queue.some(e => e.symbol === symbol)) {
        queue.push({ symbol, context: `quarantine:${reason}` });
        fs.writeFileSync(learningQueuePath, JSON.stringify(queue, null, 2));
        console.log(`🧠 Added to learning queue: ${symbol}`);
      } else {
        console.log(`🔁 Already in learning queue: ${symbol}`);
      }
    } catch (e) {
      console.error("❌ Learning queue write error:", e.message);
    }
  }
}

function shouldLearn(reason) {
  return (
    reason.includes("no mapped action") ||
    reason.includes("no keyword match")
  );
}

function getPriority(reason) {
  if (reason.includes("malformed") || reason.includes("exploit")) return "high";
  if (reason.includes("no mapped")) return "medium";
  return "low";
}
