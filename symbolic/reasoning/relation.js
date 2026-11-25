// R9: a short question that names two peoples, faiths or powers ("Muslims and Romans", "Vikings vs
// Saxons") asks how they relate. It is answered from what Yehsa has read: passages that name both
// (Documented, quoted with the page), then what those passages are mostly about and when
// (Yehsa's inference, labelled). Nothing fits: one short clarifying question, never random quotes.
// Rule based and extractive. Not on getMappedAction's path.
import { search, stem, terms } from "./bm25.js";
import { CONCEPTS } from "./concepts.js";
import { indexOf, pageWord, q, sentencesOfHit } from "./doc_reasoner.js";
import { entitiesIn } from "../understanding/taxonomy.js";

// Each history name with the words older books use for it ("Moslem", "Saracen", "Byzantine").
const PEOPLES = {
  muslims: { label: "Muslims", words: "muslim muslims moslem moslems moslim moslims mussulman islam islamic mohammedan mohammedans saracen saracens arab arabs arabia caliph caliphs caliphate muhammad mohammed mahomet" },
  romans: { label: "Romans", words: "roman romans rome byzantine byzantium constantinople caesar caesars" },
  christians: { label: "Christians", words: "christian christians christianity christendom church" },
  jews: { label: "Jews", words: "jew jews jewish judaism israel israelites hebrew hebrews judea" },
  persians: { label: "Persians", words: "persian persians persia sassanid sassanids parthian parthians" },
  greeks: { label: "Greeks", words: "greek greeks greece athens athenian hellenic hellenes sparta" },
  mongols: { label: "Mongols", words: "mongol mongols mongolia genghis khan khans tartar tartars" },
  vikings: { label: "Vikings", words: "viking vikings norse northmen norsemen danes" },
  turks: { label: "Turks", words: "turk turks turkish ottoman ottomans seljuk seljuks" },
  egyptians: { label: "Egyptians", words: "egypt egyptian egyptians pharaoh pharaohs" },
  chinese: { label: "the Chinese", words: "china chinese han tang" },
  franks: { label: "Franks", words: "frank franks frankish charlemagne gaul gauls" },
  goths: { label: "Goths", words: "goth goths gothic visigoths ostrogoths" },
  huns: { label: "Huns", words: "huns attila" },
  celts: { label: "Celts", words: "celt celts celtic britons druids" },
  normans: { label: "Normans", words: "norman normans normandy" },
  saxons: { label: "Saxons", words: "saxon saxons anglo" },
  crusaders: { label: "Crusaders", words: "crusade crusades crusader crusaders" },
  carthaginians: { label: "Carthaginians", words: "carthage carthaginian carthaginians hannibal punic" },
  babylonians: { label: "Babylonians", words: "babylon babylonian babylonians assyria assyrian assyrians" },
  macedonians: { label: "Macedonians", words: "macedonia macedonian macedonians alexander" },
  indians: { label: "India", words: "india indian hindu hindus" },
  buddhists: { label: "Buddhists", words: "buddhist buddhists buddhism buddha" },
  english: { label: "the English", words: "england english britain british" },
  french: { label: "the French", words: "france french" },
  spanish: { label: "the Spanish", words: "spain spanish spaniards" },
  aztecs: { label: "Aztecs", words: "aztec aztecs mexico" },
  russians: { label: "Russians", words: "russia russian russians muscovy" },
  germans: { label: "Germans", words: "germany german germans" },
  japanese: { label: "the Japanese", words: "japan japanese" }
};
const WORD_TO_PEOPLE = new Map();
for (const [id, p] of Object.entries(PEOPLES)) {
  p.stems = [...new Set(p.words.split(" ").map(stem))];
  for (const w of p.words.split(" ")) if (!WORD_TO_PEOPLE.has(w)) WORD_TO_PEOPLE.set(w, id);
}

const PAIR = /^(?:(?:what about|tell me about|how about|what (?:was|is) the (?:relationship|relation|history) between|how did|how do|how were|compare)\s+)?(?:the\s+)?([a-z][a-z' -]{1,30}?)\s+(?:and|vs\.?|versus|v\.?|&|against|with)\s+(?:the\s+)?([a-z][a-z' -]{1,30}?)(?:\s+(?:relations?|relationship|history|interact|get along|meet|fight|compare))?\s*[?.!]*$/i;

function peopleOf(side) {
  const words = String(side || "").toLowerCase().split(/[^a-z']+/).filter(Boolean);
  if (!words.length || words.length > 3) return null;
  for (const w of words) {
    const id = WORD_TO_PEOPLE.get(w) || WORD_TO_PEOPLE.get(w.replace(/s$/, ""));
    if (id) return id;
  }
  return null;
}

/** { a, b } (people ids) when a short question names two peoples or powers, else null. */
export function relationQuestion(text) {
  const raw = String(text || "").trim();
  if (raw.split(/\s+/).length > 10) return null;
  const m = raw.match(PAIR);
  if (!m) return null;
  // A field question that happens to say "and" ("deer and elk", "fire and water") is not history.
  if (entitiesIn(raw).length) return null;
  const a = peopleOf(m[1]);
  const b = peopleOf(m[2]);
  if (!a || !b || a === b) return null;
  return { a, b, labels: [PEOPLES[a].label, PEOPLES[b].label] };
}

function has(text, people) {
  const have = new Set(terms(text));
  return PEOPLES[people].stems.some((s) => have.has(s));
}

const CENTURY = /\b(\d{1,2})(?:st|nd|rd|th) century\b/gi;
const YEAR = /\b(?:A\.?\s?D\.?\s*)?([1-9]\d{2,3})\b(?!\s*(?:B\.?\s?C|pages?|miles|men|feet))/g;
const ORD = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

function when(sentences) {
  const cents = [];
  for (const s of sentences) {
    for (const m of s.text.matchAll(CENTURY)) cents.push(Number(m[1]));
    for (const m of s.text.matchAll(YEAR)) {
      const y = Number(m[1]);
      if (y >= 100 && y <= 2000) cents.push(Math.floor((y - 1) / 100) + 1);
    }
  }
  if (!cents.length) return null;
  const count = new Map();
  for (const c of cents) count.set(c, (count.get(c) || 0) + 1);
  const top = [...count.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(0, 2).map(([c]) => c).sort((x, y) => x - y);
  return top.length === 2 && top[1] - top[0] === 1 ? `the ${ORD(top[0])} and ${ORD(top[1])} centuries CE` : `the ${ORD(top[0])} century CE`;
}

/** The two-sided answer, or null when nothing read names both. */
export function relationAnswer(question, sources, rel = relationQuestion(question)) {
  if (!rel) return null;
  const usable = (sources || []).filter((s) => s?.chunks?.length);
  const query = [...PEOPLES[rel.a].stems, ...PEOPLES[rel.b].stems];
  const pool = [];
  for (const source of usable) {
    const lift = source.docId ? 1.3 : 1;
    for (const hit of search(indexOf(source), query, { k: 12 })) {
      if (!has(hit.chunk.text, rel.a) || !has(hit.chunk.text, rel.b)) continue;
      const sentences = sentencesOfHit(source, hit);
      // Two sentences in a row that name one side each are quoted together, word for word.
      const spans = [];
      for (let i = 0; i < sentences.length; i += 1) {
        spans.push(sentences[i]);
        const next = sentences[i + 1];
        if (next && hit.chunk.text.includes(`${sentences[i].text} ${next.text}`) && (`${sentences[i].text} ${next.text}`).length <= 480) {
          const joined = { ...sentences[i], text: `${sentences[i].text} ${next.text}` };
          if (has(joined.text, rel.a) && has(joined.text, rel.b) && !(has(sentences[i].text, rel.a) && has(sentences[i].text, rel.b)) && !(has(next.text, rel.a) && has(next.text, rel.b))) spans.push(joined);
        }
      }
      for (let i = 0; i < spans.length; i += 1) {
        const s = spans[i];
        const both = has(s.text, rel.a) && has(s.text, rel.b);
        const one = has(s.text, rel.a) || has(s.text, rel.b);
        if (!one) continue;
        // Prose over a line from a date table: longer sentences that name both rank first.
        const prose = Math.min(1, s.text.length / 160);
        pool.push({ ...s, both, chunkText: hit.chunk.text, score: ((both ? 3 : 1) + prose) * lift + hit.score / 40 });
      }
    }
  }
  pool.sort((x, y) => y.score - x.score);
  const picked = [];
  for (const s of pool) {
    if (picked.length >= 4) break;
    if (!s.both && picked.filter((p) => !p.both).length >= 1) continue;
    if (picked.some((p) => p.text.includes(s.text) || s.text.includes(p.text))) continue;
    picked.push(s);
  }
  if (!picked.some((p) => p.both)) return null;
  const [A, B] = rel.labels;
  // The ideas these passages share most, counted by word (war and conquest, faith and religion...).
  const said = terms(picked.map((p) => p.text).join(" "));
  const themes = CONCEPTS.map((c) => ({ label: c.label, n: said.filter((t) => c.stems.has(t)).length }))
    .filter((c) => c.n >= 2).sort((x, y) => y.n - x.n).slice(0, 2);
  const era = when(picked) || when(picked.map((p) => ({ text: p.chunkText || "" })));
  const pages = [...new Set(picked.map((p) => `${p.source.title}, ${pageWord(p.source)} ${p.page}`))];
  const inference = [
    `Yehsa's inference: in what I've read, ${A} and ${B} meet mainly through ${themes.length ? themes.map((t) => t.label).join(", and ") : "the events quoted above"}${era ? `, mostly in ${era}` : ""}.`,
    `Reason: that is what ${picked.length === 1 ? "this passage is" : `these ${picked.length} passages are`} about (${pages.slice(0, 3).join("; ")}). It's my reading of them, not a verdict any of them states, and it only covers what is on this phone.`
  ].join(" ");
  const opener = `You asked about ${A} and ${B}. I read it as: how did they relate in history? Here is what the sources on this phone say. "Documented" lines are quoted with the page; "Yehsa's inference" is my own reading of them.`;
  const documented = `Documented:\n${picked.map(q).join("\n")}`;
  const text = [opener, documented, inference].join("\n\n");
  const first = picked[0];
  return {
    answered: true,
    voiced: true,
    kind: "doc-reasoned",
    noOffer: true,
    opener,
    text,
    sections: [{ title: null, text: opener }, { title: null, text: documented }, { title: null, text: inference }],
    source: [...new Set(picked.map((p) => p.source.title))].join("; "),
    citations: picked.map((p, k) => ({ n: k + 1, sourceId: p.source.id, sourceName: p.source.title, title: p.source.title, ref: `${pageWord(p.source)} ${p.page}`, page: p.page })),
    reader: first?.source?.readerId ? { bookId: first.source.readerId, page: first.page, title: first.source.title } : null,
    confident: false
  };
}

/** The one short question when nothing read names both. */
export function relationClarify(rel) {
  const [A, B] = rel.labels;
  return `Do you mean how ${A} and ${B} related in history, for example where they met, fought or traded? I don't have a passage on this phone that names both. Save an encyclopedia or a history book ("find an encyclopedia of world history"), or turn on live look-ups, and I'll quote it.`;
}
