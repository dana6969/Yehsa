// R11 dev flows: Dana's R10 screenshot (the House Manual copy quoted Article II and its Roosevelt
// annotation at page 68 for "What's my second amendment"), the keyboard lift, and Ask speed rules.
// node eval/dev_r11_flows.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { documentSectionAnswer } from "../symbolic/docs/section_answer.js";
import { imeLift, keyboardOverlap } from "../symbolic/keyboard_overlap.js";
import { askField } from "../symbolic/phone_field.js";
import { results as quoteAudit } from "./r11/section_quote_audit.mjs";
import { BUNDLED_PAGES } from "./r10/section_audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HMAN = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/fixtures/r11/hman117_constitution_pages.json"), "utf8"));
const HMAN_DOC = { meta: { id: "hman", title: "CONSTITUTION - GovInfo", url: "https://www.govinfo.gov/content/pkg/HMAN-117/pdf/HMAN-117.pdf" }, body: { pages: HMAN } };
const MILITIA = "A well regulated Militia, being necessary to the security of a free State, the right of the people to keep and bear Arms, shall not be infringed.";

export const R11_FLOWS = [
  {
    id: "r11-second-amendment-house-manual",
    run() {
      const a = documentSectionAnswer("What's my second amendment", { entries: [HMAN_DOC], constitutionPages: BUNDLED_PAGES });
      if (!a) return "no answer";
      const [head, quote, rat] = a.text.split("\n\n");
      if (!/^From downloaded document "CONSTITUTION - GovInfo", page 109: Amendment II/.test(head)) return `head: ${head}`;
      if (quote !== `"${MILITIA}" [1][2]`) return `quote: ${quote}`;
      if (!/^Ratified December 15, 1791/.test(rat)) return `ratified: ${rat}`;
      if (/Roosevelt|executive Power|20th amendment/.test(a.text)) return "ran into Article II or its annotation";
      if (a.reader?.bookId !== "doc:hman" || a.reader.page !== 109) return `reader ${JSON.stringify(a.reader)}`;
      return null;
    }
  },
  {
    id: "r11-house-manual-article-sections",
    run() {
      const a = documentSectionAnswer("article 1 section 8", { entries: [HMAN_DOC], constitutionPages: BUNDLED_PAGES });
      if (!a || a.reader?.bookId !== "doc:hman") return "not from the downloaded copy";
      if (!/^"The Congress shall have Power To lay and collect Taxes/m.test(a.text.split("\n\n")[1])) return "wrong words";
      if (/Kilbourn|investigation/.test(a.text)) return "quoted an annotation";
      return null;
    }
  },
  {
    id: "r11-constitution-quote-audit",
    run() {
      const bad = quoteAudit.filter((r) => !r.ok);
      return bad.length ? `${bad.length} of ${quoteAudit.length}: ${bad.slice(0, 3).map((r) => `${r.layout}:${r.q}`).join("; ")}` : null;
    }
  },
  {
    id: "r11-keyboard-lift-includes-the-navigation-bar",
    run() {
      if (imeLift({ imeBottom: 336, windowHeight: 915, viewBottom: 915 }) !== 336) return "native lift";
      if (keyboardOverlap({ viewBottom: 915, keyboardTop: 579, keyboardHeight: 288, screenHeight: 915 }) !== 336) return "fallback capped at the event height";
      if (imeLift({ imeBottom: 336, windowHeight: 915, viewBottom: 579 }) !== 0) return "counted twice after a resize";
      return null;
    }
  },
  {
    id: "r11-rule-answers-skip-the-embedder",
    run() {
      const books = JSON.parse(fs.readFileSync(path.join(ROOT, "symbolic_memory/books_index.json"), "utf8"));
      const calc = askField("What is 12 times 8?", books.passages, { session: { consent: false } });
      if (!calc.settled || !calc.answered) return "calculator answer not settled";
      const open = askField("what can willow bark be used for", books.passages, { session: { consent: false } });
      if (open.settled) return "a note answer was marked settled (the meaning matcher can still change it)";
      return null;
    }
  }
];

export function runR11Flows() {
  return R11_FLOWS.map((f) => {
    let why = null;
    try { why = f.run(); } catch (err) { why = `threw: ${err?.message}`; }
    return { id: f.id, pass: !why, why };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = runR11Flows();
  for (const r of results) console.log(`${r.pass ? "ok  " : "FAIL"} ${r.id}${r.why ? `: ${r.why}` : ""}`);
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}
