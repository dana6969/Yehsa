// Pages -> sections a person can be pointed to: "page 30, BITES AND STINGS". PDF lines are joined
// back into paragraphs, running headers and footers are dropped, and headings are carried forward.

const FURNITURE_MIN_PAGES = 4;

function norm(line) {
  return line.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
}

/** Lines that repeat on many pages (running heads, "Page 30 of 233") are page furniture. */
export function furnitureLines(pages) {
  const counts = new Map();
  for (const page of pages) {
    const lines = page.split("\n").map((l) => l.trim()).filter(Boolean);
    const edge = new Set([...lines.slice(0, 3), ...lines.slice(-3)].map(norm));
    for (const key of edge) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const min = Math.max(FURNITURE_MIN_PAGES, Math.ceil(pages.length * 0.2));
  return new Set([...counts].filter(([key, n]) => n >= min && key.length < 120).map(([key]) => key));
}

export function isHeading(line) {
  const text = line.trim();
  if (text.length < 3 || text.length > 90) return false;
  if (/[.,;:]$/.test(text) && !/^(?:chapter|section|part|appendix)\b/i.test(text)) return false;
  if (!/[A-Za-z]{2}/.test(text)) return false;
  // Dates, page labels and table rows ("September 19, 2026", "2-22 ATP 3-50.21") are not headings.
  if (text.replace(/[^A-Za-z]/g, "").length < text.replace(/\s/g, "").length * 0.6) return false;
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d/i.test(text)) return false;
  if (/^(?:chapter|section|part|appendix|annex)\s+[\dA-Z]+\b/i.test(text)) return true;
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) return true;
  const words = text.split(/\s+/);
  if (words.length > 9) return false;
  const caps = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
  return words.length >= 1 && words.length <= 6 && caps / words.length >= 0.75 && /^[A-Z]/.test(text);
}

const BULLET = /^(?:[•·\u2022\u00b7\u25aa\u25cf\-*–]|\(?[a-z0-9]{1,2}[.)])\s+/;

/** One page of PDF lines -> paragraphs (each a single line of text). */
export function paragraphs(page, furniture = new Set()) {
  const out = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) out.push(cur.replace(/\s+/g, " ").trim());
    cur = "";
  };
  for (const raw of page.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (furniture.has(norm(line))) continue;
    if (/^(?:page\s+)?\d{1,4}(?:\s+of\s+\d{1,4})?$/i.test(line)) continue;
    if (isHeading(line) && (!cur || /[.!?:"”)]$/.test(cur.trim()) || cur.length < 3)) {
      flush();
      out.push(`#${line}`);
      continue;
    }
    if (BULLET.test(line)) flush();
    else if (cur && /[.!?:]["”)]?$/.test(cur.trim()) && /^[A-Z]/.test(line) && cur.length > 300) flush();
    cur += `${cur ? " " : ""}${line}`;
  }
  flush();
  return out;
}

/**
 * pages: [text]. Returns [{ id, page, heading, text }] where text keeps one paragraph per line.
 * page is 1-based (the PDF page, or the part number for other files).
 */
export function buildSections(pages, { target = 900, max = 1600 } = {}) {
  const furniture = furnitureLines(pages);
  const sections = [];
  let heading = "";
  pages.forEach((page, i) => {
    let buf = [];
    let len = 0;
    let k = 0;
    let startHeading = heading;
    const flush = () => {
      if (len >= 60) sections.push({ id: `p${i + 1}s${k}`, page: i + 1, heading: startHeading, text: buf.join("\n") });
      k += 1;
      buf = [];
      len = 0;
      startHeading = heading;
    };
    for (const para of paragraphs(page, furniture)) {
      if (para.startsWith("#")) {
        if (len >= 200) flush();
        const h = para.slice(1);
        // "Treatment" under "BITES AND STINGS" reads better as one label.
        heading = h.length <= 70 ? h : h.slice(0, 70);
        if (len === 0) startHeading = heading;
        buf.push(h);
        len += h.length;
        continue;
      }
      if (len + para.length > max && len >= target / 2) flush();
      buf.push(para);
      len += para.length;
      if (len >= target) flush();
    }
    flush();
  });
  return sections;
}

/** "page 30" or "part 4", with the heading when there is one. */
export function sectionRef(section, pageKind = "page") {
  const where = `${pageKind === "page" ? "page" : "part"} ${section.page}`;
  return section.heading ? `${where}, ${section.heading}` : where;
}
