// R10: questions that name a numbered or titled part of a document ("what's my second amendment",
// "2nd amendment", "amendment II", "article 1 section 8", "chapter 3", "preamble", "bill of rights").
// parseSectionRef reads the question; findSection finds that exact heading in a document's pages
// (GovInfo/CONAN PDF layout "ARTICLE [II.]", National Archives "AMENDMENT II" / "Article. I.",
// the 1789 resolution's "Article the fourth...", plain "Chapter 3") and returns the text under it.
// A note that only mentions "the second article" is never a heading. Pure; no network.

const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };
const ORD_UNITS = ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
const ORD_TENS = { twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50 };

export const ORDINAL_NAMES = ORD_UNITS;

function wordValue(w) {
  const u = UNITS.indexOf(w);
  if (u > 0) return u;
  const o = ORD_UNITS.indexOf(w);
  if (o > 0) return o;
  if (TENS[w]) return TENS[w];
  if (ORD_TENS[w]) return ORD_TENS[w];
  return null;
}

const ROMAN = { i: 1, v: 5, x: 10, l: 50, c: 100 };
export function romanValue(text) {
  const s = String(text || "").toLowerCase();
  if (!/^[ivxlc]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i += 1) {
    const v = ROMAN[s[i]];
    const next = ROMAN[s[i + 1]] || 0;
    total += v < next ? -v : v;
  }
  // Only well-formed numerals ("iv", not "iiii" or "vx").
  return toRoman(total) === s ? total : null;
}
export function toRoman(n) {
  let out = "";
  for (const [v, s] of [[100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]]) {
    while (n >= v) { out += s; n -= v; }
  }
  return out;
}

/** "2", "2nd", "II", "two", "second", "twenty first", "twenty-seventh" -> number, or null. */
export function numberValue(token) {
  const t = String(token || "").toLowerCase().replace(/[.\]\[]/g, "").replace(/-/g, " ").trim();
  if (!t) return null;
  let m = /^(\d{1,3})(?:st|nd|rd|th)?$/.exec(t);
  if (m) return Number(m[1]);
  const parts = t.split(/\s+/);
  if (parts.length === 2 && TENS[parts[0]]) {
    const u = wordValue(parts[1]);
    return u && u < 10 ? TENS[parts[0]] + u : null;
  }
  if (parts.length === 1) {
    const w = wordValue(t);
    if (w) return w;
    return romanValue(t);
  }
  return null;
}

const WORDS = [...UNITS.slice(1), ...ORD_UNITS.slice(1), ...Object.keys(TENS), ...Object.keys(ORD_TENS)].join("|");
const NUM = `(?:\\d{1,3}(?:st|nd|rd|th)?|(?:twenty|thirty|forty|fifty)[ -](?:${[...UNITS.slice(1, 10), ...ORD_UNITS.slice(1, 10)].join("|")})|${WORDS}|[ivxlc]{1,7})`;
const ORDINAL = `(?:\\d{1,3}(?:st|nd|rd|th)|(?:twenty|thirty|forty|fifty)[ -](?:${ORD_UNITS.slice(1, 10).join("|")})|${[...ORD_UNITS.slice(1), ...Object.keys(ORD_TENS)].join("|")})`;

const RX = {
  ordAmend: new RegExp(`\\b(${ORDINAL})\\s+amendment\\b`),
  amendNum: new RegExp(`\\bamendment\\s+(?:no\\.?\\s*|number\\s+)?(${NUM})\\b`),
  artSec: new RegExp(`\\barticle\\s+(${NUM})\\s*,?\\s*(?:section|sec\\.?|§)\\s*(${NUM})\\b`),
  secOfArt: new RegExp(`\\b(?:section|sec\\.?|§)\\s*(${NUM})\\s+of\\s+(?:the\\s+)?article\\s+(${NUM})\\b`),
  secOfOrdArt: new RegExp(`\\b(?:section|sec\\.?|§)\\s*(${NUM})\\s+of\\s+(?:the\\s+)?(${ORDINAL})\\s+article\\b`),
  artNum: new RegExp(`\\barticle\\s+(${NUM})\\b`),
  ordArt: new RegExp(`\\b(${ORDINAL})\\s+article\\b`),
  chapter: new RegExp(`\\bchapter\\s+(${NUM})\\b`),
  ordChapter: new RegExp(`\\b(${ORDINAL})\\s+chapter\\b`),
  section: new RegExp(`(?:\\bsection|\\bsec\\.?|§)\\s*(${NUM})\\b`),
  part: new RegExp(`\\bpart\\s+(${NUM})\\b`),
  title: new RegExp(`\\btitle\\s+(${NUM})\\b`)
};

const CONSTITUTION_WORDS = /\b(constitution(?:al)?|bill of rights|amendment|preamble|founding fathers|framers)\b/;

/**
 * The part of a document a question names, or null:
 * { kind: "amendment"|"article"|"chapter"|"section"|"part"|"title"|"preamble"|"bill-of-rights", n, section, constitution, label }
 */
export function parseSectionRef(question) {
  const q = ` ${String(question || "").toLowerCase().replace(/[\u2019']/g, "'").replace(/[?!,;:"]/g, " ").replace(/\s+/g, " ")} `;
  const constitution = CONSTITUTION_WORDS.test(q);
  const num = (t) => numberValue(t);
  let m;
  const out = (ref) => (ref && (ref.n == null || (ref.n >= 1 && ref.n <= 200)) && (ref.section == null || ref.section >= 1) ? { constitution, ...ref, label: refLabel(ref) } : null);
  if (/\bpreamble\b/.test(q)) return out({ kind: "preamble", n: null, constitution: true });
  if ((m = RX.ordAmend.exec(q))) return out({ kind: "amendment", n: num(m[1]), constitution: true });
  if ((m = RX.amendNum.exec(q))) {
    const n = num(m[1]);
    // "amendment i think" is not Amendment I; a lone "i" needs the question to end there or a capital I.
    if (m[1] === "i" && !/\bamendment\s+i\s*$/.test(q.trim()) && !/\b[Aa]mendment\s+I\b/.test(String(question))) return null;
    return out({ kind: "amendment", n, constitution: true });
  }
  if (/\bbill of rights\b/.test(q) && !/\b(?:amendment|article)\b/.test(q)) return out({ kind: "bill-of-rights", n: null, constitution: true });
  if ((m = RX.artSec.exec(q))) return out({ kind: "article", n: num(m[1]), section: num(m[2]) });
  if ((m = RX.secOfArt.exec(q)) || (m = RX.secOfOrdArt.exec(q))) return out({ kind: "article", n: num(m[2]), section: num(m[1]) });
  if ((m = RX.artNum.exec(q))) {
    if (m[1] === "i" && !/\b[Aa]rticle\s+I\b/.test(String(question)) && !/\barticle\s+i\s*$/.test(q.trim())) return null;
    return out({ kind: "article", n: num(m[1]) });
  }
  if ((m = RX.ordArt.exec(q))) return out({ kind: "article", n: num(m[1]) });
  if ((m = RX.chapter.exec(q)) || (m = RX.ordChapter.exec(q))) return out({ kind: "chapter", n: num(m[1]) });
  if ((m = RX.section.exec(q))) return out({ kind: "section", n: num(m[1]) });
  if ((m = RX.part.exec(q))) return out({ kind: "part", n: num(m[1]) });
  if ((m = RX.title.exec(q))) return out({ kind: "title", n: num(m[1]) });
  return null;
}

function ordinalWord(n) {
  if (n < 20) return ORD_UNITS[n];
  const tens = Math.floor(n / 10) * 10;
  const tensWord = Object.keys(TENS).find((k) => TENS[k] === tens);
  const ordTens = Object.keys(ORD_TENS).find((k) => ORD_TENS[k] === tens);
  return n % 10 === 0 ? ordTens : `${tensWord}-${ORD_UNITS[n % 10]}`;
}

export function refLabel(ref) {
  if (!ref) return "";
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (ref.kind === "preamble") return "the Preamble";
  if (ref.kind === "bill-of-rights") return "the Bill of Rights";
  if (ref.kind === "amendment") return `Amendment ${toRoman(ref.n).toUpperCase()} (the ${cap(ordinalWord(ref.n))} Amendment)`;
  if (ref.kind === "article") return `Article ${toRoman(ref.n).toUpperCase()}${ref.section ? `, Section ${ref.section}` : ""}`;
  return `${cap(ref.kind)} ${ref.n}`;
}

// ---------- finding the heading in the text ----------

const NOISE = [/^VerDate\b/, /^\(\d{1,3}\)$/, /^\d{1,3}\s+CONSTITUTION OF THE UNITED STATES$/i, /^CONSTITUTION OF THE UNITED STATES\s+\d{1,3}$/i, /^Continued$/i, /^\d{1,4}$/, /^Page \d+( of \d+)?$/i];
const ORD_ALT = ORD_UNITS.slice(1).join("|");

function classify(line) {
  const t = line.trim();
  if (/^we the people of the united states/i.test(t)) return { type: "preamble", rest: t };
  let m;
  // The 1789 resolution runs each article into its text on one line: "Article the fourth... A well regulated".
  if ((m = new RegExp(`^article the (${ORD_ALT})\\b[.…\\s]*(.*)$`, "i").exec(t))) return { type: "articleThe", n: numberValue(m[1]), rest: m[2] };
  if (!t || t.length > 160) return null;
  if ((m = /^amendment\s+\[?([ivxlc]+|\d{1,2})\.?\]?\.?(?:\s+\d{1,2})?$/i.exec(t))) return { type: "amend", n: numberValue(m[1]) };
  if ((m = new RegExp(`^(${ORD_ALT}|twenty-(?:${ORD_UNITS.slice(1, 8).join("|")}))\\s+amendment\\b.{0,40}$`, "i").exec(t)) && t === t.toUpperCase()) return { type: "amend", n: numberValue(m[1]) };
  if ((m = /^article\.?\s+(\[)?([ivxlc]+|\d{1,2})\.?\]?\.?(?:\s+\d{1,2})?$/i.exec(t))) return { type: "article", n: numberValue(m[2]), bracketed: Boolean(m[1]) };
  if ((m = /^(?:section|sec)\.?\s*(\d{1,3})\.?\s*(.*)$/i.exec(t)) || (m = /^§\s*(\d{1,3})\.?\s*(.*)$/.exec(t))) return { type: "section", n: Number(m[1]), rest: m[2] };
  if ((m = new RegExp(`^chapter\\s+([ivxlc]+|\\d{1,3}|${WORDS})\\b[.:\\s-]*(.{0,80})$`, "i").exec(t))) return { type: "chapter", n: numberValue(m[1]), rest: m[2] };
  if ((m = new RegExp(`^part\\s+([ivxlc]+|\\d{1,3}|${WORDS})\\b[.:\\s-]*(.{0,80})$`, "i").exec(t))) return { type: "part", n: numberValue(m[1]), rest: m[2] };
  if ((m = new RegExp(`^title\\s+([ivxlc]+|\\d{1,3})\\b[.:\\s-]*(.{0,80})$`, "i").exec(t))) return { type: "title", n: numberValue(m[1]), rest: m[2] };
  if (/^(?:articles in addition to,? and amendments? of|amendments? to the constitution|the bill of rights$|amendments (?:xi|11)\b)/i.test(t)) return { type: "amendStart" };
  if (/^preamble$/i.test(t) || /^we the people of the united states/i.test(t)) return { type: "preamble", rest: /^preamble$/i.test(t) ? "" : t };
  return null;
}

/** pages: page strings. Returns [{ page, text, head }] lines with noise dropped. */
function linesOf(pages) {
  const out = [];
  (pages || []).forEach((p, i) => {
    const text = typeof p === "string" ? p : p?.text || "";
    for (const raw of text.split(/\n/)) {
      const t = raw.replace(/\s+/g, " ").trim();
      if (!t || NOISE.some((rx) => rx.test(t))) continue;
      out.push({ page: i + 1, text: t, head: classify(t) });
    }
  });
  return out;
}

// A footnote or editor's note in the CONAN/GovInfo layout, or the archives' own notes.
const NOTE = /^(?:\d{1,2}(?=This |The first|Only |See |The amendment|Ratification|Section \d)|note:|the (?:\w+[- ])?\w+ amendment to the constitution|this (?:clause|sentence|section|article) has been|the amendment was|ratification was completed|passed by congress|originally proposed)/i;
const RATIFIED = /\b(?:Ratified|ratification was completed on|ratified on|were ratified|was ratified)\s+(?:on\s+)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})/i;

function bodyFrom(lines, at, stopTypes, rest = "") {
  const parts = rest ? [rest] : [];
  let ratified = null;
  let chars = rest.length;
  for (let k = at + 1; k < lines.length; k += 1) {
    const line = lines[k];
    if (line.head && stopTypes.has(line.head.type)) break;
    if (NOTE.test(line.text)) {
      const r = RATIFIED.exec(line.text);
      if (r && !ratified) ratified = r[1];
      // Notes after the text end it; a note right under the heading is skipped.
      if (parts.length) break;
      continue;
    }
    parts.push(line.text);
    chars += line.text.length;
    if (chars > 2400) break;
  }
  return { text: joinLines(parts), ratified, pages: [lines[at].page] };
}

function joinLines(parts) {
  let out = "";
  for (const p of parts) {
    if (!out) { out = p; continue; }
    // A word broken at the line end ("free-\nState" keeps the hyphen only when both halves are words).
    if (/[a-z]-$/.test(out) && /^[a-z]/.test(p)) out = out.slice(0, -1) + p;
    else out += ` ${p}`;
  }
  // GovInfo prints clause numbers glued to the text ("1The Congress shall have Power").
  return out.replace(/(^|[\s.;:])\d{1,2}(?=[A-Z][a-z])/g, "$1").replace(/\s+/g, " ").trim();
}

const HEAD_STOPS = new Set(["amend", "article", "articleThe", "amendStart"]);

function bestOf(cands, lines, stops) {
  let best = null;
  for (const c of cands) {
    const body = bodyFrom(lines, c.at, stops, c.rest || "");
    // A table of contents line or an empty heading has no body to quote.
    if (body.text.length < 25) continue;
    const toc = /(?:\.{3,}|\s)\d{1,4}$/.test(lines[c.at].text) ? 1 : 0;
    const score = Math.min(body.text.length, 600) - toc * 500 + (c.bonus || 0);
    if (!best || score > best.score) best = { ...c, body, score };
  }
  return best;
}

/** The part of the pages that ref names: { page, heading, text, ratified } or null. */
export function findSection(pages, ref) {
  if (!ref) return null;
  const lines = linesOf(pages);
  if (!lines.length) return null;
  const amendStart = lines.findIndex((l) => l.head?.type === "amendStart");
  // Without a marker, the amendments start where article numbering starts again at I.
  let restart = -1;
  if (amendStart < 0) {
    let seen = false;
    lines.forEach((l, i) => {
      if (restart >= 0 || l.head?.type !== "article" || l.head.n !== 1) return;
      if (seen) restart = i;
      seen = true;
    });
  }
  const amendFrom = amendStart >= 0 ? amendStart : restart;
  const at = (pred) => lines.map((l, i) => (l.head && pred(l.head, i) ? { at: i, rest: l.head.rest || "" } : null)).filter(Boolean);
  let hit = null;
  if (ref.kind === "amendment") {
    const cands = [
      ...at((h) => h.type === "amend" && h.n === ref.n).map((c) => ({ ...c, bonus: 50 })),
      ...at((h, i) => h.type === "article" && h.n === ref.n && (h.bracketed || (amendFrom >= 0 && i > amendFrom))),
      // The 1789 resolution: Article the third is the First Amendment ... the twelfth is the Tenth.
      ...(ref.n <= 10 ? at((h) => h.type === "articleThe" && h.n === ref.n + 2) : [])
    ];
    hit = bestOf(cands, lines, new Set([...HEAD_STOPS, "preamble"]));
    if (hit && !hit.body.ratified && ref.n <= 10) {
      const note = lines.map((l) => l.text).join(" ");
      const m = /(?:ratification was completed on|amendments were ratified|amendments? (?:were|was) ratified by three-fourths of the state legislatures on|ratified)\s+((?:December) 15, 1791)/i.exec(note);
      if (m) hit.body.ratified = m[1];
    }
  } else if (ref.kind === "article") {
    const cands = at((h, i) => h.type === "article" && h.n === ref.n && !h.bracketed && (amendFrom < 0 || i < amendFrom));
    if (ref.section) {
      const art = bestOf(cands, lines, HEAD_STOPS);
      if (art) {
        const end = lines.findIndex((l, i) => i > art.at && l.head && HEAD_STOPS.has(l.head.type));
        const secs = at((h, i) => h.type === "section" && h.n === ref.section && i > art.at && (end < 0 || i < end));
        hit = bestOf(secs, lines, new Set([...HEAD_STOPS, "section"]));
      }
    } else {
      hit = bestOf(cands, lines, new Set([...HEAD_STOPS]));
    }
  } else if (ref.kind === "preamble") {
    const i = lines.findIndex((l) => l.head?.type === "preamble" && l.head.rest);
    if (i >= 0) hit = { at: i, body: { text: lines[i].text + " " + bodyFrom(lines, i, new Set([...HEAD_STOPS, "section"])).text, ratified: null } };
    if (hit) hit.body.text = hit.body.text.replace(/\s+/g, " ").trim();
  } else if (ref.kind === "bill-of-rights") {
    const first = findSection(pages, { kind: "amendment", n: 1 });
    if (first) return { ...first, heading: "The Bill of Rights", billOfRights: true };
    return null;
  } else {
    const cands = at((h) => h.type === ref.kind && h.n === ref.n);
    hit = bestOf(cands, lines, new Set([ref.kind, ...(ref.kind === "section" ? ["chapter", "part", "article"] : []), ...(ref.kind === "chapter" ? ["part"] : [])]));
  }
  if (!hit) return null;
  return { page: lines[hit.at].page, heading: lines[hit.at].text, text: hit.body.text, ratified: hit.body.ratified || null };
}

/** The first whole sentences of a section, up to about max characters. */
export function sectionQuote(text, max = 700) {
  const t = String(text || "").trim();
  if (t.length <= max) return { text: t, more: false };
  const sentences = t.match(/[^.!?]+[.!?]+["”')\]]?\s*/g) || [t];
  let out = "";
  for (const s of sentences) {
    if (out && (out + s).length > max) break;
    out += s;
  }
  out = out.trim() || t.slice(0, max).replace(/\s+\S*$/, "") + "…";
  return { text: out, more: out.length < t.length };
}
