// R8: which path a typed question takes on the phone before the field notes are asked. One pure
// function, used by Ask (YehsaApp) and by the dev flows (eval/dev_r8_flows.mjs), so the order is
// tested, not just written down:
//   1. a whole-book request ("summary of kubark", "chapters of ATP 3-50.21", "open the Bible")
//   2. a named saved document ("using The Encyclopedia of World History you just read: ...")
//   3. a broad many-part analysis question (synthesis across everything on the phone)
//   4. R9: a short two-sided history question ("Muslims and Romans"): how the two relate
//   null: the ordinary path (field notes, then documents, learned notes, the web)
import { parseSectionRef } from "../docs/section_ref.js";
import { sectionLookup } from "../docs/section_answer.js";
import { planBookRequest } from "../library/book_request.js";
import { docReference } from "./doc_reference.js";
import { isSynthesisQuestion } from "./question_parts.js";
import { relationQuestion } from "./relation.js";

export function routeAsk(text, { entries = [], recentFound = null, docs = [] } = {}) {
  // R10: "what's my second amendment", "article 1 section 8 of the constitution", "the preamble":
  // the exact part of the Constitution (a downloaded copy first, else the one bundled on the phone).
  const section = parseSectionRef(text);
  if (section?.constitution && sectionLookup(text, section)) return { kind: "section", section };
  const book = planBookRequest(text, { entries, recentFound });
  if (book) return { kind: "book", book };
  const named = docReference(text, docs);
  if (named) return { kind: "named-doc", named };
  if (isSynthesisQuestion(text)) return { kind: "synthesis" };
  const relation = relationQuestion(text);
  if (relation) return { kind: "relation", relation };
  return null;
}
