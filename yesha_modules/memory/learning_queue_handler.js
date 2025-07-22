import fs from 'fs';
import path from 'path';

export function logLearningNeed(data) {
  const filePath = './yesha_modules/memory/learning_queue.json';
  const dirPath = path.dirname(filePath);

  try {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

    let queue = [];
    if (fs.existsSync(filePath)) {
      queue = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    const symbol = data?.symbol?.toUpperCase?.();
    const context = data?.context || '';

    if (!symbol || typeof symbol !== 'string') {
      console.warn("⚠️ Skipping invalid entry:", data);
      return;
    }

    if (queue.some(entry => entry.symbol === symbol)) {
      console.log(`🛑 Symbol already exists: ${symbol}`);
      return;
    }

    const entry = {
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      symbol,
      context
    };

    queue.push(entry);
    fs.writeFileSync(filePath, JSON.stringify(queue, null, 2));
    console.log(`✅ Learned: ${symbol}`);
  } catch (err) {
    console.error("❌ Learning queue error:", err.message);
  }
}
