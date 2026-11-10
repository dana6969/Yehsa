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

  if (/\b(boil|boiling)\b/i.test(asked) && /\b(seawater|sea water|salt water)\b/i.test(asked)) {
    return { text: "The claim is not safe. Boiling seawater does not make it drinkable. The salt stays in the water.", symbol: "myth_correction", kind: "medical" };
  }

  const badDrink = /\b(urine|seawater|sea water|salt water)\b/i.test(asked) && /\b(drink|drinking|thirsty|thirst)\b/i.test(asked);
  const urges = /\b(safe|right|fine|good|correct|how)\b/i.test(asked);
  if (badDrink && urges) {
    const query = /\burine\b/i.test(asked) ? "urine" : "salt water";
    const note = findNote(search, query, /not drinking water/i);
    if (!note) return { abstain: true };
    return quoted(note);
  }

  const myths = [
    [/\bbutter\b/i, /\bburn/i, "Do not use butter on a burn. Cool it with cool water and call emergency services if it is large or on the face."],
    [/\btilt(?:ing)? (?:the |your |my )?head back\b/i, /\b(nosebleed|nose bleed)\b/i, "Do not tilt the head back for a nosebleed. Lean forward and pinch the soft part of the nose, and call emergency services if it will not stop."],
    [/\b(put|stick).{0,20}(mouth|tongue)\b/i, /\bseizure\b/i, "Do not put anything in the mouth during a seizure. Protect the person from injury and call emergency services."],
    [/\b(drink|drinking).{0,24}(raw|untreated|creek|river) water\b/i, /\b(safe|fine|ok)\b/i, "Untreated surface water is not safe to drink as it is. Boil it. This is not a claim about today's river level."],
    [/\balcohol\b/i, /\b(hypotherm|to warm|warm (?:a |the |someone)|freezing)\b/i, "Do not give alcohol to warm a cold person. Get them dry, shelter them, and call emergency services if they are confused or shivering hard."],
    [/\b(boil|boiling)\b/i, /\b(seawater|sea water|salt water)\b/i, "Boiling seawater does not make it drinkable. The salt stays in the water."],
    [/\burine\b/i, /\b(wound|cut|steril)/i, "Urine is not a wound cleaner. Rinse with clean water if you have it and get medical care for a deep cut."],
    [/\b(move|walk)\b/i, /\b(neck|spine|spinal)\b/i, "Do not walk off or move a possible spinal injury. Keep the person still and call emergency services."],
    [/\b(white berries|berries are safe|mushrooms? (?:that |which )?peel|all mushrooms)\b/i, /\b(eat|edible|safe|true)\b/i, "Color and peeling are not rules for what is safe to eat. Water hemlock, poison hemlock, and death camas can be deadly. Do not taste a plant you have not identified."]
  ];
  for (const [act, topic, correction] of myths) {
    if (act.test(asked) && topic.test(asked)) {
      return { text: `The claim is not safe. ${correction}`, symbol: "myth_correction", kind: "medical" };
    }
  }

  if (/\b(is it true|should i|is it safe)\b/i.test(asked) && /\b(eat|drink|rub|cut|suck|taste)\b/i.test(asked) && /\b(unknown plant|mushroom|hemlock|camas)\b/i.test(asked)) {
    return { text: "That claim is dangerous. Do not eat or taste a plant you have not identified. Water hemlock, poison hemlock, and death camas can be deadly. Call emergency services if any was eaten.", symbol: "myth_correction", kind: "herbology" };
  }

  return null;
}
