// Hard rule: never attach a medication or treatment note to an unrelated injury.
// Each care note lists the conditions it is about. A care note is refused when the question
// names a different condition and none of the note's own, and a medication note is refused
// unless the question shows that note's own condition. Pure JavaScript, no model needed.

const CONDITIONS = {
  bleeding: /\b(bleed\w*|blood\w*|gash\w*|wound\w*|spurt\w*|pour\w* blood|hemorrhag\w*)\b/i,
  nosebleed: /\b(nose ?bleed\w*|nostril\w*|nose\b.*\b(?:blood|bleed\w*|gush\w*|drip\w*)|(?:blood|bleed\w*|gush\w*|drip\w*)\b.*\bnose)\b/i,
  choking: /\b(chok\w*|lodged|stuck in (?:his|her|my|their|the) throat|swallowed something)\b/i,
  cardiac_arrest: /\b(not breathing|isn'?t breathing|stopped breathing|unresponsive|out cold|collapsed|no pulse|cpr|chest compressions?)\b/i,
  anaphylaxis: /\b(anaphyla\w*|allerg\w*|epi-?pen|auto-?injector|hives|(?:face|throat|lips?|tongue)\b.{0,20}\b(?:swell\w*|puff\w*)|(?:swell\w*|puff\w*)\b.{0,20}\b(?:face|throat|lips?|tongue)|wheez\w*|bee sting|wasp sting)\b/i,
  shock: /\b(shock|clammy|pale|grey|gray|racing heart|heart is racing|fast pulse)\b/i,
  seizure: /\b(seizure\w*|convuls\w*|fit\b|jerk\w*|shaking uncontrollably)\b/i,
  eye_chemical: /\b(eyes?\b.{0,30}\b(?:chemical|bleach|acid|lye|cleaner|splash\w*|burn\w*)|(?:chemical|bleach|acid|lye|cleaner|splash\w*)\b.{0,30}\beyes?)\b/i,
  altitude: /\b(altitude|climbed high|high up|elevation sick\w*|mountain sick\w*)\b/i,
  heart_attack: /\b(heart attack|chest (?:pain|pressure|tight\w*)|crushing feeling|left arm)\b/i,
  burn: /\b(burn(?:ed|t)|(?:a|the|my|his|her|their|this|that) burns?|burns? (?:on|to|from)|scald\w*|scorch\w*|sunburn\w*|hot pan|boiling water)\b/i,
  tick: /\b(ticks?|bloodsucking bug|bug buried)\b/i,
  dehydration: /\b(dehydrat\w*|diarrh\w*|the runs|vomit\w*|rehydrat\w*|replace fluids)\b/i,
  sprain: /\b(sprain\w*|twist\w*|rolled my ankle|rolled (?:his|her) ankle|ankle|knee|wrist)\b/i,
  spinal: /\b(spine|spinal|neck (?:hurts|injur\w*|pain)|back (?:injur\w*)|fell (?:off|from) (?:the|a) (?:roof|ladder|cliff|height))\b/i,
  cut: /\b(cuts?|gash\w*|lacerat\w*|stitch\w*|sew\w* up|slic\w*)\b/i,
  frostbite: /\b(frostbit\w*|frozen (?:skin|toes|fingers)|white,? hard and numb|toes went white)\b/i,
  fracture: /\b(fractur\w*|broken (?:bone|arm|leg)|bone snapped|snapped|splint\w*|bent wrong)\b/i,
  insect_bite: /\b(mosquito\w*|bug bites?|insect bites?|itchy (?:red )?bumps?|bugs biting)\b/i,
  scrape: /\b(scrape\w*|graze\w*|scratch\w*)\b/i
};

// Notes that are care or treatment notes, with the conditions each one is about.
export const CARE_NOTES = {
  bleeding_pressure: ["bleeding", "cut", "scrape"],
  tourniquet_last_resort: ["bleeding"],
  nosebleed_forward: ["nosebleed"],
  choking_thrusts: ["choking", "cardiac_arrest"],
  cpr_rate_depth: ["cardiac_arrest", "choking"],
  epinephrine_auto: ["anaphylaxis"],
  shock_position: ["shock", "bleeding"],
  seizure_protect: ["seizure"],
  chemical_eye_flush: ["eye_chemical"],
  altitude_descend: ["altitude"],
  heart_attack_signs: ["heart_attack"],
  burn_cool_water: ["burn"],
  tick_removal: ["tick"],
  oral_rehydration: ["dehydration"],
  sprain_rice: ["sprain"],
  spinal_still: ["spinal"],
  cut_needs_stitches: ["cut", "bleeding"],
  frostbite_warming: ["frostbite"],
  splint_immobilize: ["fracture"],
  insect_bite_skin: ["insect_bite", "anaphylaxis"],
  clean_water_before_care: ["cut", "scrape", "dehydration", "bleeding", "burn", "insect_bite", "tick"],
  plantain_plantago: ["insect_bite"],
  yarrow_achillea: ["scrape", "bleeding", "cut"],
  willow_bark: [],
  // Round 4 field entries that are bleeding care.
  tourniquet_apply: ["bleeding"],
  tourniquet_bleeding_continues: ["bleeding"],
  wound_packing: ["bleeding"],
  arterial_bleeding: ["bleeding"],
  heavy_vs_minor_bleeding: ["bleeding", "cut", "scrape"]
};

// Medication notes: the question has to show the note's own condition, not just sit near it.
export const MEDICATION_NOTES = new Set(["epinephrine_auto", "oral_rehydration", "willow_bark", "plantain_plantago", "yarrow_achillea"]);

const PLANT_NAMED = /\b(willow|salix|plantain|plantago|yarrow|achillea|plant|herb|weed|bark|leaf|leaves|tree)\b/i;

export function namedConditions(question) {
  const text = String(question || "");
  const found = [];
  for (const [name, test] of Object.entries(CONDITIONS)) {
    if (test.test(text)) found.push(name);
  }
  return found;
}

export function isCareNote(symbol) {
  return Object.prototype.hasOwnProperty.call(CARE_NOTES, symbol);
}

// Returns null when the note may be attached, or a short reason when it may not.
export function treatmentGuard(question, symbol) {
  if (!isCareNote(symbol)) return null;
  const own = CARE_NOTES[symbol];
  const named = namedConditions(question);
  const matchesOwn = named.some((name) => own.includes(name));
  if (MEDICATION_NOTES.has(symbol)) {
    const plantNote = symbol === "willow_bark" || symbol === "plantain_plantago" || symbol === "yarrow_achillea";
    if (plantNote) {
      // A plant remedy is only offered when the question is about plants.
      if (!PLANT_NAMED.test(question)) return "plant remedy note when no plant was asked about";
      if (matchesOwn || symbol === "willow_bark" || named.length === 0) return null;
    }
    if (!matchesOwn) return "medication note without its own condition";
  }
  if (named.length && !matchesOwn) return "question names a different condition";
  return null;
}

export function namesOwnCondition(question, symbol) {
  if (!isCareNote(symbol)) return false;
  const own = CARE_NOTES[symbol];
  return namedConditions(question).some((name) => own.includes(name));
}

// True when a reply already speaks to the condition the question names for this note.
export function replyAddressesCondition(question, symbol, reply) {
  if (!isCareNote(symbol)) return false;
  const named = namedConditions(question).filter((name) => CARE_NOTES[symbol].includes(name));
  return named.some((name) => CONDITIONS[name].test(String(reply || "")));
}
