// Older field notes that new entries link to, and the plain question that reaches each one.
// tests check that every question here is answered by the note it names.
export const LEGACY_LINKS = {
  bleeding_pressure: { title: "stopping heavy bleeding", ask: "How do I stop heavy bleeding?" },
  tourniquet_last_resort: { title: "when a tourniquet is the last resort", ask: "When do I use a tourniquet for bleeding?" },
  shock_position: { title: "shock", ask: "What do I do for someone in shock?" },
  splint_immobilize: { title: "splinting a broken bone", ask: "How do I splint a broken bone?" },
  sprain_rice: { title: "a sprain", ask: "How do I treat a sprain?" },
  spinal_still: { title: "a possible spinal injury", ask: "What do I do if someone may have a spinal injury?" },
  cpr_rate_depth: { title: "CPR", ask: "What is the CPR compression rate and depth for an adult?" },
  chemical_eye_flush: { title: "a chemical in the eye", ask: "How do I flush a chemical out of the eye?" },
  frostbite_warming: { title: "frostbite", ask: "How do I treat frostbite?" },
  burn_cool_water: { title: "a burn", ask: "How do I treat a burn?" },
  nosebleed_forward: { title: "a nosebleed", ask: "How do I stop a nosebleed?" },
  choking_thrusts: { title: "choking", ask: "What do I do for a choking adult?" },
  epinephrine_auto: { title: "an allergic reaction", ask: "How do I use an epinephrine auto-injector for anaphylaxis?" },
  seizure_protect: { title: "a seizure", ask: "What do I do for a seizure?" },
  altitude_descend: { title: "altitude sickness", ask: "What do I do for altitude sickness?" },
  heart_attack_signs: { title: "heart attack signs", ask: "What are the signs of a heart attack?" },
  tick_removal: { title: "removing a tick", ask: "How do I remove a tick?" },
  oral_rehydration: { title: "oral rehydration", ask: "How do I make oral rehydration drink?" },
  cut_needs_stitches: { title: "when a cut needs stitches", ask: "When does a cut need stitches?" },
  clean_water_before_care: { title: "clean water before care", ask: "Why use clean water before treating a wound?" },
  toxic_vs_edible: { title: "toxic look-alikes", ask: "How do I tell toxic plants from edible ones?" },
  unknown_plant: { title: "an unknown plant", ask: "Can I eat a plant I have not identified?" },
  magnetic_declination: { title: "magnetic declination", ask: "What is magnetic declination?" },
  true_north: { title: "true north", ask: "What is true north?" },
  contour_reading: { title: "reading contour lines", ask: "How do I read contour lines?" },
  cold_layers: { title: "staying warm", ask: "How do I stay warm in the cold?" },
  lightning: { title: "lightning safety", ask: "What do I do in a lightning storm?" },
  watershed: { title: "watersheds", ask: "What is a watershed?" }
};
export const LEGACY_RELATED = new Set(Object.keys(LEGACY_LINKS));
