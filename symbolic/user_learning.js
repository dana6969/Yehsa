import fs from "fs";
import path from "path";
import { ensureLocalOwner } from "./device_owner.js";

const DEFAULT_LEARNING = "symbolic_memory/user_learning.json";
const MAX_TOPICS = 24;

function emptyProfile(installId) {
  return {
    binding: "this-phone",
    installId,
    turns: 0,
    emotions: {},
    topics: {},
    wording: {},
    updatedAt: null
  };
}

function readProfile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeProfile(file, profile) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Some platforms ignore mode bits.
  }
}

function bump(map, key) {
  if (!key) return map;
  const next = { ...map, [key]: (map[key] || 0) + 1 };
  const entries = Object.entries(next);
  if (entries.length <= MAX_TOPICS) return next;
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_TOPICS));
}

function topicKey(question) {
  const topic = String(question?.topic || "").trim().toLowerCase();
  if (!topic || topic.length > 80) return "";
  return topic;
}

/**
 * Local memory of how this phone's user words things, what they feel, and what they ask.
 * Another machine, or another phone's file, is not updated. The learning queue is not touched.
 */
export function rememberUserTurn({ utterance, emotion, question, options = {} } = {}) {
  const owner = ensureLocalOwner({ ownerPath: options.ownerPath, phoneId: options.phoneId });
  if (!owner.phoneBound || !owner.recognized) {
    return { learned: false, reason: owner.reason || "no phone identity; access refused", profile: null };
  }
  const file = options.learningPath || DEFAULT_LEARNING;
  const existing = readProfile(file);
  if (existing && existing.installId && existing.installId !== owner.installId) {
    return { learned: false, reason: "learning file is not this phone", profile: null };
  }
  const profile = existing?.installId === owner.installId ? existing : emptyProfile(owner.installId);
  profile.turns += 1;
  profile.emotions = bump(profile.emotions || {}, emotion?.emotion || "neutral");
  const topic = topicKey(question);
  if (topic) profile.topics = bump(profile.topics || {}, topic);
  for (const cue of emotion?.cues || []) profile.wording = bump(profile.wording || {}, cue);
  profile.updatedAt = new Date().toISOString();
  profile.binding = "this-phone";
  writeProfile(file, profile);
  return { learned: true, reason: null, profile };
}

export function adaptToUser(text, profile, question, emotion) {
  if (!text) return text;
  if (!profile) return text;
  const notes = [];
  const topic = topicKey(question);
  if (topic && profile.topics?.[topic] > 1) {
    notes.push(`You have come back to ${topic} (${profile.topics[topic]}).`);
  }
  if (emotion?.understood && profile.emotions?.[emotion.emotion] > 1) {
    notes.push(`${emotion.emotion} has shown up in your wording before.`);
  }
  if (notes.length === 0) return text;
  return `${notes.join(" ")}\n${text}`;
}
