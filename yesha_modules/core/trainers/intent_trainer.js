import { recordTraining } from "./record.js";

export function trainIntent(input) {
  return recordTraining("intent", input);
}
