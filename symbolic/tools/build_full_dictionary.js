import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

function readObject(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text || /^404\b/i.test(text)) {
    console.warn(`Skipping ${file}: missing or 404 placeholder`);
    return {};
  }
  const data = JSON.parse(text);
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

export function buildFullDictionary() {
  const existing = readObject("symbolic_memory/full_dictionary.json");
  const webster = readObject("symbolic_memory/webster_raw.json");
  const wordnet = readObject("symbolic_memory/wordnet_raw.json");
  const merged = { ...existing };
  for (const [key, value] of Object.entries(webster)) {
    if (typeof key === "string" && typeof value === "string" && value.trim()) merged[key.trim()] = value.trim();
  }
  for (const [key, value] of Object.entries(wordnet)) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    if (!merged[key] && !merged[key.toLowerCase()] && !merged[key.toUpperCase()]) merged[key.trim()] = value.trim();
  }
  return merged;
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isDirectRun()) {
  const merged = buildFullDictionary();
  fs.writeFileSync("symbolic_memory/full_dictionary.json", JSON.stringify(merged));
  console.log(`Dictionary built with ${Object.keys(merged).length} entries.`);
}
