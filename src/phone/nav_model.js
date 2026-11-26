// Navigation model for the Yehsa phone shell.
// Pure JavaScript with no React Native imports, so node tests can load it.
// The shell keeps its custom tab host. This adds a small screen stack, an
// emergency overlay flag, and one place that decides what the back key does.
// None of this is on the knowledge path (getMappedAction never loads it).

export const TAB_IDS = ["ask", "map", "field", "people"];

export const TABS = [
  { id: "ask", label: "Ask", icon: "chatbubble-ellipses" },
  { id: "map", label: "Map", icon: "map" },
  { id: "field", label: "Field", icon: "compass" },
  { id: "people", label: "People", icon: "people" }
];

// Screens that open on top of the tabs from the header gear.
export const MORE_ITEMS = [
  { id: "display", label: "Display", hint: "Field, Sunlight, Night · Red or Amber" },
  { id: "privacy", label: "Privacy", hint: "Nothing leaves the phone unless you approve" },
  { id: "helpers", label: "Helpers", hint: "Each helper has a visible off-switch" },
  { id: "actions", label: "What I may do", hint: "Permission toggles" },
  { id: "did", label: "What Yehsa did", hint: "Action log and undo" },
  { id: "family", label: "Family card", hint: "ICE contacts and medicines, also in Kit" },
  { id: "location", label: "Location and consent", hint: "Off until you turn it on" },
  { id: "models", label: "Models", hint: "Optional. Off by default" },
  { id: "learned", label: "Learned notes", hint: "Kept on this phone" },
  { id: "library", label: "Library", hint: "Books and texts on this phone" },
  { id: "downloads", label: "Downloaded books", hint: "Sizes on this phone; remove to free space" },
  { id: "keys", label: "Chat keys", hint: "Your key fingerprint and resets" },
  { id: "satsos", label: "Satellite SOS", hint: "How your phone's own satellite SOS works" },
  { id: "hotspot", label: "Hotspot and mesh", hint: "Sharing a connection, and what the mesh does offline" },
  { id: "trust", label: "No-account pledge", hint: "What Yehsa never collects" },
  { id: "about", label: "About", hint: "Trust pledge and 411-question test" }
];

export const SCREEN_TITLES = {
  more: "More",
  display: "Display",
  privacy: "Privacy",
  helpers: "Helpers",
  actions: "What I may do",
  did: "What Yehsa did",
  family: "Family card",
  location: "Location",
  models: "Models",
  learned: "Learned notes",
  library: "Library",
  downloads: "Downloaded books",
  keys: "Chat keys",
  satsos: "Satellite SOS",
  hotspot: "Hotspot and mesh",
  trust: "Trust",
  about: "About"
};

export const STACK_SCREENS = Object.keys(SCREEN_TITLES);

export function initialNav() {
  return { tab: "ask", stack: [], sos: false, command: false };
}

export function topScreen(state) {
  const stack = state?.stack || [];
  return stack.length ? stack[stack.length - 1] : null;
}

// The label a Back control shows: the screen you return to.
export function backLabel(state, tabs = TABS) {
  const stack = state?.stack || [];
  if (stack.length > 1) return SCREEN_TITLES[stack[stack.length - 2]] || "Back";
  const tab = tabs.find((item) => item.id === state?.tab);
  return tab ? tab.label : "Back";
}

export function navReduce(state, action) {
  const current = state || initialNav();
  switch (action?.type) {
    case "tab": {
      if (typeof action.tab !== "string" || !action.tab) return current;
      return { ...current, tab: action.tab, stack: [], command: false };
    }
    case "push": {
      if (!STACK_SCREENS.includes(action.screen)) return current;
      if (topScreen(current) === action.screen) return current;
      // More always starts its own stack. Other screens stack on top of what is open.
      const stack = action.screen === "more" ? ["more"] : [...current.stack.filter((id) => id !== action.screen), action.screen];
      return { ...current, stack, command: false };
    }
    case "pop":
      return { ...current, stack: current.stack.slice(0, -1) };
    case "closeStack":
      return { ...current, stack: [] };
    case "openSos":
      // The overlay sits above everything. The screen underneath stays as it was.
      return { ...current, sos: true, command: false };
    case "closeSos":
      return { ...current, sos: false };
    case "openCommand":
      return current.sos ? current : { ...current, command: true };
    case "closeCommand":
      return { ...current, command: false };
    default:
      return current;
  }
}

// What the Android back key does, in order. A screen-level layer (an open
// sheet or subview) gets the key first through the shell's layer list; this
// is what happens when no layer took it.
export function backAction(state) {
  const current = state || initialNav();
  if (current.sos) return { handled: true, state: navReduce(current, { type: "closeSos" }) };
  if (current.command) return { handled: true, state: navReduce(current, { type: "closeCommand" }) };
  if (current.stack.length) return { handled: true, state: navReduce(current, { type: "pop" }) };
  if (current.tab !== (current.home || "ask")) return { handled: true, state: navReduce(current, { type: "tab", tab: current.home || "ask" }) };
  return { handled: false, state: current };
}

// Last-in, first-out handlers registered by open sheets and subviews.
export function createBackLayers() {
  const layers = [];
  return {
    push(handler) {
      layers.push(handler);
      return () => {
        const index = layers.lastIndexOf(handler);
        if (index >= 0) layers.splice(index, 1);
      };
    },
    run() {
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        if (layers[index]() === true) return true;
      }
      return false;
    },
    size() {
      return layers.length;
    }
  };
}

// "Ask or go" destinations. Words are what a person might type.
export const DESTINATIONS = [
  { id: "ask", label: "Ask", kind: "tab", words: "ask chat question yehsa talk" },
  { id: "map", label: "Map", kind: "tab", words: "map gps waypoint track land terrain" },
  { id: "layers", label: "Map layers and packs", kind: "tab", target: "map", words: "layers packs elevation import declination download offline" },
  { id: "hunt", label: "Hunt view on the map", kind: "tab", target: "map", words: "hunt hunting hud legal light wind deer" },
  { id: "field", label: "Field tools", kind: "tab", words: "field tools" },
  { id: "pictures", label: "Pictures", kind: "tab", target: "field", tile: "pictures", words: "pictures picture guide plants knots photos images" },
  { id: "compass", label: "Compass", kind: "tab", target: "field", tile: "compass", words: "compass bearing course distance declination" },
  { id: "sun", label: "Sun times", kind: "tab", target: "field", tile: "sun", words: "sun sunrise sunset daylight" },
  { id: "morse", label: "Morse", kind: "tab", target: "field", tile: "morse", words: "morse code signal" },
  { id: "timers", label: "Timers", kind: "tab", target: "field", tile: "timers", words: "timer countdown clock" },
  { id: "calculator", label: "Calculator", kind: "tab", target: "field", tile: "calculator", words: "calculator math units convert" },
  { id: "before", label: "Before you go", kind: "tab", target: "field", tile: "before", words: "before trip plan checklist" },
  { id: "first-aid", label: "First-aid pictures", kind: "tab", target: "field", tile: "first-aid", words: "first aid splint burn" },
  { id: "people", label: "People", kind: "tab", words: "people contacts chat friends message party" },
  { id: "scan", label: "Scan and radio", kind: "tab", target: "people", words: "scan radio mesh bluetooth peers pair" },
  { id: "sos", label: "Emergency", kind: "sos", words: "sos emergency help 911 112 cpr bleeding satellite" },
  { id: "display", label: "Display", kind: "screen", words: "display night sunlight red amber text size contrast dark mode" },
  { id: "privacy", label: "Privacy", kind: "screen", words: "privacy data share upload" },
  { id: "helpers", label: "Helpers", kind: "screen", words: "helpers voice microphone radio off switch" },
  { id: "location", label: "Location and consent", kind: "screen", words: "location position consent gps lock share coordinates" },
  { id: "actions", label: "What I may do", kind: "screen", words: "actions settings permissions allow" },
  { id: "did", label: "What Yehsa did", kind: "screen", words: "log undo history did" },
  { id: "models", label: "Models", kind: "screen", words: "models model ai provider key" },
  { id: "learned", label: "Learned notes", kind: "screen", words: "learned notes memory" },
  { id: "library", label: "Library", kind: "screen", words: "library books scripture bible texts" },
  { id: "downloads", label: "Downloaded books", kind: "screen", words: "downloaded downloads books documents remove delete undownload storage space free" },
  { id: "keys", label: "Chat keys", kind: "screen", words: "keys chat keys fingerprint security" },
  { id: "family", label: "Family card", kind: "screen", words: "family card contacts medical" },
  { id: "satsos", label: "Satellite SOS guide", kind: "screen", words: "satellite sos iphone pixel messages no signal" },
  { id: "hotspot", label: "Hotspot and mesh", kind: "screen", words: "hotspot wifi tether share network" },
  { id: "trust", label: "No-account pledge", kind: "screen", words: "pledge account privacy data collect trust" },
  { id: "identify", label: "Identify a plant from a photo", kind: "tab", target: "field", tile: "identify", words: "identify camera photo plant id" },
  { id: "about", label: "About", kind: "screen", words: "about trust pledge test" }
];

export function filterDestinations(query, limit = 6) {
  const text = String(query || "").toLowerCase().trim();
  if (!text) return DESTINATIONS.slice(0, limit);
  const parts = text.split(/\s+/).filter(Boolean);
  const scored = DESTINATIONS.map((item) => {
    const hay = `${item.label.toLowerCase()} ${item.words}`;
    let score = 0;
    for (const part of parts) {
      if (item.label.toLowerCase().startsWith(part)) score += 3;
      else if (hay.split(/\s+/).some((word) => word.startsWith(part))) score += 2;
    }
    return { item, score };
  }).filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.item);
}

// A destination becomes one or two shell actions.
export function destinationActions(destination) {
  if (!destination) return [];
  if (destination.kind === "sos") return [{ type: "openSos" }];
  if (destination.kind === "screen") return [{ type: "push", screen: destination.id }];
  return [{ type: "tab", tab: destination.target || destination.id }];
}

// Text that reads like a question goes to Ask instead of a destination.
export function looksLikeQuestion(query) {
  const text = String(query || "").trim();
  if (!text) return false;
  if (/\?$/.test(text)) return true;
  if (text.split(/\s+/).length >= 3) return true;
  return /^(how|what|why|when|where|which|who|can|should|is|are|do|does)\b/i.test(text);
}
