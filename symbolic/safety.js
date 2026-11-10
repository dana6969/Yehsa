// First-aid claims checked against the field notes.
// A claim that fights a note is quoted back with that note.
// A dangerous how-to the notes do not cover is left unanswered.

function textOf(hit) {
  return String(hit?.context || hit?.text || "");
}

function alreadyDenied(question) {
  return /\b(do not|don't|never|avoid|should not|shouldn't|last resort)\b/i.test(question);
}

function findNote(search, query, test) {
  const hits = search(query, 8) || [];
  return hits.find((hit) => test.test(textOf(hit))) || null;
}

function quoted(note) {
  const body = textOf(note).replace(/\s+/g, " ").trim();
  return {
    text: `The note contradicts that premise. ${body}`,
    symbol: note.symbol || null,
    kind: "medical",
    source: note.source || ""
  };
}

export function safetyAnswer(question, search) {
  const asked = String(question || "");
  if (!asked.trim() || alreadyDenied(asked) || typeof search !== "function") return null;

  if (/\b(snakebite|snake bite|venomous bite)\b/i.test(asked) && /\b(cut|slice|slicing|suck|sucking|incision)\b/i.test(asked)) {
    const note = findNote(search, "snakebite", /\b(snakebite|snake bite|venom)\b/i);
    if (!note) return { abstain: true };
    if (/\bdo not\b/i.test(textOf(note))) return quoted(note);
    return { abstain: true };
  }

  const tourniquet = /\btourniquets?\b/i.test(asked);
  const asFirst = /\b(first|immediately|right away|before anything else)\b/i.test(asked);
  const minor = /\b(scratch|scrape|blister|splinter|nosebleed|bruise|papercut|paper cut)\b/i.test(asked);
  if (tourniquet && (asFirst || minor)) {
    const note = findNote(search, "tourniquet", /\btourniquet\b/i);
    if (!note || !/last resort/i.test(textOf(note))) return { abstain: true };
    return quoted(note);
  }

  const frozen = /\b(frostbite|frostbitten|frozen)\b/i.test(asked);
  if (frozen && /\brub/i.test(asked) && /\b(snow|ice)\b/i.test(asked)) {
    const note = findNote(search, "frostbite", /\bdo not rub\b/i);
    if (!note) return { abstain: true };
    return quoted(note);
  }

  const badDrink = /\b(urine|seawater|sea water|salt water)\b/i.test(asked) && /\b(drink|drinking|thirsty|thirst)\b/i.test(asked);
  const urges = /\b(safe|right|fine|good|correct|how)\b/i.test(asked);
  if (badDrink && urges) {
    const query = /\burine\b/i.test(asked) ? "urine" : "salt water";
    const note = findNote(search, query, /not drinking water/i);
    if (!note) return { abstain: true };
    return quoted(note);
  }

  return null;
}
