// Say so when a retrieved note rejects what the question assumes.
export function premiseFlag(question, noteText) {
  const asked = String(question || "");
  const note = String(noteText || "");
  if (!asked || !note) return null;
  if (/\b(avoid|should not|shouldn't|do not|never)\b/i.test(asked) && !/\b(correct|right treatment|good idea)\b/i.test(asked)) {
    return null;
  }
  const affirms = /\b(should|correct|right treatment|good idea|is safe to|helps)\b/i.test(asked);
  if (!affirms) return null;
  const bans = [...note.matchAll(/\bdo not ([a-z]+(?:\s+[a-z]+){0,4})/gi)];
  for (const ban of bans) {
    const phrase = ban[1].toLowerCase();
    const verb = phrase.split(/\s+/)[0];
    if (verb.length < 3) continue;
    if (new RegExp(`\\b${verb}\\w*\\b`, "i").test(asked)) {
      return `The note contradicts that premise. It says: do not ${phrase}.`;
    }
  }
  return null;
}

export function disagreementFlag(hits) {
  const notes = (hits || []).filter((hit) => hit && hit.text && hit.kind !== "dictionary").slice(0, 3);
  for (let i = 0; i < notes.length; i += 1) {
    for (let j = i + 1; j < notes.length; j += 1) {
      const bans = [...notes[i].text.matchAll(/\bdo not ([a-z]{3,})/gi)].map((match) => match[1].toLowerCase());
      for (const verb of bans) {
        const other = notes[j].text;
        if (new RegExp(`\\b${verb}\\b`, "i").test(other) && !new RegExp(`\\b(?:do not|don't|not) ${verb}\\b`, "i").test(other)) {
          return `These notes do not say the same thing about ${verb}.`;
        }
      }
    }
  }
  return null;
}
