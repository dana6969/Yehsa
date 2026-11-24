// Known pages on the allowlisted government sites, by topic. Look it up reads only these, plus a page
// the person names. Agencies have no keyless search we can call from a phone, so this list is the map.
// A page that has moved just gives no answer; it never sends the person anywhere else.

import { textHasToken } from "../book_search.js";
import { questionGroups } from "./answer_builder.js";

export const GOV_PAGES = [
  { source: "cdc", url: "https://www.cdc.gov/ticks/prevention/index.html", topics: ["tick", "ticks", "lyme", "permethrin", "repellent", "deet"] },
  { source: "cdc", url: "https://www.cdc.gov/lyme/about/index.html", topics: ["lyme", "tick", "bullseye", "rash"] },
  { source: "cdc", url: "https://www.cdc.gov/rabies/about/index.html", topics: ["rabies", "rabid", "bat", "bats", "raccoon", "skunk", "fox", "bite", "scratch"] },
  { source: "cdc", url: "https://www.cdc.gov/chronic-wasting/about/index.html", topics: ["cwd", "chronic", "wasting", "prion", "deer", "venison", "field-dressing", "dressing", "scat", "feces"] },
  { source: "cdc", url: "https://www.cdc.gov/giardia/about/index.html", topics: ["giardia", "diarrhea", "water", "boil", "filter", "stream", "lake", "poop", "feces"] },
  { source: "cdc", url: "https://www.cdc.gov/niosh/outdoor-workers/about/venomous-snakes.html", topics: ["snake", "snakebite", "rattlesnake", "copperhead", "cottonmouth", "moccasin", "coral", "venom", "venomous"] },
  { source: "cdc", url: "https://www.cdc.gov/hantavirus/about/index.html", topics: ["hantavirus", "mouse", "mice", "rodent", "droppings", "cabin"] },
  { source: "nws", url: "https://www.weather.gov/safety/lightning", topics: ["lightning", "thunder", "thunderstorm", "storm"] },
  { source: "nws", url: "https://www.weather.gov/safety/cold", topics: ["cold", "hypothermia", "frostbite", "wind chill", "windchill", "winter"] },
  { source: "nws", url: "https://www.weather.gov/safety/heat", topics: ["heat", "heatstroke", "hot", "exhaustion", "humidity"] },
  { source: "nws", url: "https://www.weather.gov/safety/flood", topics: ["flood", "flash", "flooding", "river", "crossing"] },
  { source: "nws", url: "https://www.weather.gov/safety/wind", topics: ["wind", "gust", "windy", "blowdown"] },
  { source: "usfws", url: "https://www.fws.gov/species/white-tailed-deer-odocoileus-virginianus", topics: ["deer", "whitetail", "white-tailed", "buck", "doe", "fawn", "antler", "rut"] },
  { source: "nps", url: "https://www.nps.gov/subjects/bears/safety.htm", topics: ["bear", "bears", "grizzly", "spray", "attack"] },
  { source: "nps", url: "https://www.nps.gov/articles/leave-no-trace-seven-principles.htm", topics: ["leave", "trace", "waste", "camp", "campsite", "poop", "cathole"] },
  { source: "usfs", url: "https://www.fs.usda.gov/visit/know-before-you-go/bears", topics: ["bear", "bears", "food", "storage", "canister"] },
  { source: "usfs", url: "https://www.fs.usda.gov/visit/know-before-you-go/hunting", topics: ["hunt", "hunting", "hunter", "orange", "season", "deer", "elk"] }
];

/** Up to `limit` pages whose topics share a word with the question, best first. */
export function pagesFor(question, limit = 2) {
  const tokens = questionGroups(question);
  if (tokens.length === 0) return [];
  return GOV_PAGES
    .map((page, order) => {
      let score = 0;
      for (const group of tokens) {
        if (group.some((token) => page.topics.some((topic) => textHasToken(topic, token)))) score += 1;
      }
      return { page, score, order };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.page);
}
