// Quotes from the offline spiritual index. No paraphrase of scripture.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { quoteSpiritual } from "./spiritual_quote.js";
import { isFieldLightQuestion, isSpiritualQuestion } from "./spiritual_route.js";

export { isFieldLightQuestion, isSpiritualQuestion, quoteSpiritual };

const INDEX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../symbolic_memory/spiritual_index.json");
let cached = null;

function load() {
  if (cached) return cached;
  cached = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  return cached;
}

export function spiritualAnswer(raw) {
  return quoteSpiritual(raw, load().passages);
}
