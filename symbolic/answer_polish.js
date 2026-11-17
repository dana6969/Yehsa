// Final wording pass for field answers. Removes filler disclaimers that read like a legal
// footer ("This is a planning note, not a wilderness course."). Real safety lines stay:
// only the exact filler sentences below are removed. The weather note's "not a local
// forecast" lines stay: they answer the forecast-premise questions. Pure string work, no I/O.

const FILLER = [
  /This is a planning note, not a wilderness course\./gi,
  /This is planning, not a building code\./gi,
  /This is planning, not a permit to camp where rules forbid it\./gi,
  /This (note )?does not treat (a )?cold injury\./gi,
  /This is not a foraging menu\./gi,
  /This is a hygiene reminder, not a medical treatment\./gi,
  /This is how to be found, not a radio trick\./gi,
  /This is not a complete orienteering manual\./gi,
  /This note does not teach you to burn the country\./gi,
  /This is not a weapons guide\./gi,
  /This is handling, not a fight\./gi,
  /This is an offline reminder, not a guarantee the water is safe, and not a substitute for emergency services\./gi,
  /This is not a timber or trail catalog\./gi,
  /This is not a climb grade\./gi,
  /This is a travel cue, not a soil survey or a road map\./gi,
  /This is a method sketch, not a course certificate\./gi
];

export function stripFiller(text) {
  if (typeof text !== "string" || !text) return text;
  let out = text;
  for (const pattern of FILLER) out = out.replace(pattern, "");
  // Collapse spaces left behind, but keep line breaks for step lists.
  out = out.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;])/g, "$1").replace(/[ \t]+\n/g, "\n").trim();
  // A topic label is not an answer opener: "Shelter and fire: get out..." -> "Get out...".
  out = out.replace(/^(?:Shelter and fire|Camp site|Sleep|Kitchen|Sanitation|Leave the site):\s+([a-z])/, (_, first) => first.toUpperCase());
  return out || text;
}
