import fs from "fs";

const webster = JSON.parse(fs.readFileSync("symbolic_memory/webster_raw.json", "utf-8"));
const wordnet = JSON.parse(fs.readFileSync("symbolic_memory/wordnet_raw.json", "utf-8"));

const merged = { ...webster, ...wordnet };
const deduped = Object.entries(merged).reduce((acc, [k, v]) => {
  if (typeof k === "string" && typeof v === "string") acc[k.trim()] = v.trim();
  return acc;
}, {});

fs.writeFileSync("symbolic_memory/full_dictionary.json", JSON.stringify(deduped, null, 2));
console.log(`✅ Dictionary built with ${Object.keys(deduped).length} entries.`);

