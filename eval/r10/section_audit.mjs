// node eval/r10/section_audit.mjs [--before]
// R10 audit: questions that name a part of a document, asked of three layouts:
//   GovInfo's Constitution PDF (as Yehsa's own PDF reader extracts it, CDOC-110hdoc50),
//   the National Archives text bundled on the phone, the 1789 joint resolution ("Article the fourth..."),
//   and a plain-text manual (Chapter 3, Section 2).
// A pass quotes the right part first: its opening words match the part's own opening words.
// --before scores the R9 path (docAnswer over the same document) on the same questions.
import fs from "node:fs";
import { bookFromText } from "../../symbolic/library/library.js";
import { documentSectionAnswer } from "../../symbolic/docs/section_answer.js";
import { docAnswer } from "../../symbolic/docs/doc_store.js";
import { buildSections } from "../../symbolic/docs/doc_sections.js";
import { paginate } from "../../symbolic/library/library.js";
import { toRoman, ORDINAL_NAMES } from "../../symbolic/docs/section_ref.js";

const read = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
export const GOVINFO_PAGES = JSON.parse(read("eval/fixtures/r10/govinfo_constitution_pages.json"));
export const BUNDLED_PAGES = bookFromText({ id: "book:us-constitution", title: "Constitution", raw: read("assets/books/us_constitution.ybk") }).pages;
export const RESOLUTION_PAGES = paginate(read("eval/fixtures/r10/joint_resolution_1789.txt"));
export const MANUAL_PAGES = [read("eval/fixtures/r10/canning_manual.txt")];

// The opening words of each part, from the National Archives transcription (checked by hand).
const AMEND = {
  1: "Congress shall make no law respecting an establishment of religion", 2: "A well regulated Militia", 3: "No Soldier shall, in time of peace be quartered",
  4: "The right of the people to be secure in their persons", 5: "No person shall be held to answer for a capital", 6: "In all criminal prosecutions, the accused shall enjoy",
  7: "In Suits at common law, where the value in controversy", 8: "Excessive bail shall not be required", 9: "The enumeration in the Constitution, of certain rights",
  10: "The powers not delegated to the United States", 11: "The Judicial power of the United States shall not be construed", 12: "The Electors shall meet in their respective states",
  13: "Neither slavery nor involuntary servitude", 14: "All persons born or naturalized in the United States", 15: "The right of citizens of the United States to vote shall not be denied or abridged by the United States or by any State on account of race",
  16: "The Congress shall have power to lay and collect taxes on incomes", 17: "The Senate of the United States shall be composed of two Senators from each State, elected by the people", 18: "After one year from the ratification of this article the manufacture",
  19: "The right of citizens of the United States to vote shall not be denied or abridged by the United States or by any State on account of sex", 20: "The terms of the President and Vice President shall end at noon", 21: "The eighteenth article of amendment to the Constitution of the United States is hereby repealed",
  22: "No person shall be elected to the office of the President more than twice", 23: "The District constituting the seat of Government", 24: "The right of citizens of the United States to vote in any primary or other election",
  25: "In case of the removal of the President from office", 26: "The right of citizens of the United States, who are eighteen years of age or older", 27: "No law, varying the compensation for the services of the Senators and Representatives"
};
const ARTICLE = { 1: "All legislative Powers herein granted", 2: "The executive Power shall be vested in a President", 3: "The judicial Power of the United States, shall be vested", 4: "Full Faith and Credit shall be given in each State", 5: "The Congress, whenever two thirds of both Houses", 6: "All Debts contracted and Engagements entered into", 7: "The Ratification of the Conventions of nine States" };
const ART_SEC = {
  "1.1": "All legislative Powers herein granted", "1.2": "The House of Representatives shall be composed", "1.3": "The Senate of the United States shall be composed", "1.4": "The Times, Places and Manner of holding Elections",
  "1.5": "Each House shall be the Judge of the Elections", "1.6": "The Senators and Representatives shall receive a Compensation", "1.7": "All Bills for raising Revenue", "1.8": "The Congress shall have Power To lay and collect Taxes",
  "1.9": "The Migration or Importation of such Persons", "1.10": "No State shall enter into any Treaty", "2.1": "The executive Power shall be vested in a President", "2.2": "The President shall be Commander in Chief",
  "2.3": "He shall from time to time give to the Congress Information", "2.4": "The President, Vice President and all civil Officers", "3.1": "The judicial Power of the United States, shall be vested", "3.2": "The judicial Power shall extend to all Cases",
  "3.3": "Treason against the United States, shall consist only", "4.1": "Full Faith and Credit shall be given in each State", "4.2": "The Citizens of each State shall be entitled", "4.3": "New States may be admitted by the Congress", "4.4": "The United States shall guarantee to every State"
};

const ord = (n) => (n < 20 ? ORDINAL_NAMES[n] : n % 10 === 0 ? { 20: "twentieth" }[n] : `twenty-${ORDINAL_NAMES[n % 10]}`);
const suffix = (n) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

export function auditQuestions() {
  const out = [];
  for (let n = 1; n <= 27; n += 1) {
    const R = toRoman(n).toUpperCase();
    for (const q of [`what's my ${ord(n)} amendment`, `${n}${suffix(n)} amendment`, `amendment ${R}`, `what does amendment ${n} say`, `read me the ${ord(n)} amendment to the constitution`]) {
      out.push({ id: `amend-${n}-${out.length}`, question: q, want: AMEND[n], layouts: n <= 10 ? ["govinfo", "bundled", "resolution"] : ["govinfo", "bundled"] });
    }
  }
  for (let n = 1; n <= 7; n += 1) {
    const R = toRoman(n).toUpperCase();
    for (const q of [`article ${R} of the constitution`, `what does article ${n} of the constitution say`]) out.push({ id: `art-${n}-${out.length}`, question: q, want: ARTICLE[n], layouts: ["govinfo", "bundled"] });
  }
  for (const [key, want] of Object.entries(ART_SEC)) {
    const [a, s] = key.split(".").map(Number);
    for (const q of [`article ${a} section ${s}`, `section ${s} of article ${toRoman(a).toUpperCase()} of the constitution`]) out.push({ id: `sec-${key}-${out.length}`, question: q, want, layouts: ["govinfo", "bundled"] });
  }
  out.push({ id: "preamble-1", question: "what does the preamble say", want: "We the People of the United States", layouts: ["govinfo", "bundled"] });
  out.push({ id: "preamble-2", question: "the preamble to the constitution", want: "We the People of the United States", layouts: ["govinfo", "bundled"] });
  out.push({ id: "bor-1", question: "what's in the bill of rights", want: AMEND[1], layouts: ["govinfo", "bundled", "resolution"] });
  for (const [q, want] of [["what does chapter 3 of the canning manual say", "PRESSURE CANNING MEAT"], ["chapter 2", "JARS AND LIDS"], ["what's in chapter one", "EQUIPMENT"], ["read me section 2", "Processing. Process pints for 75 minutes"], ["what does the third chapter say", "PRESSURE CANNING MEAT"]]) {
    out.push({ id: `manual-${out.length}`, question: q, want, layouts: ["manual"] });
  }
  return out;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SOURCES = {
  govinfo: () => ({ entries: [{ meta: { id: "govinfo", title: "CONSTITUTION - GovInfo", url: "https://www.govinfo.gov/content/pkg/CDOC-110hdoc50/pdf/CDOC-110hdoc50.pdf" }, body: { pages: GOVINFO_PAGES } }], constitutionPages: BUNDLED_PAGES }),
  bundled: () => ({ entries: [], constitutionPages: BUNDLED_PAGES }),
  resolution: () => ({ entries: [{ meta: { id: "res", title: "Joint Resolution 1789 (constitution amendments)", url: "" }, body: { pages: RESOLUTION_PAGES } }], constitutionPages: null }),
  manual: () => ({ entries: [{ meta: { id: "manual", title: "Field Canning Manual", url: "" }, body: { pages: MANUAL_PAGES } }], constitutionPages: null })
};

function quotedFirst(text) {
  const m = /^"(.{10,})"/m.exec(String(text || ""));
  return m ? m[1] : String(text || "");
}

export function runSectionAudit({ before = false } = {}) {
  const rows = [];
  for (const item of auditQuestions()) {
    for (const layout of item.layouts) {
      const src = SOURCES[layout]();
      let got = null;
      if (before) {
        const entries = src.entries.map((e) => ({ meta: e.meta, body: { sections: buildSections(e.body.pages) } }));
        got = entries.length ? docAnswer(entries, item.question) : null;
      } else {
        got = documentSectionAnswer(item.question, src);
      }
      const strip = (t) => t.replace(/^(?:section|sec) ?\d+ /, "");
      const head0 = before ? norm(String(got?.text || "").split("\n\n")[1] || "") : norm(quotedFirst(got?.text));
      const head = strip(head0);
      const want = norm(item.want);
      const pass = Boolean(got && (head.startsWith(want.slice(0, 60)) || (layout === "manual" && norm(got.text).includes(want))));
      rows.push({ id: item.id, layout, question: item.question, pass, got: got ? String(got.text).slice(0, 160) : null });
    }
  }
  const byLayout = {};
  for (const r of rows) {
    const b = (byLayout[r.layout] = byLayout[r.layout] || { n: 0, pass: 0 });
    b.n += 1;
    if (r.pass) b.pass += 1;
  }
  return { total: rows.length, pass: rows.filter((r) => r.pass).length, byLayout, rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = runSectionAudit({ before: process.argv.includes("--before") });
  for (const r of out.rows) if (!r.pass) console.log(`MISS ${r.layout} | ${r.question} | ${String(r.got).replace(/\s+/g, " ").slice(0, 120)}`);
  console.log(JSON.stringify({ total: out.total, pass: out.pass, pct: +(100 * out.pass / out.total).toFixed(1), byLayout: out.byLayout }));
}
