import path from "path";
import { pathToFileURL } from "url";

export function isDirectRun(metaUrl) {
  if (!process.argv[1]) return false;
  return metaUrl === pathToFileURL(path.resolve(process.argv[1])).href;
}
