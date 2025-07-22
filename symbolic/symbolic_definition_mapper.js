import fs from "fs";

const dictPath = "symbolic_memory/full_dictionary.json";
const evoMapPath = "symbolic_memory/evolution_map.json";
const dictionary = fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath, "utf8")) : {};
const evolutionMap = fs.existsSync(evoMapPath) ? JSON.parse(fs.readFileSync(evoMapPath, "utf8")) : {};

const keywordActions = {
  "open": "open_link",
  "reflect": "reflect_past_events",
  "absorb": "absorb_knowledge",
  "launch": "initiate_flight_sequence",
  "analyze": "analyze_language_structure",
  "store": "storeMemoryEntry",
  "fetch": "fetchMemoryEntry",
  "learn": "addToLearningQueue",
  "dream": "initiateDreamLogic",
  "invoke": "initiate_ritual_action",
  "transmute": "transmute_mind",
  "reason": "reason_forward_chain",
  "navigate": "activate_guidance_system",
  "link": "establish_connection",
  "activate": "trigger_event_response"
};

export function inferAction(symbol) {
  const ts = new Date().toISOString();
  if (evolutionMap[symbol]) {
    console.log(`🧬 [Mapped via Evolution] ${symbol} → ${evolutionMap[symbol]} @ ${ts}`);
    return evolutionMap[symbol];
  }

  const raw = dictionary[symbol];
  const def = raw?.definition?.toLowerCase?.() || raw?.context?.toLowerCase?.() || "";

  for (const [key, action] of Object.entries(keywordActions)) {
    if (def.includes(key)) {
      console.log(`🧠 [Inferred] ${symbol} → ${action} (matched: "${key}") @ ${ts}`);
      return action;
    }
  }

  console.warn(`🤔 [Unmapped] ${symbol} — no keyword match in definition @ ${ts}`);
  return null;
}
