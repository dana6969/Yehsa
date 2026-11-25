// R9 dev flows: Dana's 25 Nov screenshots (understanding questions), replayed through the phone's own
// Ask, voice and picture code, plus a fixed sample of the understanding audit. Not the frozen v1
// suite and not the external holdout.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { askField } from "../symbolic/phone_field.js";
import { ask } from "../symbolic/ask.js";
import { voiceReply, newThread } from "../symbolic/yehsa_voice.js";
import { answerPictures } from "../symbolic/picture_guide.js";
import { entryFor } from "../symbolic/entries.js";
import { routeAsk } from "../symbolic/reasoning/ask_route.js";
import { relationAnswer, relationClarify, relationQuestion } from "../symbolic/reasoning/relation.js";
import { sourceFromBook } from "../symbolic/reasoning/sources.js";
import { bookFromText, libraryList } from "../symbolic/library/library.js";
import { quoted } from "../symbolic/reasoning/quote_clean.js";
import { spiritualAnswer } from "../symbolic/spiritual_answer.js";
import { auditSet } from "./understanding/audit_set.mjs";
import { DOCS } from "./dev_r8_flows.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const PASSAGES = JSON.parse(read("symbolic_memory/books_index.json")).passages;
const MANIFEST = JSON.parse(read("assets/pictures/manifest.json"));
const ID_ROLES = new Set(["whole", "example", "lookalike", "detail"]);

function turn(question, thread = newThread()) {
  const result = askField(question, PASSAGES, {});
  const voiced = voiceReply(result, question, thread);
  const pictures = answerPictures(MANIFEST, result.symbol);
  return { result, voiced, pictures };
}

function islamSource() {
  // The two header lines say where the excerpt comes from; the book text starts after the blank line.
  const raw = read("eval/fixtures/r9/wells_islam_excerpt.txt").split("\n").slice(3).join("\n");
  return { ...sourceFromBook(bookFromText({ id: "doc:wells-islam", title: "A Short History of the World", raw })), docId: "wells-islam" };
}

const VENISON = /venison|deer/i;

export const R9_FLOWS = [
  {
    id: "r9-gut-partridge-gets-upland-steps",
    category: "r9-understanding",
    run: () => {
      const { result, voiced, pictures } = turn("How to gut a partridge");
      const ok = result.symbol === "field_dressing_upland_birds" && /^Partridge \(/.test(result.text) && /handled like other upland birds/.test(result.text)
        && /1\. Put on gloves/.test(result.text) && !/fan tail|drumming/.test(result.text);
      const offer = voiced.offer?.ask || "";
      const noCircle = !/field dress|gut a pheasant|grouse, pheasant/i.test(offer) && !VENISON.test(offer);
      const noIdPhotos = pictures.every((p) => !ID_ROLES.has(p.role));
      return { pass: ok && noCircle && noIdPhotos, why: `symbol ${result.symbol}; offer ${offer}; pics ${pictures.map((p) => p.role)}` };
    }
  },
  {
    id: "r9-field-dressing-birds-full-steps",
    category: "r9-understanding",
    run: () => {
      const { result, voiced } = turn("Tell me about field dressing birds");
      const ok = result.symbol === "field_dressing_birds" && /Field dressing grouse, pheasant, and quail:\n1\./.test(result.text) && /Field dressing ducks and geese:\n1\./.test(result.text);
      const offer = `${voiced.offer?.label || ""} ${voiced.offer?.ask || ""}`;
      return { pass: ok && !VENISON.test(offer) && !/field dressing (?:grouse|ducks|birds)/i.test(offer), why: `symbol ${result.symbol}; offer ${offer}` };
    }
  },
  {
    id: "r9-upland-follow-up-not-circular",
    category: "r9-understanding",
    run: () => {
      const { result, voiced, pictures } = turn("How do I gut a pheasant?");
      const offer = `${voiced.offer?.label || ""} ${voiced.offer?.ask || ""}`;
      const ok = result.symbol === "field_dressing_upland_birds" && !/field dressing birds/i.test(offer) && !VENISON.test(offer) && /bird/i.test(offer);
      return { pass: ok && pictures.every((p) => !ID_ROLES.has(p.role)), why: `offer ${offer}; pics ${pictures.map((p) => p.role)}` };
    }
  },
  {
    id: "r9-follow-up-chips-stay-on-birds",
    category: "r9-understanding",
    run: () => {
      let thread = newThread();
      const asked = [];
      for (const q of ["How to gut a partridge", "Tell me about field dressing birds", "How do I field dress a duck?"]) {
        const t = turn(q, thread);
        thread = t.voiced.thread;
        asked.push(...(t.voiced.suggestions || []).map((s) => s.ask || s.label));
      }
      const bad = asked.filter((a) => VENISON.test(a) || /field dressing birds/i.test(a));
      return { pass: bad.length === 0, why: `chips ${asked.join(" | ")}` };
    }
  },
  {
    id: "r9-id-card-never-answers-how-to",
    category: "r9-understanding",
    run: () => {
      const bad = [];
      for (const item of auditSet().filter((x) => ["dress", "cook"].includes(x.action))) {
        const r = ask(item.question, { agents: false });
        const entry = entryFor(r.symbol);
        if (entry && (entry.domain === "animals" || entry.domain === "sign")) bad.push(`${item.question} -> ${r.symbol}`);
      }
      return { pass: bad.length === 0, why: bad.slice(0, 5).join("; ") };
    }
  },
  {
    id: "r9-what-is-still-the-id-card",
    category: "r9-understanding",
    run: () => {
      const a = ask("What does a ruffed grouse look like?", { agents: false });
      const b = ask("Tell me about ruffed grouse", { agents: false });
      return { pass: a.symbol === "ruffed_grouse" && b.symbol === "ruffed_grouse", why: `${a.symbol} ${b.symbol}` };
    }
  },
  {
    id: "r9-muslims-and-romans-routes-to-relation",
    category: "r9-relation",
    run: () => {
      const route = routeAsk("Muslim and romans", { entries: libraryList({ docs: DOCS }), docs: DOCS });
      return { pass: route?.kind === "relation" && route.relation.a === "muslims" && route.relation.b === "romans", why: JSON.stringify(route) };
    }
  },
  {
    id: "r9-muslims-and-romans-answer-from-history",
    category: "r9-relation",
    run: () => {
      const got = relationAnswer("Muslim and romans", [islamSource()]);
      const ok = got && /Documented:/.test(got.text) && /Yehsa's inference/.test(got.text) && /Moslem|Arab|Caliph/.test(got.text) && /Byzanti|Roman|Constantinople/.test(got.text)
        && /\(A Short History of the World, page \d+\)/.test(got.text) && !/Hermes|Epistle|KJV/.test(got.text);
      return { pass: Boolean(ok), why: got ? got.text.slice(0, 300) : "no answer" };
    }
  },
  {
    id: "r9-muslims-and-romans-no-scripture",
    category: "r9-relation",
    run: () => {
      const r = ask("Muslim and romans", { agents: false });
      const lexical = spiritualAnswer("Muslim and romans");
      const ok = r.kind !== "spiritual" && !lexical;
      const clarify = relationClarify(relationQuestion("Muslim and romans"));
      return { pass: ok && /^Do you mean how Muslims and Romans related/.test(clarify), why: `${r.kind} ${lexical?.symbol}` };
    }
  },
  {
    id: "r9-scripture-questions-still-quote",
    category: "r9-relation",
    run: () => {
      const a = spiritualAnswer("what does Romans say about sin");
      const b = spiritualAnswer("Romans chapter 8");
      const ok = /to the Romans/.test(a?.symbol || "") && /to the Romans 8:/.test(b?.symbol || "");
      return { pass: ok, why: `${a?.symbol} | ${b?.symbol}` };
    }
  },
  {
    id: "r9-two-field-things-are-not-history",
    category: "r9-relation",
    run: () => {
      const bad = ["deer and elk", "fire and water", "rabbit vs hare", "trout and bass", "salt and pepper"].filter((q) => relationQuestion(q));
      return { pass: bad.length === 0, why: bad.join(", ") };
    }
  },
  {
    id: "r9-quotes-read-cleanly",
    category: "r9-relation",
    run: () => {
      const a = quoted("That such collections were kept secret is not sur- prising, \u201cfor they");
      return { pass: a === "\"That such collections were kept secret is not surprising, for they\"", why: a };
    }
  },
  {
    id: "r9-audit-sample",
    category: "r9-understanding",
    run: () => {
      const sample = auditSet().filter((_, i) => i % 6 === 0);
      const miss = [];
      for (const item of sample) {
        const r = ask(item.question, { agents: false });
        const got = r.answered ? r.symbol : null;
        if (!(got && (item.want.includes(got) || (item.topic && item.topic.test(got))))) miss.push(`${item.question} -> ${got}`);
      }
      // The sample is held to the audit's own bar: at most 1 in 10 off, and every miss listed.
      return { pass: miss.length <= Math.floor(sample.length / 10), why: `${sample.length - miss.length}/${sample.length}; ${miss.slice(0, 8).join("; ")}` };
    }
  }
];

export function runR9Flows() {
  return R9_FLOWS.map((flow) => {
    try {
      const out = flow.run();
      return { id: flow.id, category: flow.category, pass: Boolean(out.pass), why: out.why || "" };
    } catch (error) {
      return { id: flow.id, category: flow.category, pass: false, why: `threw ${error.message}` };
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const r of runR9Flows()) console.log(r.pass ? "ok  " : "FAIL", r.id, r.pass ? "" : r.why);
}
