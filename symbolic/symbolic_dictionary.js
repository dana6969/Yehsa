import fs from "fs";
export function getDefinitions(symbol) {
  const dict = JSON.parse(fs.readFileSync("symbolic_memory/full_dictionary.json", "utf8"));
  const entry = dict[symbol] || dict[symbol.toLowerCase()];
  return typeof entry === "string" ? entry : null;
}
