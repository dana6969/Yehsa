// Document titles as a person would write them. Pure.
/**
 * R8: a document title as a person would write it. "(PDF) An Encyclopedia of Everything | Academia"
 * -> "An Encyclopedia of Everything"; "First Children s Encyclopedia" -> "First Children's Encyclopedia";
 * "Encyclopedia_of_World_History.pdf" -> "Encyclopedia of World History".
 */
export function cleanDocTitle(raw) {
  let t = String(raw || "").replace(/\s+/g, " ").trim();
  t = t.replace(/^\s*[[(]?(?:PDF|EPUB|TXT|DOC|DOCX)[\])]?\s*[-:–]?\s*/i, "");
  t = t.replace(/\s+[|–—-]\s+(?:Academia(?:\.edu)?|Internet Archive|archive\.org|Scribd|PDF Drive|Google Books|ResearchGate|Free Download.*|Download.*)$/i, "");
  t = t.replace(/\s*:\s*Free Download, Borrow, and Streaming\s*:.*$/i, "");
  t = t.replace(/\.(?:pdf|epub|txt)$/i, "");
  if (!/\s/.test(t) && /[_-]/.test(t)) t = t.replace(/[_-]+/g, " ");
  // A possessive whose apostrophe was lost ("Children s", "World s").
  t = t.replace(/\b([A-Za-z]{2,}) s\b(?=\s|$)/g, "$1's");
  t = t.replace(/\s+/g, " ").trim();
  return t || String(raw || "").trim();
}

