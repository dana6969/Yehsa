import fs from "fs";
import { quarantine } from "./quarantine.js";
import { inferAction } from "./symbolic_definition_mapper.js";

export const actionMap = {
  alchemical: "transmute_mind",
  glossology: "analyze_language_structure",
  dreamgate: "open_cosmic_portal",
  aviates: "initiate_flight_sequence",
  deductional: "reason_forward_chain",
  lived: "reflect_past_events"
};

export function mirror_reality() {
  const data = fs.readFileSync("symbolic_memory/trainer_learned.json", "utf-8");
  const learned = JSON.parse(data);
  console.log(`🪞 Mirror activated. ${learned.length} symbols in memory.`);
}

const builtinHandlers = {
  initiate_sequence() {
    console.log("🚀 Initiating symbolic sequence...");
  },
  light() {
    console.log("💡 Activating illumination...");
  },
  unlock() {
    console.log("🔓 Unlocking hidden memory...");
  },
  end() {
    console.log("🛑 Ending autonomy loop.");
    process.exit(0);
  },
  summarize_bhagavad_gita() {
    console.log("📖 Summarizing the Bhagavad Gita...");
  },
  summarize_druidry_handbook() {
    console.log("🌿 Extracting Druid wisdom...");
  },
  summarize_book_of_five_rings() {
    console.log("⚔️ Unlocking War Tactics from Five Rings...");
  },
  summarize_hermetica() {
    console.log("🧪 Translating Hermetic insights...");
  },
  summarize_kybalion() {
    console.log("⚖️ Applying Kybalion principles...");
  },
  summarize_tao_te_ching() {
    console.log("🌊 Interpreting Tao Te Ching wisdom...");
  },
  mirror_reality
};

export function executeSymbol(symbol) {
  const ts = new Date().toISOString();
  let action = actionMap[symbol];
  if (!action) {
    quarantine(symbol, "No mapped action");
    const inferred = inferAction(symbol);
    if (inferred) {
      console.log(`🧠 [Auto-Mapped] ${symbol} → ${inferred} @ ${ts}`);
      actionMap[symbol] = inferred;
      action = inferred;
    }
  }
  if (action) {
    console.log(`⚡ [EXEC] ${symbol} → ${action} @ ${ts}`);
  } else {
    console.warn(`🤔 [Unknown] ${symbol} — no mapped action @ ${ts}`);
  }
  return action;
}

/**
 * Restored entry used by symbolic_chain.js. The benchmark commit removed
 * execute(); later auto-mapping work did not put it back.
 * Named handlers from the pre-benchmark executor run directly. Everything else
 * goes through executeSymbol (quarantine + inference).
 */
export function execute(symbol) {
  if (typeof symbol !== "string" || !symbol.trim()) {
    console.warn("[⚠️ Skipped invalid symbol]", symbol);
    return null;
  }
  if (symbol === "mirror") {
    mirror_reality();
    return "mirror_reality";
  }
  const builtin = builtinHandlers[symbol];
  if (typeof builtin === "function") {
    builtin();
    return symbol;
  }
  const mapped = executeSymbol(symbol);
  if (typeof mapped === "string" && mapped !== symbol && typeof builtinHandlers[mapped] === "function") {
    builtinHandlers[mapped]();
  }
  return mapped ?? null;
}

/**
 * Wrapper expected by symbolic_live_loop.js and symbolic/exec_test.js.
 * No argument runs the built-in handlers except "end" (which exits the process).
 */
export function executeActions(symbolOrList) {
  if (symbolOrList == null) {
    const names = Object.keys(builtinHandlers).filter((name) => name !== "end");
    for (const name of names) builtinHandlers[name]();
    return names;
  }
  const list = Array.isArray(symbolOrList) ? symbolOrList : [symbolOrList];
  return list.map((symbol) => execute(symbol));
}

export function getDefinitions(symbol) {
  return actionMap[symbol] || null;
}
