import fs from "fs";
import { isDirectRun } from "./direct_run.js";

const FILE = "./symbolic_memory/dictionary_memory.json";
let cached = null;

export function loadDictionaryMemory() {
  if (cached) return cached;
  const text = fs.readFileSync(FILE, "utf8").trim();
  if (!text || /^404\b/i.test(text)) {
    cached = {};
    return cached;
  }
  cached = JSON.parse(text);
  return cached;
}

export function getLexicalDefinitions(word) {
  if (typeof word !== "string") return [];
  const dict = loadDictionaryMemory();
  const value = dict[word.toLowerCase()] || dict[word] || dict[word.toUpperCase()];
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

if (isDirectRun(import.meta.url)) {
  const dict = loadDictionaryMemory();
  console.log(`Dictionary memory loaded (${Object.keys(dict).length} entries).`);
}
