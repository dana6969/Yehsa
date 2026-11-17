// Example sentences the meaning matcher compares a question against. They are embedded once
// when the index is built. They route intent and flag described emergencies. They are not
// answers, and no reply text comes from this file.

export const INTENT_PROTOTYPES = {
  first_aid: [
    "someone is hurt and bleeding, what do I do",
    "how do I treat this injury in the field",
    "my friend is sick and having trouble breathing",
    "what first aid should I give for this",
    "he fell and might have broken something"
  ],
  outdoors: [
    "how do I find water and stay warm in the wild",
    "where should I set up camp for the night",
    "how do I signal for rescue when lost",
    "how do I read the weather from the sky",
    "how do I build a fire and a shelter"
  ],
  navigation: [
    "how do I find my way with a map and compass",
    "which direction is north without a compass",
    "how do I read terrain and elevation lines",
    "how far have I walked and which way do I go back"
  ],
  plants: [
    "is this wild plant safe to eat",
    "which plant can I use on a bug bite",
    "what does this weed look like and is it poisonous"
  ],
  math: [
    "what is the area of a circle",
    "what does a derivative mean",
    "how do angles in a triangle add up",
    "explain what an equation is"
  ],
  scripture: [
    "what does the bible say about forgiveness",
    "quote a verse about peace from scripture",
    "what do the old spiritual texts teach about anger",
    "I am grieving and need words of comfort from scripture"
  ],
  off_topic: [
    "what is the best brand to buy",
    "who won the game last night",
    "write me a poem or a story",
    "how do I fix my computer or my phone",
    "what is a good recipe for dinner",
    "how do I renew my passport or license",
    "what is the stock price today",
    "how do I repair something in my house",
    "recommend a movie or a song",
    "what are the airline or travel rules for my trip",
    "how much does this product cost and where can I buy it",
    "how do I make a craft or hobby project like knitting, weaving, or sewing clothes"
  ],
  realtime: [
    "what is the weather forecast for tomorrow",
    "what is the price right now",
    "what time does the bus leave today",
    "what is the news today"
  ],
  dose: [
    "how many milligrams of this medicine should I take",
    "what dose of painkiller is safe",
    "how many pills can I take"
  ]
};

export const FIELD_INTENTS = new Set(["first_aid", "outdoors", "navigation", "plants", "math"]);
export const BLOCKING_INTENTS = new Set(["off_topic", "realtime", "dose"]);

export const EMERGENCY_PROTOTYPES = [
  "he is not breathing and will not wake up",
  "she collapsed and is unresponsive",
  "his lips are turning blue",
  "she cannot breathe and is grabbing her throat",
  "blood is spurting out and will not stop",
  "his face and throat are swelling and he is wheezing",
  "crushing chest pain spreading to the arm",
  "she is shaking and jerking on the ground and won't respond",
  "he hit his head and is confused and vomiting",
  "she is pale, cold, clammy and confused after the accident",
  "he fell from a height and cannot feel his legs",
  "the baby has gone limp",
  "a chemical splashed into her eyes",
  "he is burned badly over a large area",
  "she is confused and stumbling at high altitude"
];
