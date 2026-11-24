// Build the field entries that ship with Yehsa.
//   node symbolic/tools/build_entries.mjs
// Reads data/knowledge/*.json (authoring files) and data/knowledge/sources.json, validates them, and writes
//   symbolic_books/<kind>/entries_<domain>.json   one short indexed passage per entry (what Ask searches)
//   symbolic/entries_data.js                      the full entries and the source list (what Ask shows)
// Entry shape (all text is original wording, never copied from a source):
//   id, title, domain, also[], def, look[], use, not, steps[], call, rel[], src[], pics?
// After this, run `npm run books:ingest` and `node symbolic/tools/build_meaning_index.mjs --notes`.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = path.join(ROOT, "data/knowledge");
const MAX_CONTEXT = 480;

// domain -> folder the passage file lives in. The folder decides the note kind Ask ranks it under.
export const DOMAIN_DIR = {
  firstaid: "medical",
  weather: "landscape",
  foraging: "herbology",
  plants: "herbology",
  shelter: "survival",
  water: "survival",
  fire: "survival",
  hunting: "survival",
  navigation: "survival",
  gear: "survival",
  family: "survival",
  mental: "survival",
  spiritual: "survival",
  home: "survival",
  everyday: "survival",
  animals: "survival",
  food: "survival",
  signaling: "survival",
  knots: "survival",
  terrain: "landscape"
};

// Older notes an entry may point to. entries.js maps each one to a question that reaches it.
import { LEGACY_RELATED } from "../entries_links.js";

function sentenceCut(text, limit) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  const slice = flat.slice(0, limit);
  const end = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "));
  return end > 120 ? slice.slice(0, end + 1) : slice.slice(0, slice.lastIndexOf(" ")).replace(/[,;:]$/, "") + ".";
}

// The short passage Ask indexes: definition, other names, the first signs, then use.
export function passageOf(entry) {
  const parts = [entry.def.trim()];
  if (entry.also?.length) parts.push(`Also called ${entry.also.slice(0, 5).join(", ")}.`);
  if (entry.look?.length) parts.push(`Look for ${entry.look.slice(0, 2).join("; ")}.`);
  if (entry.use) parts.push(entry.use.trim());
  let out = "";
  for (const part of parts) {
    const next = out ? `${out} ${part}` : part;
    if (next.length > MAX_CONTEXT) {
      if (!out) out = sentenceCut(part, MAX_CONTEXT);
      break;
    }
    out = next;
  }
  return out;
}

export function loadAuthoring() {
  const sources = JSON.parse(fs.readFileSync(path.join(DATA, "sources.json"), "utf8"));
  const files = fs.readdirSync(DATA).filter((name) => name.endsWith(".json") && name !== "sources.json").sort();
  const entries = [];
  for (const name of files) {
    const list = JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));
    if (!Array.isArray(list)) throw new Error(`${name} is not an array`);
    for (const entry of list) entries.push({ ...entry, _file: name });
  }
  return { sources, entries };
}

export function validate({ sources, entries }, takenSymbols = new Set()) {
  const errors = [];
  const ids = new Set();
  for (const e of entries) {
    const where = `${e._file}:${e.id || "?"}`;
    if (!e.id || !/^[a-z][a-z0-9_]*$/.test(e.id)) errors.push(`${where}: bad id`);
    if (/_\d+$/.test(e.id || "")) errors.push(`${where}: id must not end in _digits`);
    if (ids.has(e.id)) errors.push(`${where}: duplicate id`);
    ids.add(e.id);
    if (takenSymbols.has(e.id)) errors.push(`${where}: id collides with an existing note symbol`);
    if (!e.title) errors.push(`${where}: no title`);
    if (!DOMAIN_DIR[e.domain]) errors.push(`${where}: unknown domain ${e.domain}`);
    if (!e.def || e.def.length < 30) errors.push(`${where}: definition missing or too short`);
    if (!Array.isArray(e.look) || e.look.length < 2) errors.push(`${where}: needs at least two distinguishing features (look)`);
    if (!e.use) errors.push(`${where}: no use`);
    if (!e.not) errors.push(`${where}: no "not" (when NOT to)`);
    if (!Array.isArray(e.src) || e.src.length === 0) errors.push(`${where}: no sources`);
    for (const s of e.src || []) if (!sources[s]) errors.push(`${where}: unknown source ${s}`);
    if (e.domain === "firstaid" && !/emergency services|poison control|911|doctor|clinician|medical care|urgent care|dentist|emergency room/i.test(`${e.call || ""} ${e.not || ""} ${e.use || ""}`)) {
      errors.push(`${where}: first aid entry must point to emergency services or a clinician`);
    }
  }
  for (const e of entries) {
    for (const r of e.rel || []) {
      if (!ids.has(r) && !LEGACY_RELATED.has(r) && !process.argv.includes("--loose")) errors.push(`${e._file}:${e.id}: unknown related id ${r}`);
    }
  }
  return errors;
}

function existingSymbols() {
  const taken = new Set();
  const indexPath = path.join(ROOT, "symbolic_memory/books_index.json");
  if (!fs.existsSync(indexPath)) return taken;
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  for (const p of index.passages || []) if (!/\/entries_/.test(p.source || "")) taken.add(p.symbol);
  return taken;
}

function main() {
  const authoring = loadAuthoring();
  const errors = validate(authoring, existingSymbols());
  if (errors.length) {
    console.error(errors.slice(0, 60).join("\n"));
    console.error(`${errors.length} problem(s)`);
    process.exit(1);
  }
  // Remove old generated passage files, then write one per domain group.
  for (const dir of new Set(Object.values(DOMAIN_DIR))) {
    const full = path.join(ROOT, "symbolic_books", dir);
    for (const name of fs.readdirSync(full)) {
      if (/^entries_.*\.json$/.test(name)) fs.rmSync(path.join(full, name));
    }
  }
  const byFile = new Map();
  for (const e of authoring.entries) {
    const key = `${DOMAIN_DIR[e.domain]}/entries_${e.domain}.json`;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push({ symbol: e.id, title: e.title, context: passageOf(e) });
  }
  for (const [rel, list] of byFile) {
    fs.writeFileSync(path.join(ROOT, "symbolic_books", rel), `${JSON.stringify(list, null, 1)}\n`);
  }
  const full = authoring.entries.map(({ _file, ...rest }) => rest);
  const usedSources = {};
  for (const e of full) for (const s of e.src) usedSources[s] = authoring.sources[s];
  const header = "// Generated by symbolic/tools/build_entries.mjs from data/knowledge/*.json. Do not edit by hand.\n// Plain JS, no I/O, so Metro bundles it and Node imports it.\n";
  fs.writeFileSync(path.join(ROOT, "symbolic/entries_data.js"),
    `${header}export const ENTRY_SOURCES = ${JSON.stringify(usedSources)};\nexport const ENTRIES = ${JSON.stringify(full)};\n`);
  const domains = {};
  for (const e of full) domains[e.domain] = (domains[e.domain] || 0) + 1;
  console.log(`entries ${full.length}`, JSON.stringify(domains));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
