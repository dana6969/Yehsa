// In-process agents. They propose. They do not change code, open a network
// connection, touch position lock, or contact another device.
// A proposal is stored only after it is logged. Applying a learner proposal
// requires an explicit approve call and the learning opt-in.
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SETTINGS = path.join(ROOT, "symbolic_memory", "agent_settings.json");
const LOG = path.join(ROOT, "symbolic_memory", "agent_log.jsonl");
const LEARNING = path.join(ROOT, "symbolic_memory", "agent_learning.json");

const NAMES = ["curator", "learner", "corpus", "safety"];

function defaults() {
  return {
    enabled: { curator: true, learner: true, corpus: true, safety: true },
    learningOptIn: false
  };
}

function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function readSettings() {
  return { ...defaults(), ...readJson(SETTINGS, {}) , enabled: { ...defaults().enabled, ...(readJson(SETTINGS, {}).enabled || {}) } };
}

export function writeSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
  return settings;
}

export function setAgentEnabled(name, enabled) {
  if (!NAMES.includes(name)) throw new Error(`unknown agent ${name}`);
  const settings = readSettings();
  settings.enabled[name] = enabled === true;
  return writeSettings(settings);
}

export function setLearningOptIn(value) {
  const settings = readSettings();
  settings.learningOptIn = value === true;
  return writeSettings(settings);
}

export function readAgentLog() {
  try {
    return fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function logDecision(entry) {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`);
}

export function corpusHealthReport(files) {
  const reports = [];
  for (const file of files) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8").slice(0, 400);
    } catch (err) {
      reports.push({ file, problem: "unreadable" });
      continue;
    }
    if (/^404\b/.test(text.trim()) || /404: Not Found/.test(text)) reports.push({ file, problem: "placeholder-404" });
    else if (/<!doctype html/i.test(text) || /<html/i.test(text)) reports.push({ file, problem: "html-error-page" });
  }
  return reports;
}

export function proposeAgents({ question, answer, files } = {}, settings = readSettings()) {
  const proposals = [];
  if (settings.enabled.curator) {
    const low = !answer?.answered || answer?.confidence === "low";
    proposals.push({
      id: `curator-${proposals.length}`,
      agent: "curator",
      kind: low ? "low-confidence" : "checked",
      text: low
        ? "Curator: the reply is missing or low confidence. It is not approved as a source-backed answer."
        : "Curator: the reply was checked against the retrieved note. No change is proposed.",
      requiresApproval: low
    });
  }
  if (settings.enabled.learner) {
    proposals.push({
      id: `learner-${proposals.length}`,
      agent: "learner",
      kind: "wording",
      text: settings.learningOptIn
        ? "Learner: a wording note can be stored on this device after you approve it."
        : "Learner: storage is off until you opt in. Nothing was saved.",
      wording: String(question || "").slice(0, 160),
      requiresApproval: true
    });
  }
  if (settings.enabled.corpus) {
    const problems = corpusHealthReport(files || []);
    proposals.push({
      id: `corpus-${proposals.length}`,
      agent: "corpus",
      kind: "corpus-health",
      text: problems.length
        ? `Corpus health: ${problems.length} file(s) look broken or mislabeled.`
        : "Corpus health: the checked files did not show a 404 or an HTML error page.",
      problems,
      requiresApproval: false
    });
  }
  if (settings.enabled.safety && /\b(dose|cure|surgery|eat a plant)\b/i.test(`${question} ${answer?.text || ""}`)) {
    proposals.push({
      id: `safety-${proposals.length}`,
      agent: "safety",
      kind: "field-safety",
      text: "Safety: this is not a dose, a cure, or emergency care. The field notes are reminders, not a clinician.",
      requiresApproval: true
    });
  }
  for (const proposal of proposals) logDecision({ event: "propose", ...proposal });
  return proposals;
}

export function approveProposal(proposal) {
  const settings = readSettings();
  if (!settings.enabled[proposal?.agent]) {
    logDecision({ event: "rejected-disabled", id: proposal?.id, agent: proposal?.agent });
    return { applied: false, reason: "agent is off" };
  }
  if (proposal?.agent === "learner") {
    if (!settings.learningOptIn) {
      logDecision({ event: "rejected-opt-out", id: proposal.id });
      return { applied: false, reason: "learning opt-in is off" };
    }
    const store = readJson(LEARNING, { phrases: [] });
    store.phrases = [...(store.phrases || []), proposal.wording].filter(Boolean).slice(-40);
    fs.mkdirSync(path.dirname(LEARNING), { recursive: true });
    fs.writeFileSync(LEARNING, `${JSON.stringify(store, null, 2)}\n`);
    logDecision({ event: "approved", id: proposal.id, agent: "learner" });
    return { applied: true, reason: null };
  }
  logDecision({ event: "approved-noop", id: proposal?.id, agent: proposal?.agent });
  return { applied: false, reason: "nothing to write" };
}

export function resetAgentLearning() {
  fs.rmSync(LEARNING, { force: true });
  logDecision({ event: "reset-learning" });
  return { reset: true };
}
