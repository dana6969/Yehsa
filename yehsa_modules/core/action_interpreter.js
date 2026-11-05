/**
 * Compatibility shim for mesh_transmitter.
 * Dispatch itself lives in yesha_modules/core/symbolic_dispatcher.js.
 * A relay payload is returned only when that dispatcher reports a concrete symbol.
 */
import { symbolicDispatcher } from "../../yesha_modules/core/symbolic_dispatcher.js";

export function parseSymbolAction(symbols, context) {
  const options = Array.isArray(symbols) ? symbols : symbols == null ? [] : [symbols];
  const decision = symbolicDispatcher({ symbols, context, options });
  if (typeof decision !== "string" || decision.startsWith("❓")) return null;
  return {
    type: "relay",
    payload: { symbols, context, decision }
  };
}
