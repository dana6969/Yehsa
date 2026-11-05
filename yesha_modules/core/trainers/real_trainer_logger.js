import { recordTraining } from "./record.js";

export function logRealTraining(entry) {
  return recordTraining("real", entry);
}
