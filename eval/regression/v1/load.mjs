// Load the frozen v1 suite. Scoring uses this file, not a regenerated question list.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

export function loadRegressionV1() {
  const questionsPath = path.join(DIR, "questions.json");
  const manifestPath = path.join(DIR, "manifest.json");
  const thresholdsPath = path.join(DIR, "thresholds.json");
  const questionsBytes = fs.readFileSync(questionsPath);
  const thresholdsBytes = fs.readFileSync(thresholdsPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const questionsHash = crypto.createHash("sha256").update(questionsBytes).digest("hex");
  const thresholdsHash = crypto.createHash("sha256").update(thresholdsBytes).digest("hex");
  if (questionsHash !== manifest.files["questions.json"]) {
    throw new Error("v1 questions.json does not match the SHA-256 manifest");
  }
  if (thresholdsHash !== manifest.files["thresholds.json"]) {
    throw new Error("v1 thresholds.json does not match the SHA-256 manifest");
  }
  const questions = JSON.parse(questionsBytes.toString("utf8"));
  if (!Array.isArray(questions) || questions.length !== manifest.questionCount) {
    throw new Error(`v1 question count ${questions?.length} does not match the manifest`);
  }
  const ids = questions.map((question) => question.id);
  if (new Set(ids).size !== ids.length) throw new Error("v1 has a duplicate question id");
  const missing = manifest.ids.filter((id) => !ids.includes(id));
  const extra = ids.filter((id) => !manifest.ids.includes(id));
  if (missing.length) throw new Error(`v1 removed questions: ${missing.join(", ")}`);
  if (extra.length) throw new Error(`v1 added questions outside the manifest: ${extra.join(", ")}`);
  return { questions, manifest, thresholds: JSON.parse(thresholdsBytes.toString("utf8")) };
}
