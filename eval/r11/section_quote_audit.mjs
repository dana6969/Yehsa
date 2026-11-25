// R11: every Constitution part in two downloaded GovInfo layouts (CDOC-110hdoc50 and the House Manual
// HMAN-117, whose pages run notes and annotations between the clauses) must quote exactly the National
// Archives text with nothing after it, and point the reader at the copy's own page for that heading.
//   node eval/r11/section_quote_audit.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findSection, parseSectionRef } from "../../symbolic/docs/section_ref.js";
import { documentSectionAnswer } from "../../symbolic/docs/section_answer.js";
import { bookFromText } from "../../symbolic/library/library.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const bundled = bookFromText({ id: "book:us-constitution", title: "Constitution", raw: read("assets/books/us_constitution.ybk") }).pages;
const layouts = {
  cdoc: JSON.parse(read("eval/fixtures/r10/govinfo_constitution_pages.json")),
  hman: JSON.parse(read("eval/fixtures/r11/hman117_constitution_pages.json"))
};
const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth", "twenty-first", "twenty-second", "twenty-third", "twenty-fourth", "twenty-fifth", "twenty-sixth", "twenty-seventh"];
const questions = [];
for (let n = 1; n <= 27; n += 1) questions.push(n === 2 ? "What's my second amendment" : `what does the ${ORD[n]} amendment say`);
for (let a = 1; a <= 7; a += 1) questions.push(`article ${a} of the constitution`);
for (const s of [1, 2, 3, 8, 9, 10]) questions.push(`article 1 section ${s}`);
questions.push("the preamble", "the bill of rights");

const results = [];
for (const [layout, pages] of Object.entries(layouts)) {
  const entries = [{ meta: { id: layout, title: `CONSTITUTION - GovInfo (${layout})`, url: "https://www.govinfo.gov/" }, body: { pages } }];
  for (const q of questions) {
    const ref = parseSectionRef(q);
    const canon = findSection(bundled, ref);
    const a = documentSectionAnswer(q, { entries, constitutionPages: bundled });
    const quoted = /^"(.*)" \[1\]/m.exec(a?.text || "")?.[1] || "";
    const fromDoc = a?.reader?.bookId === `doc:${layout}`;
    const head = canon ? canon.text.slice(0, 60) : "";
    const exactStart = Boolean(head) && quoted.startsWith(head);
    // Short parts (an amendment) must be the whole canonical text and nothing more.
    const whole = canon && canon.text.length <= 900 ? quoted === canon.text : exactStart;
    const docPage = fromDoc ? findSection(pages, ref)?.page : null;
    const ok = Boolean(a && fromDoc && exactStart && whole && docPage === a.reader.page);
    results.push({ layout, q, ok, page: a?.reader?.page ?? null, fromDoc, whole });
  }
}
const pass = results.filter((r) => r.ok).length;
const fails = results.filter((r) => !r.ok);
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ total: results.length, pass, fails: fails.slice(0, 20) }, null, 1));
  if (process.argv.includes("--strict") && fails.length) process.exit(1);
}
export { results };
