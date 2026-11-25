// R8 dev flows: Dana's 24 Nov screenshots, replayed through the phone's own routing and answer code.
// Not the frozen v1 suite and not the external holdout. Each flow sets up what the phone had
// (saved documents, learned notes) and checks which path answers and what it says.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_BOOKS, bookFromAtp, bookFromText, libraryList } from "../symbolic/library/library.js";
import { retrieveLearned, formatLearned, savesAsLearned, saveHelpfulAnswer, emptyLearned } from "../symbolic/learned_notes.js";
import { routeAsk } from "../symbolic/reasoning/ask_route.js";
import { reasonedAnswer, synthesize } from "../symbolic/reasoning/doc_reasoner.js";
import { sourceFromBook, sourceFromNotes } from "../symbolic/reasoning/sources.js";
import { cleanDocTitle } from "../symbolic/docs/doc_title.js";
import { voiceReply, newThread } from "../symbolic/yehsa_voice.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

export const SYNTHESIS_Q = "Look across different eras, cultures, discoveries, religions, philosophies, scientific developments, and the rise and fall of civilizations. 1. What patterns repeatedly emerge? 2. What have humans consistently misunderstood about themselves? 3. What knowledge has humanity gained but repeatedly failed to apply? 4. Are civilizations genuinely progressing or repeating old patterns with better technology? 5. What conclusions can you draw that aren't explicitly stated in any one encyclopedia? Use what you've actually read. Distinguish documented facts from your own deductions. Tell me what you think humanity has yet to understand.";
export const ROME_Q = "Yehsa, using The Encyclopedia of World History you just read: What were the three biggest factors that contributed to the fall of the Roman Empire? Explain each briefly, identify which factor you believe had the greatest impact, and tell me approximately when the Western Roman Empire fell. Use your saved encyclopedia as your primary source.";

// What Dana's phone had: four saved encyclopedias, a hunting note he said Yes to, and an old web answer with page junk.
export const DOCS = [
  { id: "d1", title: "Encyclopedia Of", fetchedAt: 1, pageKind: "page" },
  { id: "d2", title: "An Encyclopedia of Everything", fetchedAt: 2, pageKind: "part" },
  { id: "d3", title: "The Encyclopedia of World History", fetchedAt: 3, pageKind: "page" },
  { id: "d4", title: "First Children's Encyclopedia", fetchedAt: 4, pageKind: "page" }
];
export const LEARNED = {
  ...emptyLearned("dev"),
  notes: [
    { id: "l1", title: "Before you hunt", text: "Okay, here is what the notes say. Before you hunt: license, tags, orange, legal shooting light, and the season dates for your state.", source: "a chat answer", question: "what do I need before I go hunting", tags: ["hunting_before"], confidence: "unverified", helpful: 1, hidden: false, date: "2026-11-20T00:00:00Z" },
    { id: "l2", title: "KUBARK", text: "Here is what I have. The KUBARK manual covers counterintelligence interrogation. com, Nov 24, 2026. _=1795557549451", source: "a chat answer", question: "what is kubark", tags: [], confidence: "unverified", helpful: 1, hidden: false, date: "2026-11-24T00:00:00Z" }
  ]
};

function worldHistory() {
  const raw = read("eval/fixtures/r8/world_history_excerpt.txt");
  return sourceFromBook({ ...bookFromText({ id: "doc:d3", title: "The Encyclopedia of World History", raw }), docId: "d3" });
}

function phoneSources() {
  const out = [worldHistory()];
  for (const b of BUNDLED_BOOKS) out.push(sourceFromBook(bookFromText({ ...b, raw: read(`assets/books/${b.file}.ybk`) })));
  const pack = JSON.parse(read("assets/atp/atp_sections.json"));
  out.push(sourceFromBook(bookFromAtp(pack, "atp-3-50.21")));
  out.push(sourceFromNotes(JSON.parse(read("symbolic_memory/books_index.json")).passages));
  return out;
}

const JUNK = /_=\d{6,}|\bcom, (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* \d{1,2}, \d{4}/;
const ctx = () => ({ entries: libraryList({ docs: DOCS }), docs: DOCS });

export const R8_FLOWS = [
  {
    id: "r8-synthesis-routes",
    category: "r8-synthesis",
    run: () => {
      const route = routeAsk(SYNTHESIS_Q, ctx());
      return { pass: route?.kind === "synthesis", why: `route ${route?.kind}` };
    }
  },
  {
    id: "r8-synthesis-no-learned-hijack",
    category: "r8-learned",
    run: () => ({ pass: retrieveLearned(SYNTHESIS_Q, LEARNED) === null, why: "a learned note answered the synthesis question" })
  },
  {
    id: "r8-synthesis-answer",
    category: "r8-synthesis",
    run: () => {
      const a = synthesize(SYNTHESIS_Q, phoneSources());
      const t = a?.text || "";
      const ok = a?.kind === "synthesis" && /Documented: "/.test(t) && /Yehsa's deduction:/.test(t) && /\(\w[^)]*, (?:page|note) \d+\)/.test(t)
        && !/Before you hunt|firearm/i.test(t) && !JUNK.test(t) && (t.match(/^\d\. /gm) || []).length >= 5;
      return { pass: ok, why: t.slice(0, 160) };
    }
  },
  {
    id: "r8-rome-routes-to-saved-encyclopedia",
    category: "r8-named-doc",
    run: () => {
      const route = routeAsk(ROME_Q, ctx());
      return { pass: route?.kind === "named-doc" && route.named.doc.id === "d3", why: `route ${route?.kind} ${route?.named?.doc?.id}` };
    }
  },
  {
    id: "r8-rome-no-learned-hijack",
    category: "r8-learned",
    run: () => ({ pass: retrieveLearned(ROME_Q, LEARNED) === null, why: "a learned note answered the Rome question" })
  },
  {
    id: "r8-rome-answer",
    category: "r8-named-doc",
    run: () => {
      const a = reasonedAnswer(ROME_Q, [worldHistory()]);
      const t = a?.text || "";
      const ok = a?.kind === "doc-reasoned" && /\b476\b/.test(t) && /Yehsa's inference:/.test(t) && /barbarian/i.test(t)
        && /\(The Encyclopedia of World History, page \d+\)/.test(t) && !/KUBARK/i.test(t) && !JUNK.test(t) && (t.match(/^\d\. /gm) || []).length === 3;
      return { pass: ok, why: t.slice(0, 160) };
    }
  },
  {
    id: "r8-saved-encyclopedia-means-latest",
    category: "r8-named-doc",
    run: () => {
      const route = routeAsk("Use your saved encyclopedia: who was Julius Caesar and how did he die?", ctx());
      return { pass: route?.kind === "named-doc" && route.named.doc.id === "d4", why: `${route?.kind} ${route?.named?.doc?.id}` };
    }
  },
  {
    id: "r8-titles-clean",
    category: "r8-titles",
    run: () => ({ pass: cleanDocTitle("First Children s Encyclopedia") === "First Children's Encyclopedia" && cleanDocTitle("(PDF) An Encyclopedia of Everything | Academia") === "An Encyclopedia of Everything", why: "title cleanup" })
  },
  {
    id: "r8-learned-still-answers-its-topic",
    category: "r8-regression",
    run: () => ({ pass: retrieveLearned("what do I need before I go hunting", LEARNED)?.id === "l1", why: "the hunting note no longer answers its own question" })
  },
  {
    id: "r8-junk-learned-note-skipped",
    category: "r8-learned",
    run: () => ({ pass: retrieveLearned("what is kubark", LEARNED) === null && !JUNK.test(formatLearned(LEARNED.notes[1])), why: "junk note used or shown with junk" })
  },
  {
    id: "r8-yes-does-not-save-recalled-or-web",
    category: "r8-learned",
    run: () => {
      const kinds = ["learned", "web", "document", "synthesis", "doc-reasoned", "library"];
      const saved = saveHelpfulAnswer(emptyLearned("x"), { question: "q", text: "Okay, here is what the notes say. Boil water for one minute.\n\nWant me to go on to firearm safety in the field?" });
      return { pass: kinds.every((k) => !savesAsLearned(k)) && savesAsLearned("survival") && !/firearm|here is what/i.test(saved.notes[0].text), why: "save rules" };
    }
  },
  {
    id: "r8-no-unrelated-follow-up",
    category: "r8-learned",
    run: () => {
      const v = voiceReply({ answered: true, kind: "learned", text: "Learned on this device from a chat answer. Before you hunt: license, tags.", symbol: "l1" }, "what do I need before hunting", newThread());
      return { pass: !/firearm safety/i.test(v.text), why: v.text.slice(0, 120) };
    }
  },
  {
    id: "r8-field-question-unrouted",
    category: "r8-regression",
    run: () => ({ pass: routeAsk("How do I purify water with a fire?", ctx()) === null, why: "a field question was routed away" })
  }
];

export function runR8Flows() {
  return R8_FLOWS.map((f) => {
    let r;
    try {
      r = f.run();
    } catch (err) {
      r = { pass: false, why: String(err?.stack || err).slice(0, 200) };
    }
    return { id: f.id, category: f.category, pass: r.pass === true, why: r.why };
  });
}
