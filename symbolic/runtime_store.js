import fs from "fs";

const memory = {
  context: [],
  emotions: [],
  registry: new Map()
};

function append(file, row) {
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
}

export function rememberContext(entry) {
  memory.context.push(entry);
  if (memory.context.length > 50) memory.context.shift();
  append("symbolic_memory/context_log.jsonl", entry);
  return entry;
}

export function recentContext(limit = 10) {
  return memory.context.slice(-limit);
}

export function rememberEmotion(entry) {
  memory.emotions.push(entry);
  if (memory.emotions.length > 50) memory.emotions.shift();
  return entry;
}

export function latestEmotion() {
  return memory.emotions[memory.emotions.length - 1] || null;
}

export function registerSymbol(symbol, meta) {
  const row = { symbol, ...meta, at: new Date().toISOString() };
  memory.registry.set(symbol, row);
  append("symbolic_memory/registry_log.jsonl", row);
  return row;
}

export function lookupRegistered(symbol) {
  return memory.registry.get(symbol) || null;
}
