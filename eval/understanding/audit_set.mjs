// R9 understanding audit (dev only, not a holdout). Natural how-to / what / why questions with the
// action and the thing they ask about, and the notes that would be a right top answer.
// Generated from templates x species for game care, plus hand-written questions for the other areas.

const UPLAND = ["field_dressing_upland_birds"];
const DRESS = {
  partridge: UPLAND, chukar: UPLAND, "Hungarian partridge": UPLAND, "gray partridge": UPLAND, grouse: UPLAND,
  "ruffed grouse": UPLAND, pheasant: UPLAND, quail: UPLAND, bobwhite: UPLAND, woodcock: UPLAND, dove: UPLAND, ptarmigan: UPLAND,
  turkey: ["field_dressing_turkey"], duck: ["field_dressing_waterfowl"], mallard: ["field_dressing_waterfowl"],
  teal: ["field_dressing_waterfowl"], goose: ["field_dressing_waterfowl"], "Canada goose": ["field_dressing_waterfowl"],
  "snow goose": ["field_dressing_waterfowl"], deer: ["field_dressing_deer"], whitetail: ["field_dressing_deer"],
  "mule deer": ["field_dressing_deer"], buck: ["field_dressing_deer"], elk: ["field_dressing_elk"], moose: ["field_dressing_moose"],
  pronghorn: ["field_dressing_pronghorn"], antelope: ["field_dressing_pronghorn"], bear: ["field_dressing_black_bear"],
  "black bear": ["field_dressing_black_bear"], hog: ["field_dressing_wild_hog"], "wild boar": ["field_dressing_wild_hog"],
  "feral hog": ["field_dressing_wild_hog"], rabbit: ["field_dressing_rabbit"], hare: ["field_dressing_rabbit"],
  cottontail: ["field_dressing_rabbit"], "snowshoe hare": ["field_dressing_rabbit"], squirrel: ["field_dressing_squirrel"],
  "gray squirrel": ["field_dressing_squirrel"], trout: ["fish_cleaning_spoilage"], bass: ["fish_cleaning_spoilage"],
  perch: ["fish_cleaning_spoilage"], pike: ["fish_cleaning_spoilage"], walleye: ["fish_cleaning_spoilage"],
  fish: ["fish_cleaning_spoilage"], "brook trout": ["fish_cleaning_spoilage"], salmon: ["fish_cleaning_spoilage"]
};
const PLURAL = { goose: "geese", "Canada goose": "Canada geese", "snow goose": "snow geese", deer: "deer", "mule deer": "mule deer", elk: "elk", moose: "moose", fish: "fish", trout: "trout", "brook trout": "brook trout", salmon: "salmon", perch: "perch", pike: "pike", walleye: "walleye", bass: "bass", quail: "quail", grouse: "grouse", "ruffed grouse": "ruffed grouse", pronghorn: "pronghorn", antelope: "antelope", ptarmigan: "ptarmigan", "feral hog": "feral hogs", "wild boar": "wild boar", partridge: "partridges", "Hungarian partridge": "Hungarian partridges", "gray partridge": "gray partridges", "snowshoe hare": "snowshoe hares", "gray squirrel": "gray squirrels", "black bear": "black bears" };
const plural = (s) => PLURAL[s] || `${s}s`;
const an = (s) => (/^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`);
const FISH = new Set(["trout", "bass", "perch", "pike", "walleye", "fish", "brook trout", "salmon"]);

const DRESS_T = [
  (s) => `How to gut ${an(s)}`,
  (s) => `how do I field dress ${an(s)}?`,
  (s) => `whats the best way to clean ${an(s)}`,
  (s) => `I just shot ${an(s)}, how do I dress it out?`,
  (s) => `steps for gutting ${plural(s)}`,
  (s) => `how do you eviscerate ${an(s)}`
];
const FISH_T = [
  (s) => `How do I clean ${an(s)}?`,
  (s) => `how to gut ${an(s)}`,
  (s) => `best way to clean ${plural(s)} I caught`
];
const COOK = ["game_cooking_temps", "food_safe_cook_temps"];
const COOK_S = ["pheasant", "partridge", "duck", "goose", "grouse", "deer", "venison", "elk", "bear", "rabbit", "squirrel", "wild hog", "turkey", "quail", "moose"];
const COOK_T = [
  (s) => `what temperature should I cook ${s} to`,
  (s) => `how do I cook ${s} safely?`
];
const ID = {
  deer: ["white_tailed_deer"], "white-tailed deer": ["white_tailed_deer"], moose: ["moose"], elk: ["elk"], "black bear": ["black_bear"],
  turkey: ["wild_turkey"], "ruffed grouse": ["ruffed_grouse"], "Canada goose": ["canada_goose"], "snowshoe hare": ["snowshoe_hare"],
  "wild boar": ["wild_boar"], coyote: ["coyote"], "red fox": ["red_fox"], bobcat: ["bobcat"], porcupine: ["porcupine"], raccoon: ["raccoon"],
  beaver: ["beaver"], skunk: ["striped_skunk"], rattlesnake: ["rattlesnake"], copperhead: ["copperhead"]
};
const ID_T = [
  (s) => `what does ${an(s)} look like`,
  (s) => `how do I identify ${an(s)}?`
];
const TRACK = {
  deer: ["deer_track"], bear: ["bear_track"], moose: ["moose_track"], turkey: ["turkey_track"], rabbit: ["rabbit_track"],
  raccoon: ["raccoon_track"], bobcat: ["bobcat_track"], coyote: ["canine_track"], fox: ["canine_track"]
};
const TRACK_T = [(s) => `what do ${s} tracks look like`, (s) => `how do I recognize ${s} prints`];

// Other areas: [question, acceptable notes, action, area].
const OTHER = [
  ["how do I stop heavy bleeding from a leg", ["heavy_vs_minor_bleeding", "bleeding_pressure", "pressure_bandage", "arterial_bleeding", "tourniquet_apply"], "treat", "first aid", /bleed|tourniquet|pressure/],
  ["my friend is bleeding a lot from his arm what do I do", ["heavy_vs_minor_bleeding", "bleeding_pressure", "pressure_bandage", "arterial_bleeding", "tourniquet_apply"], "treat", "first aid", /bleed|tourniquet|pressure/],
  ["how do I put on a tourniquet", ["tourniquet_apply", "tourniquet_last_resort"], "treat", "first aid", /tourniquet/],
  ["how should I clean a cut out here", ["wound_cleaning", "clean_water_before_care"], "treat", "first aid", /wound|cut|clean_water/],
  ["how do I tell if a wound is infected", ["wound_infection_signs"], "identify", "first aid", /infect/],
  ["what are the signs of hypothermia", ["hypothermia_stages", "hypothermia_mild_weather"], "identify", "first aid", /hypotherm/],
  ["how do I warm up someone with hypothermia", ["rewarming_safely", "hypothermia_stages"], "treat", "first aid", /hypotherm|rewarm/],
  ["how do I treat frostbite", ["frostbite_dont", "frostnip_vs_frostbite"], "treat", "first aid", /frostbite/],
  ["what do I do for heat stroke", ["heat_stroke_signs"], "treat", "first aid", /heat/],
  ["how do I treat a burn", ["burn_degrees"], "treat", "first aid", /burn_(?:cool|degree)/],
  ["how do I splint a broken arm", ["broken_bone_signs", "fracture_sprain_dislocation", "sling_and_swathe", "open_fracture"], "treat", "first aid", /splint|fracture|bone|sling/],
  ["what should I do for a sprained ankle", ["fracture_sprain_dislocation"], "treat", "first aid", /sprain/],
  ["how do I treat a blister on my heel", ["blister_care"], "treat", "first aid", /blister/],
  ["how do I get a tick off", ["tick_prevention", "lyme_signs", "tick_removal"], "treat", "first aid", /tick/],
  ["what are the signs of lyme disease", ["lyme_signs"], "identify", "first aid", /lyme|tick/],
  ["what do I do for a snake bite", ["snakebite_new_england", "snake_bite"], "treat", "first aid", /snake/],
  ["how do I help someone having an allergic reaction to a bee sting", ["anaphylaxis_signs", "bee_wasp_sting"], "treat", "first aid", /anaphyla|sting/],
  ["how do I remove a fishhook from my finger", ["fishhook_removal"], "treat", "first aid", /fishhook/],
  ["how do I do CPR", ["cpr_when_to_start", "child_infant_cpr"], "treat", "first aid", /cpr/],
  ["what are the signs of a concussion", ["concussion_signs"], "identify", "first aid", /concussion|head_injur/],
  ["how do I treat poison ivy rash", ["poison_ivy_rash"], "treat", "first aid", /poison_ivy/],
  ["someone is choking what do I do", ["child_infant_choking", "choking"], "treat", "first aid", /chok/],
  ["what are signs of a stroke", ["stroke_fast"], "identify", "first aid", /stroke/],
  ["how do I put someone in the recovery position", ["recovery_position"], "treat", "first aid", /recovery/],
  ["how do I make water safe to drink", ["water_safe_to_drink", "boil_water_method", "water_bleach_disinfect", "water_filter_then_disinfect", "boil_water"], "purify", "water", /water_(?:treat|safe|boil|bleach|filter|purif)|boil|guide_water_treat/],
  ["how long do I boil water", ["boil_water_method", "boil_water"], "purify", "water", /boil/],
  ["how much bleach to purify water", ["water_bleach_disinfect"], "purify", "water", /bleach|guide_water_treat/],
  ["can I drink snow", ["snow_melt_water"], "purify", "water", /snow/],
  ["how do I find water in the woods", ["water_find_new_england"], "find", "water", /water_find|find_water/],
  ["how do I use a water filter", ["water_filter_use", "water_filter_then_disinfect", "water_filter_care"], "purify", "water", /filter/],
  ["how much water do I need a day", ["water_how_much", "hydration_basics"], "what", "water", /water_how|hydrat/],
  ["is stream water safe to drink", ["water_safe_to_drink", "giardia_crypto", "water_no_go_sources", "water_filter_then_disinfect"], "what", "water", /water_safe|giardia|stream|guide_water_treat/],
  ["how do I collect rainwater", ["rain_collect_water"], "find", "water", /rain/],
  ["how do I start a fire with wet wood", ["fire_wet_wood"], "make", "fire", /fire_wet|wet/],
  ["how do I build a teepee fire", ["fire_build_teepee"], "make", "fire", /teepee|fire_lays|fire_build/],
  ["what is good tinder", ["fire_tinder_kindling_fuel"], "what", "fire", /tinder/],
  ["how do I put a campfire out completely", ["fire_out_completely"], "make", "fire", /fire_out|extinguish/],
  ["where should I build my fire", ["fire_site_choice"], "make", "fire", /fire_site/],
  ["how do I use a ferro rod", ["fire_lighters_ferro"], "make", "fire", /ferro|fire_lighters/],
  ["how do I make a fire on snow", ["fire_snow"], "make", "fire", /fire_snow|snow/],
  ["how do I keep a fire going overnight", ["fire_bank_ember"], "make", "fire", /bank|overnight/],
  ["how do I build a debris hut", ["debris_hut_build"], "make", "shelter", /debris/],
  ["how do I make a lean-to", ["lean_to_build"], "make", "shelter", /lean/],
  ["how do I set up a tarp shelter", ["tarp_shelter_rig"], "make", "shelter", /tarp/],
  ["where should I put my shelter", ["shelter_site_hazards", "shelter_for_conditions"], "make", "shelter", /shelter_site/],
  ["how do I stay warm in a snow cave", ["snow_shelter_ventilation"], "make", "shelter", /snow_shelter|snow_cave/],
  ["I'm stuck in my car in a snowstorm what do I do", ["stuck_in_car_snow"], "treat", "shelter", /stuck_in_car|car/],
  ["how do I insulate myself from the ground", ["ground_first_insulation", "insulation_how_much"], "make", "shelter", /insulat|ground/],
  ["how do I use a compass with a map", ["map_orient_compass", "bearing_take_follow", "compass_parts"], "navigate", "navigation", /compass/],
  ["how do I find north without a compass", ["sun_direction_rough", "stars_north", "north_types", "find_north"], "navigate", "navigation", /north|no_gps|sun|star/],
  ["what is magnetic declination", ["declination_basics"], "what", "navigation", /declination/],
  ["how do I follow a bearing", ["bearing_take_follow"], "navigate", "navigation", /bearing/],
  ["what do I do if I get lost", ["lost_stop_plan"], "navigate", "navigation", /lost/],
  ["how do I read contour lines", ["contour_terrain_features"], "navigate", "navigation", /contour/],
  ["how do I find the north star", ["stars_north"], "navigate", "navigation", /star|north/],
  ["how do I measure distance by pacing", ["map_distance_pace"], "navigate", "navigation", /pace|distance/],
  ["how do I cross a stream safely", ["stream_crossing_choice"], "navigate", "navigation", /stream|river/],
  ["what does a falling barometer mean", ["barometer_trend"], "what", "weather", /barometer/],
  ["how far away is the lightning", ["flash_to_bang"], "what", "weather", /flash_to_bang|lightning/],
  ["what should I do in a thunderstorm in the woods", ["thunderstorm_stages", "thunderstorm_hunting_water", "lightning_myths", "lightning_safety"], "treat", "weather", /thunder|lightning/],
  ["what are the signs a tornado is coming", ["tornado_signs"], "identify", "weather", /tornado/],
  ["what's the difference between a watch and a warning", ["watch_vs_warning"], "what", "weather", /watch/],
  ["what does a halo around the moon mean", ["cirrostratus_halo"], "what", "weather", /halo/],
  ["what is wind chill", ["wind_chill"], "what", "weather", /wind_chill/],
  ["what do cumulonimbus clouds mean", ["cumulonimbus_cloud"], "what", "weather", /cumulonimbus/],
  ["how do I predict the weather without a forecast", ["weather_signals_combined", "weather_folk_signs", "weather_trend_reading"], "what", "weather", /weather_signal|folk|forecast|trend/],
  ["what should I do in a flash flood", ["flash_flood_risk"], "treat", "weather", /flood/],
  ["is poison hemlock dangerous", ["poison_hemlock"], "identify", "plants", /hemlock/],
  ["how do I tell queen anne's lace from poison hemlock", ["wild_carrot_lookalike", "poison_hemlock"], "identify", "plants", /hemlock|carrot/],
  ["can I eat dandelions", ["dandelion_greens"], "what", "plants", /dandelion/],
  ["how do I identify poison ivy", ["poison_ivy_id"], "identify", "plants", /poison_ivy/],
  ["are fiddleheads safe to eat", ["fiddleheads_ostrich_fern"], "what", "plants", /fiddlehead/],
  ["how do I make acorns edible", ["acorns_leaching"], "preserve", "plants", /acorn/],
  ["which wild berries are poisonous", ["toxic_berries_new_england"], "identify", "plants", /berr/],
  ["how do I tell a chanterelle from a jack o lantern", ["chanterelle_vs_lookalikes", "jack_o_lantern_mushroom"], "identify", "plants", /chanterelle|jack_o/],
  ["can I eat cattails", ["cattail_lookalikes"], "what", "plants", /cattail/],
  ["how do I make venison jerky", ["jerky_drying_meat"], "preserve", "cooking", /jerky/],
  ["how do I can venison", ["home_canning_safe"], "preserve", "cooking", /canning/],
  ["how long can food sit out", ["food_danger_zone", "food_leftovers_safety"], "preserve", "cooking", /danger_zone|leftover/],
  ["what temperature should chicken be cooked to", ["food_safe_cook_temps"], "cook", "cooking", /cook_temp/],
  ["is my deer meat spoiled", ["meat_care_temperature"], "preserve", "cooking", /meat_care|spoil/],
  ["how do I keep deer meat cool in warm weather", ["meat_care_temperature"], "preserve", "hunting", /meat_care/],
  ["how do I skin a deer", ["skinning_hanging_deer"], "skin", "hunting", /skinning/],
  ["how long should I hang a deer", ["skinning_hanging_deer", "meat_care_temperature"], "preserve", "hunting", /meat_care|skinning|hang/],
  ["how do I butcher a deer", ["basic_butcher_cuts"], "butcher", "hunting", /butcher/],
  ["how do I quarter an elk", ["gutless_method", "quartering_packing_out"], "butcher", "hunting", /gutless|quarter/],
  ["what is the gutless method", ["gutless_method"], "what", "hunting", /gutless/],
  ["what do white spots on a deer liver mean", ["game_disease_field_signs"], "identify", "hunting", /disease|liver/],
  ["how do I track a wounded deer", ["hunt_blood_trail"], "track", "hunting", /blood_trail/],
  ["where should I shoot a deer", ["hunt_shot_placement"], "hunt", "hunting", /shot_placement/],
  ["what do I need to field dress a deer", ["field_dress_tools"], "dress", "hunting", /field_dress_tools/],
  ["what is chronic wasting disease", ["cwd_awareness"], "what", "hunting", /cwd/],
  ["how do I tell if a rabbit has tularemia", ["small_game_tularemia", "game_disease_field_signs"], "identify", "hunting", /tularemia|disease/],
  ["what does deer scat look like", ["deer_scat"], "identify", "hunting", /deer_scat/],
  ["how do I find deer to hunt", ["deer_sign_reading", "deer_track", "deer_rub", "deer_scrape"], "hunt", "hunting", /deer_sign|deer_track|deer_rub|deer_scrape/],
  ["what are the duck hunting rules", ["waterfowl_rules_link"], "what", "hunting", /waterfowl/]
];

export function auditSet() {
  const out = [];
  for (const [s, want] of Object.entries(DRESS)) {
    const templates = FISH.has(s) ? FISH_T : DRESS_T;
    templates.forEach((t, i) => out.push({ id: `dress-${s.replace(/\s+/g, "_")}-${i}`, question: t(s), want, action: "dress", entity: s, area: FISH.has(s) ? "fishing" : "hunting" }));
  }
  for (const s of COOK_S) COOK_T.forEach((t, i) => out.push({ id: `cook-${s.replace(/\s+/g, "_")}-${i}`, question: t(s), want: COOK, action: "cook", entity: s, area: "cooking" }));
  for (const [s, want] of Object.entries(ID)) ID_T.forEach((t, i) => out.push({ id: `id-${s.replace(/\s+/g, "_")}-${i}`, question: t(s), want, action: "identify", entity: s, area: "animals" }));
  for (const [s, want] of Object.entries(TRACK)) TRACK_T.forEach((t, i) => out.push({ id: `track-${s}-${i}`, question: t(s), want, action: "track", entity: s, area: "hunting" }));
  OTHER.forEach(([question, want, action, area, topic], i) => out.push({ id: `other-${i}`, question, want, action, area, topic }));
  return out;
}
