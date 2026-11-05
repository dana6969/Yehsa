import { recordTraining } from "./record.js";

export function trainFeedback(input) {
  return recordTraining("feedback", input);
}
