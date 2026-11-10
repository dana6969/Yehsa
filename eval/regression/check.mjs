// Fail when frozen v1 changes without a new version folder, or when a question disappears.
import { spawnSync } from "node:child_process";
import path from "path";
import { fileURLToPath } from "url";
import { loadRegressionV1 } from "./v1/load.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function regressionErrors({ v1Changed, newVersionAdded, removedIds }) {
  const errors = [];
  if (removedIds?.length) errors.push(`v1 questions removed: ${removedIds.join(", ")}`);
  if (v1Changed && !newVersionAdded) {
    errors.push("eval/regression/v1 changed without a new version folder");
  }
  return errors;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}

function isHigherVersion(name) {
  return /^eval\/regression\/v([2-9]|[1-9][0-9]+)\//.test(name);
}

export function diffAgainstBase(base) {
  if (!base || /^0+$/.test(base)) return { skipped: true, errors: [] };
  if (git(["rev-parse", "--verify", `${base}^{commit}`]) == null) return { skipped: true, errors: [] };
  const names = git(["diff", "--name-only", `${base}^{commit}`, "HEAD", "--", "eval/regression"]);
  if (names == null) return { skipped: true, errors: [] };
  const changed = names.split("\n").filter(Boolean);
  const baseHasV1 = git(["cat-file", "-e", `${base}^{commit}:eval/regression/v1/manifest.json`]) != null;
  const v1Changed = baseHasV1 && changed.some((name) => name.startsWith("eval/regression/v1/"));
  const newVersionAdded = changed.some(isHigherVersion);
  let removedIds = [];
  const baseQuestions = git(["show", `${base}^{commit}:eval/regression/v1/questions.json`]);
  if (baseQuestions) {
    const before = new Set(JSON.parse(baseQuestions).map((question) => question.id));
    const after = new Set(loadRegressionV1().questions.map((question) => question.id));
    removedIds = [...before].filter((id) => !after.has(id));
  }
  return { skipped: false, errors: regressionErrors({ v1Changed, newVersionAdded, removedIds }) };
}

export function checkRegression(base = process.env.REGRESSION_BASE || "") {
  const loaded = loadRegressionV1();
  if (loaded.questions.length !== 411) {
    throw new Error(`v1 has ${loaded.questions.length} questions, not 411`);
  }
  const diff = diffAgainstBase(base);
  if (diff.errors.length) {
    console.error(diff.errors.join("\n"));
    return false;
  }
  console.error(`v1 freeze ok: 411 questions, manifest matches${diff.skipped ? "" : ", base diff checked"}`);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.argv[2] || process.env.REGRESSION_BASE || "";
  if (!checkRegression(base)) process.exit(1);
}
