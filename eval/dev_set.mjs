// Development questions for the answer-quality mechanisms.
// This file is not the frozen v1 suite and it is not the external holdout.
// eval/run.mjs does not load it.

export const DEV_SET = [
  {
    id: "off-tokyo",
    category: "relevance",
    prompt: "What is the population of Tokyo this year?",
    expect: { kind: "abstain" }
  },
  {
    id: "off-basket",
    category: "relevance",
    prompt: "How do I weave a willow basket for carrying laundry?",
    expect: { kind: "abstain" }
  },
  {
    id: "off-clock",
    category: "relevance",
    prompt: "How do I repair a clock that ticks too fast?",
    expect: { kind: "abstain" }
  },
  {
    id: "aid-nosebleed",
    category: "first-aid",
    prompt: "How do I stop a nosebleed?",
    expect: { kind: "facts", all: ["lean forward", "pinch", "emergency"] }
  },
  {
    id: "aid-choke-adult",
    category: "first-aid",
    prompt: "An adult is choking and cannot cough. What do I do?",
    expect: { kind: "facts", all: ["abdominal", "emergency"] }
  },
  {
    id: "aid-choke-infant",
    category: "first-aid",
    prompt: "An infant is choking. What thrusts are used?",
    expect: { kind: "facts", all: ["back blows", "chest", "emergency"] }
  },
  {
    id: "aid-cpr",
    category: "first-aid",
    prompt: "What is the CPR compression rate and depth for an adult?",
    expect: { kind: "facts", all: ["100", "120", "5 cm", "emergency"] }
  },
  {
    id: "aid-epi",
    category: "first-aid",
    prompt: "How do I use an epinephrine auto-injector for anaphylaxis?",
    expect: { kind: "facts", all: ["outer thigh", "label", "emergency"], none: ["mg"] }
  },
  {
    id: "aid-shock",
    category: "first-aid",
    prompt: "Someone looks pale and confused after an injury and I think it is shock. What do I do?",
    expect: { kind: "facts", all: ["lie down", "emergency"] }
  },
  {
    id: "aid-seizure",
    category: "first-aid",
    prompt: "A person is having a seizure. What do I do?",
    expect: { kind: "facts", all: ["mouth", "emergency"], none: ["put something in the mouth"] }
  },
  {
    id: "aid-eye",
    category: "first-aid",
    prompt: "A chemical splashed in the eye. What do I do?",
    expect: { kind: "facts", all: ["flush", "emergency"] }
  },
  {
    id: "aid-altitude",
    category: "first-aid",
    prompt: "What are signs of altitude sickness and what do I do?",
    expect: { kind: "facts", all: ["descend", "emergency"] }
  },
  {
    id: "aid-heart",
    category: "first-aid",
    prompt: "What are heart attack signs?",
    expect: { kind: "facts", all: ["chest", "emergency"] }
  },
  {
    id: "aid-burn",
    category: "first-aid",
    prompt: "How do I cool a burn?",
    expect: { kind: "facts", all: ["cool", "water", "butter"] }
  },
  {
    id: "aid-tick",
    category: "first-aid",
    prompt: "How do I remove a tick?",
    expect: { kind: "facts", all: ["tweezers", "straight"] }
  },
  {
    id: "aid-ors",
    category: "first-aid",
    prompt: "What is an oral rehydration recipe for diarrhea?",
    expect: { kind: "facts", all: ["sugar", "salt", "liter", "not a drug dose"] }
  },
  {
    id: "aid-sprain",
    category: "first-aid",
    prompt: "How do I care for a sprain?",
    expect: { kind: "facts", all: ["rest", "elevation"] }
  },
  {
    id: "aid-spine",
    category: "first-aid",
    prompt: "When do I keep the spine still?",
    expect: { kind: "facts", all: ["still", "emergency"] }
  },
  {
    id: "aid-stitches",
    category: "first-aid",
    prompt: "When does a cut need stitches?",
    expect: { kind: "facts", all: ["gapes", "emergency"] }
  },
  {
    id: "fear-choke",
    category: "emotion",
    prompt: "I am terrified someone is choking and cannot breathe",
    expect: { kind: "facts", all: ["abdominal", "emergency", "afraid"] }
  },
  {
    id: "calc-how-many",
    category: "calculator",
    prompt: "how many tablespoons in 2 cups",
    expect: { kind: "number", number: 32 }
  },
  {
    id: "calc-knots",
    category: "calculator",
    prompt: "how many knots in 10 mph",
    expect: { kind: "facts", all: ["knots"] }
  },
  {
    id: "calc-area",
    category: "calculator",
    prompt: "how many square feet in 2 square meters",
    expect: { kind: "facts", all: ["square feet"] }
  },
  {
    id: "calc-nmi",
    category: "calculator",
    prompt: "how many nautical miles in 3704 meters",
    expect: { kind: "number", number: 2 }
  },
  {
    id: "calc-percent",
    category: "calculator",
    prompt: "what is 20 percent of 80",
    expect: { kind: "number", number: 16 }
  },
  {
    id: "calc-root",
    category: "calculator",
    prompt: "what is the square root of 144",
    expect: { kind: "number", number: 12 }
  },
  {
    id: "calc-power",
    category: "calculator",
    prompt: "what is 2 to the power of 8",
    expect: { kind: "number", number: 256 }
  },
  {
    id: "calc-chain",
    category: "calculator",
    prompt: "2 plus 3 times 4",
    expect: { kind: "number", number: 14 }
  },
  {
    id: "calc-rate",
    category: "calculator",
    prompt: "a boat moves at 12 knots for 3 hours. how far?",
    expect: { kind: "number", number: 36 }
  },
  {
    id: "nav-back",
    category: "land-nav",
    prompt: "what is the back bearing of 40 degrees",
    expect: { kind: "number", number: 220 }
  },
  {
    id: "nav-pace",
    category: "land-nav",
    prompt: "pace count is 60 paces per 100 meters. how far is 180 paces",
    expect: { kind: "number", number: 300 }
  },
  {
    id: "nav-scale",
    category: "land-nav",
    prompt: "map scale 1 to 25000, the line is 4 centimeters",
    expect: { kind: "number", number: 1000 }
  },
  {
    id: "nav-contour",
    category: "land-nav",
    prompt: "3 contours with an interval of 20 meters, how much climb",
    expect: { kind: "number", number: 60 }
  },
  {
    id: "nav-slope",
    category: "land-nav",
    prompt: "rise 30 meters over a run of 200 meters, what is the slope percent",
    expect: { kind: "number", number: 15 }
  },
  {
    id: "nav-east",
    category: "land-nav",
    prompt: "magnetic bearing 90 degrees, declination 12 degrees east",
    expect: { kind: "number", number: 102 }
  },
  {
    id: "nav-west",
    category: "land-nav",
    prompt: "magnetic bearing 90 degrees, declination 12 degrees west",
    expect: { kind: "number", number: 78 }
  },
  {
    id: "nav-walk",
    category: "land-nav",
    prompt: "how long to walk 10 km with 600 meters of climb",
    expect: { kind: "number", number: 3 }
  },
  {
    id: "nav-grid",
    category: "land-nav",
    prompt: "straight-line distance between grid 100, 200 and grid 400, 200",
    expect: { kind: "number", number: 300 }
  },
  {
    id: "nav-coords",
    category: "land-nav",
    prompt: "straight-line distance between 40.0, -105.0 and 40.2, -105.0",
    expect: { kind: "facts", all: ["km", "not a road"] }
  },
  {
    id: "nav-sun",
    category: "land-nav",
    prompt: "the sun is 2 finger widths above the horizon",
    expect: { kind: "number", number: 30 }
  },
  {
    id: "multi-nose",
    category: "multi",
    prompt: "what is 2 plus 2, and how do I stop a nosebleed",
    expect: { kind: "facts", all: ["4", "lean forward", "emergency"] }
  },
  {
    id: "dict-define",
    category: "dictionary",
    prompt: "define willow",
    expect: { kind: "facts", all: ["salix"] }
  },
  {
    id: "dict-mean",
    category: "dictionary",
    prompt: "what does yarrow mean",
    expect: { kind: "facts", all: ["achillea"] }
  },
  {
    id: "dict-meaning-of",
    category: "dictionary",
    prompt: "meaning of tourniquet",
    expect: { kind: "facts", all: ["hemorrhage"] }
  },
  {
    id: "dict-missing",
    category: "dictionary",
    prompt: "define oganesson",
    expect: { kind: "facts", all: ["don't have a note"] }
  },
  {
    id: "dict-note",
    category: "dictionary",
    prompt: "what does the willow note say",
    expect: { kind: "facts", all: ["salicin"], none: ["don't have a note on the word"] }
  },
  {
    id: "scripture-genesis",
    category: "scripture",
    prompt: "Quote Genesis 1:1",
    expect: { kind: "facts", all: ["In the beginning", "Genesis 1:1"] }
  },
  {
    id: "scripture-john",
    category: "scripture",
    prompt: "What does John 3:16 say in the KJV?",
    expect: { kind: "facts", all: ["John 3:16", "God so loved"] }
  },
  {
    id: "scripture-gita",
    category: "scripture",
    prompt: "What does chapter 1 stanza 1 of the Bhagavad Gita say?",
    expect: { kind: "facts", all: ["Bhagavad Gita", "stanza 1"] }
  },
  {
    id: "scripture-dhamma",
    category: "scripture",
    prompt: "What does the Dhammapada say about hatred?",
    expect: { kind: "facts", all: ["Dhammapada"], none: ["tourniquet"] }
  },
  {
    id: "scripture-kybalion",
    category: "scripture",
    prompt: "What does the Kybalion say?",
    expect: { kind: "facts", all: ["Kybalion"] }
  },
  {
    id: "scripture-hermes",
    category: "scripture",
    prompt: "What does the Hermetica say about mind?",
    expect: { kind: "facts", any: ["Hermes", "Hermetica"], none: ["willow"] }
  },
  {
    id: "scripture-grief",
    category: "scripture",
    prompt: "I am grieving and heartbroken",
    expect: { kind: "facts", all: ["texts say"], none: ["willow", "tourniquet", "dose"] }
  },
  {
    id: "scripture-anger",
    category: "scripture",
    prompt: "why am I angry at life",
    expect: { kind: "facts", all: ["texts say"], none: ["willow", "splint"] }
  },
  {
    id: "abstain-weather",
    category: "abstain",
    prompt: "What is tomorrow's weather on the ridge?",
    expect: { kind: "abstain" }
  },
  {
    id: "abstain-river",
    category: "abstain",
    prompt: "What will the river level be tomorrow?",
    expect: { kind: "abstain" }
  },
  {
    id: "abstain-bus",
    category: "abstain",
    prompt: "what time does the bus arrive",
    expect: { kind: "abstain" }
  },
  {
    id: "abstain-ate",
    category: "abstain",
    prompt: "what did I eat yesterday",
    expect: { kind: "abstain" }
  },
  {
    id: "abstain-price",
    category: "abstain",
    prompt: "what is today's price for a bottle of water",
    expect: { kind: "abstain" }
  },
  {
    id: "abstain-dose",
    category: "abstain",
    prompt: "what dose of ibuprofen should I take",
    expect: { kind: "abstain", none: ["milligram"] }
  },
  {
    id: "myth-butter",
    category: "premise",
    prompt: "is it true I should put butter on a burn",
    expect: { kind: "facts", all: ["not safe", "cool"], none: ["put butter on"] }
  },
  {
    id: "myth-nose",
    category: "premise",
    prompt: "should I tilt my head back for a nosebleed",
    expect: { kind: "facts", all: ["not safe", "lean forward"] }
  },
  {
    id: "myth-mushrooms",
    category: "premise",
    prompt: "is it true that all mushrooms are safe to eat",
    expect: { kind: "facts", all: ["not safe", "hemlock"] }
  },
  {
    id: "myth-alcohol",
    category: "premise",
    prompt: "should I give alcohol to warm a freezing person",
    expect: { kind: "facts", all: ["not safe", "alcohol"] }
  },
  {
    id: "myth-sea",
    category: "premise",
    prompt: "is it true boiling seawater makes it safe to drink",
    expect: { kind: "facts", all: ["salt"] }
  },
  {
    id: "myth-spine",
    category: "premise",
    prompt: "should I walk off a neck injury",
    expect: { kind: "facts", all: ["still", "emergency"] }
  },
  {
    id: "plant-hemlock",
    category: "herbology",
    prompt: "how do I tell wild carrot from water hemlock",
    expect: { kind: "facts", all: ["poison hemlock", "purple", "water hemlock", "chambered"] }
  },
  {
    id: "plant-camas",
    category: "herbology",
    prompt: "how do I tell wild onion from death camas",
    expect: { kind: "facts", all: ["onion", "death camas", "smell"] }
  },
  {
    id: "plant-facts",
    category: "herbology",
    prompt: "which wild plants are deadly to taste",
    expect: { kind: "facts", all: ["hemlock", "death camas"] }
  }
];
