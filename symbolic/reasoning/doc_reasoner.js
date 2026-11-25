// R8: answers built from what Yehsa has actually read, part by part, with each claim marked:
//   Documented          a sentence quoted word for word, with its source and page
//   Yehsa's inference   a judgement drawn from those quotes ("which mattered most"), with the reason
//   Yehsa's deduction   a pattern several sources share that none of them states on its own
// Rule-based and extractive: no model, no invented facts. Never on getMappedAction's path; it runs
// only for named-document questions and long many-part questions (see question_parts.js).
import { splitSentences } from "../web/answer_builder.js";
import { STOP, cachedIndex, idf, search, stem, terms } from "./bm25.js";
import { ASK_WORDS, expandTerms, questionParts } from "./question_parts.js";
import { CONCEPTS, conceptsIn, partHints } from "./concepts.js";
import { quoted } from "./quote_clean.js";

const CAUSE = /\b(?:decay\w*|disintegrat\w*|weakness\w*|misfortune\w*|ruin\w*|corrupt\w*|broke through|invad\w*|invasions?|because|due to|caus(?:e|ed|es|ing)|led to|leading to|lead to|contribut\w*|result(?:ed|ing)? (?:of|from|in)|weaken\w*|undermin\w*|declin\w*|collaps\w*|pressure\w*|drain\w*|exhaust\w*|crisis|crises|factors?|reasons?|brought (?:about|down)|helped (?:to )?bring|responsible for|blamed?|threat\w*|could no longer|unable to|failed to|burden\w*|strain\w*)\b/i;
const NOT_FACTOR = new Set(("century centuries year years time times period periods people peoples many much great greater greatest new later early "
  + "first last part parts world history historian historians also made make became become came come took take began begin under within long "
  + "against among number large small own way ways end ended ending fall fell falling decline declined declining collapse cause caused causes "
  + "factor factors reason reasons result resulted led lead contributed contribute weakened weaken crisis pressure threat even still another "
  + "however although though whose itself general important major main several various power became chapter page volume see figure table "
  + "would could might shall must upon thus therefore hence western eastern west east north south ancient modern age ages "
  + "together without beyond rather toward towards everything anything something nothing whole thing things men man every "
  + "almost already always often never perhaps probably indeed instead quite really soon whom whose order sort kind case fact "
  + "force forces spirit living name names place places land lands peninsula river rivers sea seas city cities region regions "
  + "throughout across around along beneath beside despite whereas whether neither either ever amid amidst onward "
  + "province provinces country countries coast island islands valley mountain mountains town towns "
  + "able unable little less least more most better best worse worst high higher low lower good evil true real other others").split(" ").map(stem));

const YEAR = /\b(?:(?:A\.?\s?D\.?|C\.?E\.?)\s*)?(\d{3,4})(?:\s*(?:A\.?\s?D\.?|C\.?E\.?|B\.?\s?C\.?(?:E\.?)?))?(?=[\s,.;:)]|$)/g;

export function pageWord(source) {
  return source.pageKind && source.pageKind !== "page" ? source.pageKind : "page";
}

export function cite(source, page) {
  return `${source.title}, ${pageWord(source)} ${page}`;
}

/** The BM25 index for one source, cached for the session. */
export function indexOf(source) {
  return cachedIndex(source.id, source.version || String(source.chunks.length), () => source.chunks);
}

// OCR noise ("{rj tov Oeov"), verse numbers run together, or mostly capitals: not quotable prose.
function quotable(s) {
  if (/[{}<>|\\]|\b\d+:\d+\b.*\b\d+:\d+\b/.test(s)) return false;
  const words = s.split(/\s+/);
  const odd = words.filter((w) => /^[^A-Za-z]*[A-Za-z][^A-Za-z]*$/.test(w) && !/^[aAI][.,;:]?$/.test(w)).length;
  if (odd / words.length > 0.08) return false;
  const caps = words.filter((w) => /^[A-Z]{3,}/.test(w)).length;
  if (words.length < 7 || /^[_*]/.test(s) || /\d+\s*[-–]\s*\d+\W*$/.test(s)) return false; // index lines ("Decline and Fall, 288-89")
  return caps / words.length < 0.3;
}

export function sentencesOfHit(source, hit) {
  return splitSentences(hit.chunk.text).filter((s) => s.length >= 40 && s.length <= 420 && quotable(s)).map((text) => ({ text, page: hit.chunk.page, source, chunk: hit.chunk.id }));
}

function covers(sentence, wanted) {
  const have = new Set(terms(sentence));
  return wanted.filter((t) => have.has(t)).length;
}

/** Passages of one source about the terms; most of the topic must be in each passage. */
const EVENT = new Set(["fall", "fell", "end", "collaps", "declin", "rise", "overthrow", "sack", "grew", "growth", "rose"].map(stem));

/** The topic words that name the thing (not the event): "roman empire" in "fall of the Roman Empire". */
export function coreTerms(wanted) {
  const core = wanted.filter((t) => !EVENT.has(t));
  return core.length ? core : wanted;
}

function coversAny(text, groups) {
  const have = new Set(terms(text));
  return groups.filter((g) => g.some((t) => have.has(t))).length;
}

function groupsOf(list) {
  // Each wanted word with its synonyms counts once: "rome" or "roman".
  return list.map((t) => [t, ...expandTerms([t]).filter((x) => x !== t)]);
}

/** Passages of one source about the terms; most of the topic's naming words must be in each. */
export function retrieve(source, wanted, { k = 20, extra = [] } = {}) {
  const index = indexOf(source);
  const all = expandTerms(wanted);
  const weights = new Map([...extra.map((t) => [t, 0.4]), ...all.filter((t) => !wanted.includes(t)).map((t) => [t, 0.6])]);
  const groups = groupsOf(coreTerms(wanted));
  const need = groups.length <= 2 ? groups.length : Math.ceil(groups.length * 0.6);
  return search(index, [...all, ...extra], { k: k * 3, weights })
    .filter((h) => coversAny(h.chunk.text, groups) >= need)
    .slice(0, k);
}

function surface(word, sentences) {
  // The word as written most often ("invasions" for the stem "invasion").
  const counts = new Map();
  for (const s of sentences) {
    for (const w of s.text.split(/[^A-Za-z'-]+/)) if (w && stem(w.toLowerCase()) === word) counts.set(w.toLowerCase(), (counts.get(w.toLowerCase()) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || word;
}

function labelFor(term, sentences) {
  // The most common two-word phrase with the term in it ("barbarian invasions"), if it repeats.
  const counts = new Map();
  for (const s of sentences) for (const piece of s.text.toLowerCase().split(/[,;:.()"“”!?]+/)) {
    const ws = piece.split(/[^a-z'-]+/).filter(Boolean);
    for (let i = 0; i < ws.length - 1; i += 1) {
      const [a, b] = [ws[i], ws[i + 1]];
      if (STOP.has(a) || STOP.has(b) || a.length < 3 || b.length < 3) continue;
      if (stem(a) !== term && stem(b) !== term) continue;
      if (NOT_FACTOR.has(stem(a === term ? b : a)) && stem(a) !== term) continue;
      const key = `${a} ${b}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const best = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
  const lone = surface(term, sentences);
  const adjective = /(?:al|ic|ive|ous|ent|ant|ary|ern)$/.test(lone);
  const word = best && (best[1] >= 2 || adjective) ? best[0] : lone;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function bestQuote(sentences, topic) {
  return [...sentences].sort((a, b) => {
    const sa = covers(a.text, topic) + (CAUSE.test(a.text) ? 1 : 0) - Math.abs(a.text.length - 180) / 400;
    const sb = covers(b.text, topic) + (CAUSE.test(b.text) ? 1 : 0) - Math.abs(b.text.length - 180) / 400;
    return sb - sa || a.page - b.page;
  })[0];
}

function nounLike(term, sentences) {
  const forms = [];
  let capitalMid = 0;
  let starts = 0;
  for (const s of sentences) {
    const words = s.text.split(/[^A-Za-z'-]+/).filter(Boolean);
    words.forEach((w, i) => {
      if (stem(w.toLowerCase()) !== term) return;
      forms.push(w.toLowerCase());
      if (i > 0 && /^[A-Z]/.test(w)) capitalMid += 1;
      if (i === 0) starts += 1;
    });
  }
  if (!forms.length) return 0;
  if (starts === forms.length) return 0.15; // only ever the first word of a sentence ("Throughout ...")
  const verbish = forms.filter((f) => /(?:ed|ing|ly)$/.test(f)).length / forms.length;
  if (verbish > 0.5) return 0;
  // Mostly capitalised mid-sentence: a name (a place, a person), weaker as a "factor".
  return capitalMid / forms.length > 0.6 ? 0.15 : 1;
}

/** "Three biggest factors in X": recurring causes across the passages about X, each with quotes. */
export function findFactors(sources, topic, n = 3) {
  const cands = [];
  const core = coreTerms(topic);
  for (const source of sources) {
    retrieve(source, topic, { k: 18, extra: ["caus", "factor", "declin", "weaken", "pressure", "collaps"].map(stem) }).forEach((hit, rank) => {
      // In the best passages a cause sentence counts even when it says "it" for the empire.
      for (const s of sentencesOfHit(source, hit)) if (CAUSE.test(s.text) && (rank < 8 || coversAny(s.text, groupsOf(core)) >= 1)) cands.push(s);
    });
  }
  if (!cands.length) return [];
  const topicSet = new Set(expandTerms(topic));
  const byTerm = new Map();
  for (const s of cands) {
    for (const t of new Set(terms(s.text))) {
      if (topicSet.has(t) || NOT_FACTOR.has(t) || ASK_WORDS.has(t) || t.length < 4 || /^\d/.test(t)) continue;
      if (CAUSE.test(t) || CAUSE.test(`${t}s`)) continue; // the cue word ("weakness", "decay") is not the factor
      if (!byTerm.has(t)) byTerm.set(t, []);
      byTerm.get(t).push(s);
    }
  }
  const index = indexOf(sources[0]);
  const scored = [...byTerm.entries()]
    .map(([t, ss]) => ({ t, ss, places: new Set(ss.map((s) => `${s.source.id}:${s.chunk}`)).size, noun: nounLike(t, ss) }))
    .filter((x) => x.noun > 0 && x.places >= (cands.length >= 8 ? 2 : 1))
    .map((x) => ({ ...x, score: x.places * x.noun * Math.min(4, idf(index, x.t) || 1) + x.ss.filter((s) => covers(s.text, core) > 0).length * 0.5 }))
    .sort((a, b) => b.score - a.score || a.t.localeCompare(b.t));
  const chosen = [];
  const used = new Set();
  const floor = (scored[0]?.score || 0) * 0.3;
  for (const x of scored) {
    if (chosen.length >= n) break;
    if (x.score < floor) break;
    const fresh = x.ss.filter((s) => !used.has(s.text));
    if (fresh.length < Math.max(1, x.ss.length * 0.5)) continue;
    const quote = bestQuote(fresh, topic);
    const explicit = x.ss.filter((s) => /\b(?:caus\w*|contribut\w*|led to|result\w*|brought (?:about|down)|weakened)\b/i.test(s.text)).length;
    chosen.push({ term: x.t, label: labelFor(x.t, x.ss), support: x.places, explicit, quotes: [quote, ...fresh.filter((s) => s !== quote && s.page !== quote.page).slice(0, 1)], pages: [...new Set(x.ss.map((s) => s.page))].sort((a, b) => a - b) });
    for (const s of x.ss) used.add(s.text);
  }
  return chosen;
}

const ENDING = /\b(?:fell|fall|end(?:ed)?|came to an end|collaps\w*|deposed|overthr\w*|sack(?:ed)?|no longer|last emperor|abdicat\w*|destroyed|conquered|founded|began|rose)\b/i;
const STRONG_END = /\b(?:fell|came to an end|collapsed|deposed|no longer|last emperor|abdicated|finally|the end of)\b/i;

/** "Approximately when ...": the year the passages give most often, with the sentence. */
export function findWhen(sources, wanted) {
  const years = new Map();
  const core = groupsOf(coreTerms(wanted));
  for (const source of sources) {
    for (const hit of retrieve(source, wanted, { k: 16 })) {
      for (const s of sentencesOfHit(source, hit)) {
        const near = coversAny(s.text, core) + (ENDING.test(s.text) ? 1 : 0);
        if (near < 1) continue;
        for (const m of s.text.matchAll(YEAR)) {
          const y = Number(m[1]);
          const bc = /B\.?\s?C/i.test(m[0]);
          if (!bc && (y < 100 || y > 2100)) continue;
          const key = bc ? `${y} BCE` : `${y}`;
          if (!years.has(key)) years.set(key, { list: [], weight: 0 });
          const e = years.get(key);
          e.list.push(s);
          e.weight += near + (STRONG_END.test(s.text) ? 2 : 0) + hit.score / 20;
        }
      }
    }
  }
  const best = [...years.entries()].sort((a, b) => b[1].weight - a[1].weight)[0];
  if (!best) return null;
  const quote = [...best[1].list].sort((a, b) => (ENDING.test(b.text) ? 1 : 0) - (ENDING.test(a.text) ? 1 : 0) || coversAny(b.text, core) - coversAny(a.text, core))[0];
  return { year: best[0], quote, count: best[1].list.length };
}

/** Plain quotes for a part: the sentences that carry most of its words. */
export function findQuotes(sources, wanted, { n = 2, distinctSources = false } = {}) {
  const out = [];
  for (const source of sources) {
    for (const hit of retrieve(source, wanted, { k: 8 })) {
      for (const s of sentencesOfHit(source, hit)) {
        const c = covers(s.text, wanted);
        if (c >= Math.min(2, wanted.length)) out.push({ ...s, score: c + hit.score / 50 });
      }
    }
  }
  out.sort((a, b) => b.score - a.score || a.page - b.page);
  const picked = [];
  for (const s of out) {
    if (picked.length >= n) break;
    if (picked.some((p) => p.text === s.text || (distinctSources && p.source.id === s.source.id))) continue;
    picked.push(s);
  }
  return picked;
}

export function q(s) {
  return `${quoted(s.text)} (${cite(s.source, s.page)})`;
}

function partTitle(part) {
  const t = part.text.replace(/^(?:and |also )/i, "").replace(/[.?!]+$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const NOT_FOUND = "Not found: I didn't find this in what I've read, so I won't guess.";

/**
 * A structured answer to a many-part question about named source(s).
 * sources: [{ id, title, pageKind, chunks: [{ id, page, text }], readerId? }].
 */
export function reasonedAnswer(question, sources, { parsed = null } = {}) {
  const usable = (sources || []).filter((s) => s?.chunks?.length);
  if (!usable.length) return null;
  const { parts, topic } = parsed || questionParts(question);
  if (!parts.length) return null;
  const blocks = [];
  const quotes = [];
  let factors = null;
  parts.forEach((part, i) => {
    const head = `${i + 1}. ${partTitle(part)}`;
    if (part.kind === "list") {
      factors = findFactors(usable, part.terms.length ? part.terms : topic, part.n || 3);
      if (!factors.length) {
        blocks.push({ title: head, text: NOT_FOUND });
        return;
      }
      const intro = "The factors below are my grouping of what the quoted passages tie to it. Each quote is the source's own words.";
      const lines = factors.map((f, k) => {
        quotes.push(...f.quotes);
        const more = part.explain && f.quotes[1] ? ` Also: ${q(f.quotes[1])}` : "";
        return `${k + 1}) ${f.label}. Documented: ${q(f.quotes[0])}${more}`;
      });
      const short = factors.length < (part.n || 3) ? `\nI found ${factors.length} clearly supported, not ${part.n}.` : "";
      blocks.push({ title: head, text: `${intro}\n${lines.join("\n")}${short}` });
      return;
    }
    if (part.kind === "judge") {
      if (factors?.length) {
        const ranked = [...factors].sort((a, b) => b.support + b.explicit - (a.support + a.explicit) || b.support - a.support);
        const top = ranked[0];
        const second = ranked[1];
        const pages = `${pageWord(usable[0])}s ${top.pages.slice(0, 6).join(", ")}`;
        const why = second && second.support + second.explicit === top.support + top.explicit
          ? `the passages weigh ${top.label.toLowerCase()} and ${second.label.toLowerCase()} about equally (${top.support} and ${second.support} passages). I lean to ${top.label.toLowerCase()} only because it edged ahead on my count of passages and cause statements (${pages}), so it's a close call`
          : `it comes up in ${top.support} separate passages about this (${pages})${top.explicit ? `, ${top.explicit} of them saying outright that it caused or weakened something` : ""}, more than ${second ? second.label.toLowerCase() : "the others"}`;
        blocks.push({ title: head, text: `Yehsa's inference: ${top.label.toLowerCase()} looks like the one with the greatest impact. Reason: ${why}. That ranking is my reading of what the passages stress. The source doesn't rank them itself.` });
      } else {
        const found = findQuotes(usable, part.terms, { n: 2 });
        quotes.push(...found);
        blocks.push({ title: head, text: found.length ? `Documented: ${found.map(q).join(" ")}\nYehsa's inference: going by these passages, ${found[0].text.split(/[,;]/)[0].toLowerCase()} is what the source stresses most. That's my reading, not its statement.` : NOT_FOUND });
      }
      return;
    }
    if (part.kind === "when") {
      const w = findWhen(usable, part.terms);
      if (!w) {
        blocks.push({ title: head, text: NOT_FOUND });
        return;
      }
      quotes.push(w.quote);
      blocks.push({ title: head, text: `Documented: ${q(w.quote)}\nSo: about ${/BCE/.test(w.year) ? w.year : `${w.year} CE`}${w.count > 1 ? ` (the year the passages give most often, ${w.count} times)` : ""}.` });
      return;
    }
    const found = findQuotes(usable, part.terms, { n: 2 });
    quotes.push(...found);
    blocks.push({ title: head, text: found.length ? `Documented: ${found.map(q).join("\n")}` : NOT_FOUND });
  });
  if (!quotes.length) return null;
  const names = [...new Set(usable.map((s) => `"${s.title}"`))].join(", ");
  const opener = `From ${names}, saved on this phone. "Documented" lines are quoted word for word with the page. "Yehsa's inference" is my own reasoning from those quotes, and it's labelled.`;
  const first = quotes[0];
  const citations = [...new Map(quotes.map((s) => [`${s.source.id}:${s.page}`, s])).values()].map((s, k) => ({ n: k + 1, sourceId: s.source.id, sourceName: s.source.title, title: s.source.title, ref: `${pageWord(s.source)} ${s.page}`, page: s.page, docId: s.source.docId || null }));
  const text = [opener, ...blocks.map((b) => `${b.title}\n${b.text}`)].join("\n\n");
  return {
    answered: true,
    voiced: true,
    kind: "doc-reasoned",
    noOffer: true,
    opener,
    text,
    sections: [{ title: null, text: opener }, ...blocks],
    source: usable.length === 1 ? `Saved document: ${usable[0].title}` : `Saved documents: ${names}`,
    citations,
    reader: first?.source?.readerId ? { bookId: first.source.readerId, page: first.page, title: first.source.title } : null,
    confident: false
  };
}

// ---------- synthesis across sources ----------

/** Recurring themes: big-picture concepts (concepts.js) found in passages from several sources. */
export function themesAcross(sentences, { min = 2, n = 6, exclude = [] } = {}) {
  const ex = new Set(exclude);
  const by = new Map();
  for (const s of sentences) {
    for (const c of conceptsIn(terms(s.text))) {
      if (ex.has(c.label)) continue;
      if (!by.has(c.label)) by.set(c.label, []);
      by.get(c.label).push(s);
    }
  }
  return [...by.entries()]
    .map(([label, ss]) => ({ label, ss, sources: [...new Set(ss.map((s) => s.source.title))] }))
    .filter((x) => x.sources.length >= min)
    .sort((a, b) => b.sources.length - a.sources.length || b.ss.length - a.ss.length || a.label.localeCompare(b.label))
    .slice(0, n)
    .map((x) => ({ term: x.label, label: x.label, sources: x.sources, examples: x.ss }));
}

function sameText(a, b) {
  const k = (t) => t.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 80);
  return k(a) === k(b);
}

function sourceList(names, total) {
  const shown = names.slice(0, 4);
  const more = total - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : list(shown);
}

function list(names) {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Synthesis mode: a broad question across many sources ("look across eras ... what patterns
 * emerge?"). Each part gets quotes from different sources (Documented), then the themes several
 * sources share around it (Yehsa's deduction, naming the sources). Honest about gaps.
 */
export function synthesize(question, sources, { parsed = null } = {}) {
  const usable = (sources || []).filter((s) => s?.chunks?.length);
  if (usable.length < 2) return null;
  const { parts, topic } = parsed || questionParts(question);
  if (!parts.length) return null;
  const blocks = [];
  const quoted = [];
  const all = [];
  const seenThemes = new Set();
  const usedQuotes = [];
  parts.forEach((part, i) => {
    const hints = partHints(part.text);
    const wanted = [...new Set([...part.terms.filter((t) => !NOT_FACTOR.has(t)).slice(0, 6), ...hints])];
    const head = `${i + 1}. ${partTitle(part)}`;
    // Passages per source on this part's own words (topic words only help rank).
    const pool = [];
    for (const source of usable) {
      const own = wanted.length ? wanted : topic;
      // Saved documents (the encyclopedias you downloaded) count a little more than the rest.
      const lift = source.docId ? 1.3 : 1;
      for (const hit of search(indexOf(source), [...own, ...topic], { k: 6, weights: new Map(topic.map((t) => [t, 0.3])) })) {
        if (covers(hit.chunk.text, own) < Math.min(2, own.length)) continue;
        for (const s of sentencesOfHit(source, hit)) {
          const c = covers(s.text, own);
          const t = covers(s.text, topic);
          if (c >= 1 && c + t >= 2) pool.push({ ...s, score: (c + t * 0.5 + hit.score / 40) * lift });
        }
      }
    }
    pool.sort((a, b) => b.score - a.score);
    all.push(...pool);
    const docs = [];
    for (const s of pool) {
      if (docs.length >= 3) break;
      if (docs.some((d) => d.source.id === s.source.id || sameText(d.text, s.text))) continue;
      if (usedQuotes.some((u) => sameText(u, s.text))) continue;
      docs.push(s);
    }
    usedQuotes.push(...docs.map((d) => d.text));
    quoted.push(...docs);
    const themes = themesAcross(pool, { min: 2, n: 3 }).filter((t) => part.kind === "judge" || !seenThemes.has(t.term));
    themes.forEach((t) => seenThemes.add(t.term));
    const lines = [];
    if (docs.length) lines.push(`Documented: ${docs.map(q).join("\n")}`);
    else lines.push("Documented: nothing I've read speaks to this part directly.");
    if (themes.length) {
      lines.push(`Yehsa's deduction: ${themes.map((t) => `${t.label} comes up here in ${t.sources.length} separate sources (${sourceList(t.sources, t.sources.length)})`).join("; ")}. Because unrelated sources keep returning to it, I read it as a recurring pattern. That's my inference from what they share. None of them states it as a conclusion.`);
    } else if (docs.length) {
      lines.push("Yehsa's deduction: too few sources overlap here to call it a pattern.");
    }
    blocks.push({ title: head, text: lines.join("\n") });
  });
  if (!quoted.length) return null;
  const overall = themesAcross(all, { min: 3, n: 5 });
  const sourceNames = [...new Set(all.map((s) => s.source.title))];
  const closing = overall.length
    ? `Across everything above, the ideas most sources share are ${list(overall.map((t) => `${t.label} (${t.sources.length} sources)`))}. My deduction: when this many unrelated texts keep returning to the same few things, those are the questions people have kept facing without settling. That's my synthesis, built only from the quoted passages. It isn't a fact any one source states, and I can't check it beyond what I've read.`
    : "I couldn't find themes shared by three or more sources, so I won't claim a pattern.";
  const opener = `I read across ${sourceNames.length} sources on this phone (${list(sourceNames.slice(0, 6))}${sourceNames.length > 6 ? ", and others" : ""}). "Documented" lines are quoted with the source and page. "Yehsa's deduction" is my own reasoning from what several sources share, and it names them. Nothing here is invented.`;
  const citations = [...new Map(quoted.map((s) => [`${s.source.id}:${s.page}`, s])).values()].map((s, k) => ({ n: k + 1, sourceId: s.source.id, sourceName: s.source.title, title: s.source.title, ref: `${pageWord(s.source)} ${s.page}`, page: s.page }));
  const text = [opener, ...blocks.map((b) => `${b.title}\n${b.text}`), `What it adds up to\n${closing}`].join("\n\n");
  const first = quoted[0];
  return {
    answered: true,
    voiced: true,
    kind: "synthesis",
    noOffer: true,
    opener,
    text,
    sections: [{ title: null, text: opener }, ...blocks, { title: "What it adds up to", text: closing }],
    source: `Synthesis across ${sourceNames.length} sources on this phone`,
    citations,
    reader: first?.source?.readerId ? { bookId: first.source.readerId, page: first.page, title: first.source.title } : null,
    confident: false
  };
}
