// Fail when correct falls below the known-good count, or any incorrect-confident answer appears.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tallyOutcomes } from "./score.mjs";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(EVAL_DIR, "baseline_breakdown.json");

export function enforceBaseline(breakdown, baseline = readBaseline()) {
  const errors = [];
  if (!breakdown || breakdown.total !== baseline.questionCount) {
    errors.push(`outcome total ${breakdown?.total} does not equal ${baseline.questionCount}`);
  }
  const parts = (breakdown?.correct || 0) + (breakdown?.incorrect || 0) + (breakdown?.refusals || 0);
  if (breakdown && parts !== breakdown.total) {
    errors.push(`correct + incorrect + refusals = ${parts}, not ${breakdown.total}`);
  }
  if ((breakdown?.incorrectConfident || 0) > 0) {
    errors.push(`incorrect-confident is ${breakdown.incorrectConfident}, above 0`);
  }
  if ((breakdown?.correct || 0) < baseline.correct) {
    errors.push(`correct dropped from ${baseline.correct} to ${breakdown.correct}`);
  }
  if (errors.length) {
    console.error(errors.join("\n"));
    return false;
  }
  console.error(`eval gate passed: correct ${breakdown.correct}, incorrect-confident ${breakdown.incorrectConfident}, total ${breakdown.total}`);
  return true;
}

export function readBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

if (process.argv[1] && process.argv[1].endsWith("gate.mjs")) {
  const results = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, "results.json"), "utf8"));
  const breakdown = results.breakdown || tallyOutcomes(results.long.items);
  if (!enforceBaseline(breakdown)) process.exit(1);
}
