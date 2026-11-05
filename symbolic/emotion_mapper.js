import { rememberEmotion } from "./runtime_store.js";
import { emotionSubjects, readEmotion } from "./emotion_read.js";

export { emotionSubjects };

export function mapEmotion(input) {
  return rememberEmotion(readEmotion(input));
}
