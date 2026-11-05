import { resolveMultiPath } from "../core/trainers/multi_path_resolver.js";
import { writeToSymbolicMemory } from "../memory/memory_writer.js";

export function symbolicDispatcher(input) {
  const safe = input && typeof input === "object" ? input : {};
  const options = Array.isArray(safe.options) ? safe.options : [];
  const resolved = resolveMultiPath({ ...safe, options });
  const paths = Array.isArray(resolved?.paths) ? resolved.paths : [];
  const best = paths.find((p) => p && p.trigger === true);
  writeToSymbolicMemory({
    from: "symbolic_dispatcher",
    resolved: best ?? null,
    timestamp: new Date().toISOString()
  });
  if (!best || typeof best.symbol === "undefined") {
    return "❓ No triggered symbol";
  }
  switch (best.symbol) {
    case "A":
      return "🧠 Symbol A triggered → run perception logic";
    case "B":
      return "🧠 Symbol B triggered → run emotional memory check";
    case "C":
      return "🧠 Symbol C triggered → activate goal-seeking loop";
    default:
      return "❓ Unknown symbol triggered";
  }
}
