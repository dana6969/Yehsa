// R8: which saved document a question means. "using The Encyclopedia of World History you just
// read", "use your saved encyclopedia", "from the encyclopedia", "the document you just read",
// "what does the canning guide say about ...". Fuzzy title match; "you just read" or a bare kind
// word ("the encyclopedia") picks the most recently saved match. Pure.
import { matchTitle } from "../library/library.js";

const KIND_WORDS = "encyclopedia|encyclopaedia|document|pdf|book|manual|guide|handbook|file|report|text|reference|history";
const JUST_READ = "(?:you(?:'ve| have)? (?:just |already )?(?:read|saved|downloaded|learned)|i (?:just )?(?:downloaded|saved|gave you|sent you)|(?:just |recently )?(?:saved|downloaded))";

const NAMED = [
  // "using The Encyclopedia of World History you just read"
  new RegExp(`\\b(?:using|use|from|in|according to|based on|per|with|out of|consult(?:ing)?)\\s+(?:the |my |your |that |this )?(.{3,90}?)\\s+${JUST_READ}\\b`, "i"),
  // "use your saved encyclopedia", "from my downloaded world history pdf"
  new RegExp(`\\b(?:your|my|the|that) (?:saved|downloaded) ((?:[\\w'-]+ ){0,5}?(?:${KIND_WORDS}))\\b`, "i"),
  // "the encyclopedia you just read", "the document you read"
  new RegExp(`\\b(?:the|that|this) ((?:[\\w'-]+ ){0,4}?(?:${KIND_WORDS})) ${JUST_READ}\\b`, "i"),
  // "from the encyclopedia", "according to the encyclopedia", "in the encyclopedia of world history"
  new RegExp(`\\b(?:from|in|according to|using|use|per|based on) (?:the|my|your) ((?:encyclopa?edia)(?: of [\\w' -]{3,40}?)?)(?=[,.;:?!]|\\s+(?:what|how|why|when|which|who|say|says|about|as|to|for|and|tell)\\b|$)`, "i"),
  // "what does The Encyclopedia of World History say about"
  /\bwhat (?:does|do) (?:the |my |your )?(.{3,80}?) (?:say|says|tell (?:me|us)) about\b/i
];

const GENERIC = new RegExp(`^(?:(?:saved|downloaded|new|last|latest|whole) )*(?:${KIND_WORDS})s?$`, "i");

function recent(docs) {
  return [...docs].sort((a, b) => (Number(b.fetchedAt) || 0) - (Number(a.fetchedAt) || 0))[0] || null;
}

/** docs: the saved documents' catalog entries. Returns { doc, how, phrase } or null. */
export function docReference(question, docs) {
  const list = (docs || []).filter((d) => d && d.id && d.title);
  if (!list.length) return null;
  const q = String(question || "");
  for (const rule of NAMED) {
    const m = rule.exec(q);
    if (!m) continue;
    const phrase = m[1].replace(/^(?:the|my|your|that|this)\s+/i, "").replace(/\s+(?:as|for|to)$/i, "").trim();
    if (phrase.length < 3 || /^(?:your|my|the|it|that|this|them|one)$/i.test(phrase)) continue;
    const justRead = new RegExp(JUST_READ, "i").test(m[0]);
    if (GENERIC.test(phrase)) {
      const kind = phrase.toLowerCase().replace(/^(?:(?:saved|downloaded|new|last|latest|whole) )+/, "").replace(/s$/, "");
      const same = /^(?:document|pdf|file|text)$/.test(kind) ? list : list.filter((d) => d.title.toLowerCase().includes(kind.slice(0, 8)));
      const doc = recent(same.length ? same : justRead ? list : []);
      if (doc) return { doc, how: "recent", phrase };
      continue;
    }
    const entries = list.map((d) => ({ id: d.id, title: d.title, aliases: [], doc: d }));
    const hit = matchTitle(entries, phrase);
    if (hit) {
      // Several close matches ("Encyclopedia Of", "The Encyclopedia of World History"): the best
      // score wins; on a tie, the most recently saved.
      const ties = entries.filter((e) => matchTitle([e], phrase)?.score >= hit.score - 1e-9).map((e) => e.doc);
      return { doc: ties.length > 1 ? recent(ties) : hit.entry.doc, how: "named", phrase };
    }
    if (justRead) {
      const doc = recent(list);
      if (doc) return { doc, how: "recent", phrase };
    }
  }
  return null;
}
