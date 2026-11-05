import { recordTraining } from "./record.js";

export function trainEventLink(input) {
  return recordTraining("event_link", input);
}
