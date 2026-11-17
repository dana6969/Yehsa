// Paraphrase development set for the meaning matcher.
// Written by hand from the topics of the shipped field notes, reworded so the key note words
// are mostly absent. It is not the frozen v1 suite and not an external holdout. eval/run.mjs
// does not load it. Score it with `node eval/paraphrase_run.mjs`.

const f = (id, category, prompt, all, none = []) => ({ id, category, prompt, expect: { kind: "facts", all, none } });
const a = (id, category, prompt) => ({ id, category, prompt, expect: { kind: "abstain" } });

export const PARAPHRASE_SET = [
  // First aid, described in plain words instead of the note's terms.
  f("pp-nose-1", "first-aid", "Blood keeps dripping out of my kid's nostrils, what should I do?", ["lean forward", "pinch"], ["tourniquet"]),
  f("pp-nose-2", "first-aid", "My nose won't stop gushing red after I blew it, should I tip my head back?", ["do not tilt"], ["tourniquet"]),
  f("pp-choke-1", "first-aid", "My dad has food lodged in his throat and can't get any air or make a sound", ["abdominal thrusts"]),
  f("pp-choke-2", "first-aid", "A little baby swallowed something and it's stuck, how do I get it out?", ["back blows"]),
  f("pp-cpr-1", "first-aid", "She collapsed and isn't breathing, how hard and fast do I push on her chest?", ["100 to 120", "5 cm"]),
  f("pp-cpr-2", "first-aid", "How many pushes a minute when doing chest compressions on someone who's out cold?", ["100 to 120"]),
  f("pp-epi-1", "first-aid", "His lips and throat are puffing up after a bee sting and he's wheezing, he has an EpiPen", ["outer thigh", "emergency"]),
  f("pp-epi-2", "first-aid", "Where do I jab the allergy pen during a severe allergic reaction?", ["outer thigh"]),
  f("pp-shock-1", "first-aid", "After the crash he's clammy, grey, his heart is racing and he's not making sense", ["lie down", "warm"]),
  f("pp-seize-1", "first-aid", "My friend is on the floor shaking and jerking uncontrollably, do I hold her down?", ["do not restrain"]),
  f("pp-seize-2", "first-aid", "Should I put a spoon between his teeth while he's convulsing?", ["do not put anything in the mouth"]),
  f("pp-eye-1", "first-aid", "I got bleach in my eye and it burns, what now?", ["flush", "running water"]),
  f("pp-alt-1", "first-aid", "We climbed high today and now I have a pounding headache and feel like throwing up", ["descend"]),
  f("pp-heart-1", "first-aid", "Crushing feeling in my chest that's spreading down my left arm and I'm sweaty", ["emergency services"]),
  f("pp-burn-1", "first-aid", "I grabbed a hot pan and scorched my palm, should I put butter on it?", ["cool running water"], ["epinephrine"]),
  f("pp-burn-2", "first-aid", "Boiling water spilled on my leg, how should I treat the scald?", ["cool"], ["epinephrine"]),
  f("pp-tick-1", "first-aid", "There's a little bloodsucking bug buried in my skin after the hike, how do I pull it off?", ["tweezers"]),
  f("pp-ors-1", "first-aid", "I've had the runs all day and feel drained, how do I mix a drink to replace fluids?", ["sugar", "salt"]),
  f("pp-sprain-1", "first-aid", "I rolled my ankle on a rock and it's swollen, how do I look after it?", ["elevation"], ["epinephrine", "tourniquet"]),
  f("pp-spine-1", "first-aid", "He fell off the roof and says his neck hurts, should I sit him up?", ["do not move"]),
  f("pp-cut-1", "first-aid", "The gash on my forearm is wide open and deep, does it need sewing up?", ["stitches"]),
  f("pp-tq-1", "first-aid", "Blood is spurting from his thigh and pressing on it isn't working", ["tourniquet"]),
  f("pp-frost-1", "first-aid", "My toes went white, hard and numb in the snow, should I rub them?", ["do not rub"]),
  f("pp-splint-1", "first-aid", "I think her forearm bone snapped, how do I keep it from moving?", ["splint"]),
  f("pp-bleed-1", "first-aid", "Someone has a deep wound that's pouring blood, what's the first thing?", ["direct pressure"]),
  f("pp-bite-1", "first-aid", "I've got itchy red bumps from bugs biting me at the lake", ["itchy"]),
  // Plants.
  f("pp-plant-1", "herbology", "Can I eat these berries I found if I don't know what they are?", ["not"], ["salix"]),
  f("pp-plant-2", "herbology", "What warning signs mean a wild plant might be poisonous?", ["milky sap"]),
  f("pp-plant-3", "herbology", "Is there a plant from my yard I can mash up and put on an itchy bug bite?", ["plantain"]),
  f("pp-plant-4", "herbology", "Which tree's inner layer was used for aches before modern painkillers?", ["willow"]),
  f("pp-plant-5", "herbology", "What's that feathery-leaved weed with flat white flowers people put on scrapes?", ["yarrow"]),
  // Water.
  f("pp-water-1", "water", "How do I make creek water okay to drink?", ["boil"]),
  f("pp-water-2", "water", "Where should I look for something to drink on a dry hillside?", ["seep"]),
  f("pp-water-3", "water", "Is it okay to just eat snow when I'm thirsty and cold?", ["melting"]),
  f("pp-water-4", "water", "What should I carry my drinking supply in?", ["container"]),
  f("pp-water-5", "water", "How should I ration what I drink while hiking in the heat?", ["small amounts"]),
  // Weather.
  f("pp-wx-1", "weather", "Thunderheads are building over the peak, where should I go?", ["high ground"]),
  f("pp-wx-2", "weather", "How can I tell rain is coming without a forecast?", ["wind"]),
  f("pp-wx-3", "weather", "Why is it colder when there are no clouds at night?", ["clear night"]),
  f("pp-wx-4", "weather", "It's scorching out with no shade, how should I plan my walking?", ["earlier and later"]),
  f("pp-wx-5", "weather", "Lightning and a sudden temperature drop on the ridge, what do I do?", ["lower"]),
  // Shelter and fire.
  f("pp-fire-1", "shelter", "How do I get a campfire going from small sticks?", ["tinder"]),
  f("pp-fire-2", "shelter", "Where should I put up a lean-to so I stay dry overnight?", ["flood"]),
  f("pp-fire-3", "shelter", "I can't make a flame, how do I keep warm through the night?", ["dry"]),
  f("pp-fire-4", "shelter", "What do I need before I light a cooking blaze in the woods?", ["put it out"]),
  // Signaling.
  f("pp-sig-1", "signaling", "How do I let rescuers know where I am?", ["three"]),
  f("pp-sig-2", "signaling", "What's the right way to blow a whistle when I'm lost?", ["three short blasts"]),
  f("pp-sig-3", "signaling", "How do I make a sign on the ground that a plane can see?", ["large x"]),
  f("pp-sig-4", "signaling", "If I have to walk away from my spot, how do I show searchers which way I went?", ["arrow"]),
  // Navigation and land.
  f("pp-nav-1", "navigation", "I'm turned around in the woods and don't know where I am, what should I do?", ["stay"]),
  f("pp-nav-2", "navigation", "How do I keep track of how far I've walked without a GPS?", ["pace"]),
  f("pp-nav-3", "navigation", "Can I follow a creek or a ridgeline to keep my bearings?", ["handrail"]),
  f("pp-nav-4", "navigation", "Does moss on trees show which way is north?", ["moss is not a compass"]),
  f("pp-nav-5", "navigation", "Why doesn't my compass needle line up with the top of my paper map?", ["declination"]),
  f("pp-nav-6", "navigation", "What do the squiggly lines on a topo map mean?", ["elevation"]),
  f("pp-nav-7", "navigation", "How do I use a compass and a map together to walk a line?", ["needle"]),
  f("pp-nav-8", "navigation", "If I follow a stream downhill will it lead me to help?", ["not necessarily"]),
  f("pp-nav-9", "navigation", "How do I cross a river safely on foot?", ["wade"]),
  f("pp-nav-10", "navigation", "What kind of features make good reference points out in the wild?", ["peak"]),
  f("pp-nav-11", "navigation", "Which way does the sun come up?", ["east"]),
  f("pp-land-1", "landscape", "What should I watch out for walking along the beach below the cliffs?", ["tide"]),
  f("pp-land-2", "landscape", "Why can a dry gully in the desert be dangerous?", ["flood"]),
  f("pp-land-3", "landscape", "What changes as I hike higher up a big peak?", ["colder"]),
  f("pp-land-4", "landscape", "How do I find my way in flat frozen open country with no trees?", ["bearing"]),
  f("pp-land-5", "landscape", "What decides whether an area is grassland, forest, or desert?", ["climate"]),
  f("pp-land-6", "landscape", "Does this app have street maps for towns?", ["no city"]),
  // Camp.
  f("pp-camp-1", "camp", "Where's a good spot to pitch my tent for the night?", ["flat ground"]),
  f("pp-camp-2", "camp", "How do I go to the bathroom properly in the backcountry?", ["cathole"]),
  f("pp-camp-3", "camp", "How do I stay warm in my sleeping bag on cold ground?", ["insulation"]),
  f("pp-camp-4", "camp", "How do I keep bears away from my cooking area?", ["downwind"]),
  f("pp-camp-5", "camp", "What should I do when packing up my campsite?", ["pack out"]),
  f("pp-camp-6", "camp", "How do I keep bugs from eating me alive at camp?", ["standing water"]),
  // Food and tools.
  f("pp-food-1", "food", "Can I eat wild mushrooms when I run out of supplies?", ["mushrooms"]),
  f("pp-food-2", "food", "My canned beans are puffed up at the top, are they fine?", ["discard"]),
  f("pp-food-3", "food", "What should I bring to eat on a multi-day trek?", ["pack food"]),
  f("pp-tool-1", "tools", "How should I handle a blade safely around camp?", ["away from your body"]),
  f("pp-tool-2", "tools", "What rope should I bring and which knots should I know?", ["two knots"]),
  f("pp-tool-3", "tools", "How do I fix a ripped strap out in the field?", ["needle"]),
  // Math concepts.
  f("pp-math-1", "math", "What's the long side of a right-angled triangle related to?", ["hypotenuse"]),
  f("pp-math-2", "math", "What is the slope of a curve at a single point called?", ["derivative"]),
  f("pp-math-3", "math", "What happens if you split a number into zero groups?", ["undefined"]),
  f("pp-math-4", "math", "How do I get the space inside a round shape?", ["radius squared"]),
  f("pp-math-5", "math", "What do the corners of a three-sided shape add up to?", ["180"]),
  f("pp-math-6", "math", "What does the area under a curve mean in calculus?", ["integral"]),
  // Medication and treatment guard: the reply must not attach an unrelated treatment note.
  f("pp-guard-1", "guard", "I twisted my knee playing soccer and it hurts", ["rest"], ["epinephrine", "tourniquet", "abdominal thrusts"]),
  f("pp-guard-2", "guard", "My hand got a small scrape on a rock", ["clean"], ["epinephrine", "tourniquet", "cpr"]),
  f("pp-guard-3", "guard", "I bumped my nose and it's bleeding a little", ["pinch"], ["tourniquet", "epinephrine"]),
  f("pp-guard-4", "guard", "My sunburn stings, what can I do?", ["cool"], ["epinephrine", "abdominal", "tourniquet"]),
  // Two questions in one.
  f("pp-multi-1", "multi", "How do I make stream water safe, and also how do I signal a helicopter?", ["boil", "three"]),
  f("pp-multi-2", "multi", "Her ankle is puffy from a twist, and she also has a tick stuck in her arm", ["elevation", "tweezers"]),
  // Out of scope: semantically close to some note but not answered by any note. Silence passes.
  a("pp-off-1", "abstain", "What's the best brand of hiking boots to buy?"),
  a("pp-off-2", "abstain", "How many calories does a marathon runner burn?"),
  a("pp-off-3", "abstain", "Who won the mountain bike championship last year?"),
  a("pp-off-4", "abstain", "How do I fix a leaking kitchen faucet?"),
  a("pp-off-5", "abstain", "What is the stock price of an outdoor gear company?"),
  a("pp-off-6", "abstain", "How do I get a passport renewed?"),
  a("pp-off-7", "abstain", "What's a good recipe for chocolate cake?"),
  a("pp-off-8", "abstain", "How many milligrams of ibuprofen should I take for my sprained wrist?"),
  a("pp-off-9", "abstain", "Can you write me a poem about the ocean?"),
  a("pp-off-10", "abstain", "What is the airline baggage limit for camping gear?")
];
