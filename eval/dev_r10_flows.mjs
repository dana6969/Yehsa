// R10 dev flows: Dana's 25 Nov "What's my second amendment" screenshot and the section lookups
// around it, plus the section audit. node eval/dev_r10_flows.mjs
import { documentSectionAnswer, sectionLookup } from "../symbolic/docs/section_answer.js";
import { parseSectionRef, findSection } from "../symbolic/docs/section_ref.js";
import { routeAsk } from "../symbolic/reasoning/ask_route.js";
import { BUNDLED_PAGES, GOVINFO_PAGES, MANUAL_PAGES, runSectionAudit } from "./r10/section_audit.mjs";

const GOVINFO = { meta: { id: "govinfo", title: "CONSTITUTION - GovInfo", url: "https://www.govinfo.gov/content/pkg/CDOC-110hdoc50/pdf/CDOC-110hdoc50.pdf" }, body: { pages: GOVINFO_PAGES } };
const MILITIA = "A well regulated Militia, being necessary to the security of a free State, the right of the people to keep and bear Arms, shall not be infringed.";

export const R10_FLOWS = [
  {
    id: "r10-second-amendment-from-govinfo",
    run() {
      const a = documentSectionAnswer("What's my second amendment", { entries: [GOVINFO], constitutionPages: BUNDLED_PAGES });
      if (!a) return "no answer";
      const [head, quote, rat] = a.text.split("\n\n");
      if (!/^From downloaded document "CONSTITUTION - GovInfo", page 19: Amendment II/.test(head)) return `head: ${head}`;
      // R11: the words are the National Archives text [2], at the copy's own page [1].
      if (quote !== `"${MILITIA}" [1][2]`) return `quote: ${quote}`;
      if (!/^Ratified December 15, 1791, as part of the Bill of Rights/.test(rat)) return `ratified: ${rat}`;
      if (/twelfth|Eighth Congress|in lieu of/i.test(a.text)) return "quoted the 12th amendment note";
      if (a.reader?.bookId !== "doc:govinfo" || a.reader.page !== 19) return "no Open in reader at page 19";
      return null;
    }
  },
  {
    id: "r10-second-amendment-bundled-offline",
    run() {
      const a = documentSectionAnswer("whats my 2nd amendment", { entries: [], constitutionPages: BUNDLED_PAGES });
      if (!a?.text.includes(`"${MILITIA}"`)) return "no militia text";
      if (!/download the Constitution from GovInfo/.test(a.text)) return "no download offer";
      if (a.reader?.bookId !== "book:us-constitution") return "reader not the bundled book";
      return null;
    }
  },
  {
    id: "r10-the-ask-route-takes-constitution-parts",
    run() {
      for (const q of ["What's my second amendment", "amendment II", "the preamble", "article 1 section 8 of the constitution", "bill of rights"]) {
        if (routeAsk(q, {})?.kind !== "section") return `not routed: ${q}`;
      }
      for (const q of ["second article of the lease", "what's in section 2", "How do I splint a broken arm?", "download the Constitution from GovInfo", "what does the constitution say about free speech"]) {
        if (routeAsk(q, {})?.kind === "section") return `routed: ${q}`;
      }
      return null;
    }
  },
  {
    id: "r10-a-mention-is-not-a-heading",
    run() {
      const pages = ["Notes on the Constitution\nThe twelfth amendment was proposed in lieu of the original third paragraph of the first section of the second article.\nThe second amendment is often discussed in this note, but its text is not printed here."];
      return findSection(pages, parseSectionRef("second amendment")) ? "a mention was taken for the heading" : null;
    }
  },
  {
    id: "r10-article-section-and-chapter",
    run() {
      const a = documentSectionAnswer("article 1 section 8", { entries: [GOVINFO], constitutionPages: BUNDLED_PAGES });
      if (!/^"The Congress shall have Power To lay and collect Taxes/m.test(a?.text || "")) return `art 1 sec 8: ${a?.text?.slice(0, 160)}`;
      const m = documentSectionAnswer("what does chapter 3 of the canning manual say", { entries: [{ meta: { id: "m", title: "Field Canning Manual" }, body: { pages: MANUAL_PAGES } }] });
      if (!/PRESSURE CANNING MEAT/.test(m?.text || "") || !/75 minutes/.test(m.text)) return `chapter 3: ${m?.text?.slice(0, 160)}`;
      if (sectionLookup("how do I section a deer hindquarter")) return "a field question read as a section lookup";
      return null;
    }
  },
  {
    id: "r10-section-audit",
    run() {
      const out = runSectionAudit();
      return out.pass === out.total ? null : `${out.total - out.pass} of ${out.total} missed`;
    }
  }
];

export function runR10Flows() {
  return R10_FLOWS.map((f) => {
    let why = null;
    try { why = f.run(); } catch (err) { why = `threw: ${err?.message}`; }
    return { id: f.id, pass: !why, why };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = runR10Flows();
  for (const r of results) console.log(`${r.pass ? "ok  " : "FAIL"} ${r.id}${r.why ? `: ${r.why}` : ""}`);
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}
