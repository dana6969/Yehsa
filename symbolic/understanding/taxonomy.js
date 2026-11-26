// What a question is about: the thing (a species or item) and the group it belongs to.
// Pure data. Used by understand() and by the entry profiles, so a question and a note are read
// with the same words. Not on the getMappedAction hot path.

// group -> parent group. "game" is the top for every hunted or caught animal.
export const GROUP_PARENT = {
  upland_bird: "bird", waterfowl: "bird", turkey: "bird", bird: "game",
  big_game: "mammal", small_game: "mammal", furbearer: "mammal", mammal: "game",
  fish: "game", game: null, domestic: null
};

// Kinds keep follow-ups on the same sort of animal: never venison after birds.
export const GROUP_KIND = {
  upland_bird: "bird", waterfowl: "bird", turkey: "bird", bird: "bird",
  big_game: "mammal", small_game: "mammal", furbearer: "mammal", mammal: "mammal", fish: "fish", game: null, domestic: "domestic"
};

export const GROUP_NOUN = {
  upland_bird: "upland birds", waterfowl: "ducks and geese", turkey: "turkeys", bird: "game birds",
  big_game: "big game", small_game: "small game", furbearer: "furbearers", mammal: "game animals", fish: "fish", game: "wild game"
};

// entity -> { group, names (lower case, longest first is not required), label, also? }
// `also` is the one line said when the note covers the thing through its group.
export const ENTITIES = {
  partridge: { group: "upland_bird", label: "Partridge", also: "gray or Hungarian partridge, chukar, and the New England partridge, which is the ruffed grouse", names: ["partridge", "partridges", "pa'tridge", "hungarian partridge", "gray partridge", "grey partridge", "hun", "huns", "chukar", "chukars", "chukar partridge", "red-legged partridge"] },
  grouse: { group: "upland_bird", label: "Grouse", names: ["grouse", "ruffed grouse", "spruce grouse", "sharp-tailed grouse", "sharptail", "sharptails", "sage grouse", "blue grouse", "dusky grouse", "prairie chicken", "prairie chickens"] },
  ptarmigan: { group: "upland_bird", label: "Ptarmigan", like: "grouse", names: ["ptarmigan", "ptarmigans", "willow ptarmigan"] },
  pheasant: { group: "upland_bird", label: "Pheasant", names: ["pheasant", "pheasants", "ringneck", "ringnecks", "ring-necked pheasant", "rooster pheasant"] },
  quail: { group: "upland_bird", label: "Quail", names: ["quail", "quails", "bobwhite", "bobwhites", "bobwhite quail", "california quail", "gambel's quail"] },
  woodcock: { group: "upland_bird", label: "Woodcock", like: "grouse", names: ["woodcock", "woodcocks", "timberdoodle", "timberdoodles", "snipe"] },
  dove: { group: "upland_bird", label: "Dove", like: "quail", names: ["dove", "doves", "mourning dove", "mourning doves", "pigeon", "pigeons"] },
  upland_bird: { group: "upland_bird", label: "Upland birds", names: ["upland bird", "upland birds", "upland game bird", "upland game birds", "upland game"] },
  turkey: { group: "turkey", label: "Turkey", names: ["turkey", "turkeys", "wild turkey", "wild turkeys", "gobbler", "gobblers", "tom turkey", "jake"] },
  duck: { group: "waterfowl", label: "Duck", names: ["duck", "ducks", "mallard", "mallards", "teal", "wood duck", "wood ducks", "pintail", "pintails", "canvasback", "merganser", "mergansers", "wigeon", "gadwall", "black duck", "bufflehead", "scaup", "coot", "coots"] },
  goose: { group: "waterfowl", label: "Goose", names: ["goose", "geese", "canada goose", "canada geese", "snow goose", "snow geese", "honker", "honkers", "brant", "specklebelly"] },
  waterfowl: { group: "waterfowl", label: "Waterfowl", names: ["waterfowl", "ducks and geese", "duck and goose"] },
  bird: { group: "bird", label: "Birds", names: ["bird", "birds", "game bird", "game birds", "gamebird", "gamebirds", "fowl", "wild bird", "wild birds", "wildfowl"] },
  deer: { group: "big_game", label: "Deer", names: ["deer", "whitetail", "whitetails", "white-tailed deer", "whitetail deer", "white tail", "mule deer", "muley", "blacktail", "black-tailed deer", "buck", "bucks", "doe", "venison"] },
  elk: { group: "big_game", label: "Elk", names: ["elk", "wapiti", "bull elk", "cow elk"] },
  moose: { group: "big_game", label: "Moose", names: ["moose", "bull moose", "cow moose"] },
  caribou: { group: "big_game", label: "Caribou", like: "deer", names: ["caribou", "reindeer"] },
  pronghorn: { group: "big_game", label: "Pronghorn", names: ["pronghorn", "pronghorns", "antelope", "antelopes"] },
  bear: { group: "big_game", label: "Bear", names: ["bear", "bears", "black bear", "black bears", "bear meat"] },
  hog: { group: "big_game", label: "Wild hog", names: ["hog", "hogs", "wild hog", "wild hogs", "feral hog", "feral hogs", "wild boar", "wild boars", "boar", "boars", "feral pig", "feral pigs", "wild pig", "wild pigs"] },
  big_game: { group: "big_game", label: "Big game", names: ["big game"] },
  rabbit: { group: "small_game", label: "Rabbit", names: ["rabbit", "rabbits", "hare", "hares", "cottontail", "cottontails", "snowshoe hare", "snowshoe hares", "snowshoe", "jackrabbit", "jackrabbits", "bunny"] },
  squirrel: { group: "small_game", label: "Squirrel", names: ["squirrel", "squirrels", "gray squirrel", "grey squirrel", "gray squirrels", "fox squirrel", "fox squirrels", "red squirrel", "red squirrels"] },
  small_game: { group: "small_game", label: "Small game", names: ["small game"] },
  fish: { group: "fish", label: "Fish", names: ["fish", "fishes", "trout", "brook trout", "brookie", "brookies", "rainbow trout", "brown trout", "lake trout", "bass", "largemouth", "smallmouth", "striper", "striped bass", "perch", "yellow perch", "pike", "northern pike", "pickerel", "walleye", "walleyes", "salmon", "catfish", "bluegill", "bluegills", "sunfish", "crappie", "crappies", "panfish", "carp", "smelt", "shad", "muskie", "bullhead", "cod", "mackerel", "flounder", "fillet"] },
  game: { group: "game", label: "Wild game", names: ["wild game", "game meat", "game"] },
  coyote: { group: "furbearer", label: "Coyote", names: ["coyote", "coyotes", "coywolf", "eastern coyote"] },
  fox: { group: "furbearer", label: "Fox", names: ["fox", "foxes", "red fox", "gray fox"] },
  raccoon: { group: "furbearer", label: "Raccoon", names: ["raccoon", "raccoons", "coon", "coons"] },
  bobcat: { group: "furbearer", label: "Bobcat", names: ["bobcat", "bobcats", "lynx", "wildcat"] },
  beaver: { group: "furbearer", label: "Beaver", names: ["beaver", "beavers"] },
  porcupine: { group: "furbearer", label: "Porcupine", names: ["porcupine", "porcupines", "porky"] },
  skunk: { group: "furbearer", label: "Skunk", names: ["skunk", "skunks", "striped skunk"] },
  // Farm meat, so "what temperature should chicken be cooked to" finds the kitchen table, not the game one.
  domestic: { group: "domestic", label: "Meat", names: ["chicken", "poultry", "pork", "beef", "hamburger", "ground beef", "burger", "burgers", "lamb", "leftovers", "eggs", "egg dishes"] }
};

const NAME_TO_ENTITY = (() => {
  const map = new Map();
  for (const [id, e] of Object.entries(ENTITIES)) for (const name of e.names) if (!map.has(name)) map.set(name, id);
  return map;
})();
const MAX_NAME_WORDS = 3;

function words(text) {
  return String(text || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' -]+/g, " ").split(/\s+/).filter(Boolean);
}

/** Every thing named in the text, longest name first, with where it starts: [{ entity, name, at }]. */
export function entitiesIn(text) {
  const list = words(text);
  const found = [];
  const used = new Set();
  for (let size = MAX_NAME_WORDS; size >= 1; size -= 1) {
    for (let i = 0; i + size <= list.length; i += 1) {
      if ([...Array(size).keys()].some((k) => used.has(i + k))) continue;
      const name = list.slice(i, i + size).join(" ");
      // A plain plural the list does not spell out ("teals", "chukars") is the same thing.
      const entity = NAME_TO_ENTITY.get(name) || (name.length > 4 ? NAME_TO_ENTITY.get(name.replace(/(?:es|s)$/, "")) || NAME_TO_ENTITY.get(name.replace(/s$/, "")) : null);
      if (!entity) continue;
      for (let k = 0; k < size; k += 1) used.add(i + k);
      found.push({ entity, name, at: i });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

export function groupOf(entity) {
  return ENTITIES[entity]?.group || null;
}

/** The group and every group above it: upland_bird -> [upland_bird, bird, game]. */
export function lineage(group) {
  const out = [];
  let g = group;
  while (g) {
    out.push(g);
    g = GROUP_PARENT[g] ?? null;
  }
  return out;
}

export function kindOf(group) {
  return group ? GROUP_KIND[group] ?? null : null;
}
