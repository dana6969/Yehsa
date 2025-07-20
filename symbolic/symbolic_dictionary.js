// symbolic/symbolic_dictionary.js
import fs from "fs";

const dictPath = "./symbolic_memory/dictionary_memory.json";

let dictionary = {};

try {
  const raw = fs.readFileSync(dictPath, "utf-8");
  dictionary = JSON.parse(raw);
} catch (err) {
  console.warn("⚠️  Failed to load dictionary:", err.message);
}

export function getDefinitions(word) {
  if (!word || typeof word !== "string") return [];
  const key = word.toLowerCase();
  return dictionary[key] || [];
}
