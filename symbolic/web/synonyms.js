// A few plain-word swaps so "deer scat" finds "droppings" in the manuals. Small on purpose.
const GROUPS = [
  ["scat", "droppings", "feces", "faeces", "dung", "poop"],
  ["tracks", "track", "footprints", "prints"],
  ["bite", "bites", "bitten"],
  ["sting", "stings", "stung"],
  ["bleeding", "hemorrhage", "haemorrhage", "blood"],
  ["frostbite", "frostbitten"],
  ["hypothermia", "hypothermic"],
  ["purify", "disinfect", "purification", "disinfection"],
  ["fire", "firecraft"],
  ["snare", "snares", "trap", "traps"],
  ["flu", "influenza"],
  ["outbreak", "outbreaks", "activity", "epidemic", "epidemics"],
  ["law", "laws", "statute", "statutes", "legal"]
];

/** queryTokens in, one array of interchangeable words per token out. */
export function expandTokens(tokens) {
  return tokens.map((token) => {
    const group = GROUPS.find((words) => words.includes(token));
    return group ? [token, ...group.filter((word) => word !== token)] : [token];
  });
}
