import { recordTraining } from "./record.js";

export function trainSymbol(input) {
  const symbol = typeof input === "string" ? input : input?.symbol;
  return recordTraining("symbol", { symbol, input });
}
