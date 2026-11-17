// Gives a long answer a scannable shape without changing a word of it: a summary line, numbered
// steps, then extra detail folded away. Only "You can use..." and "Common mistakes..." fold.
// Any other line, including a safety line, stays in view. Pure string work.

const STEP = /^\s*\d+[.)]\s+/;

function sentences(paragraph) {
  return paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) || [paragraph.trim()];
}

export function shapeAnswer(text) {
  const raw = String(text || "").trim();
  if (!raw) return { summary: "", steps: [], notes: [], folded: [], plain: "" };
  const blocks = raw.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const steps = [];
  const paragraphs = [];
  const folded = [];
  let seenSteps = false;
  const beforeSteps = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.some((line) => STEP.test(line))) {
      seenSteps = true;
      for (const line of lines) {
        if (STEP.test(line)) steps.push(line.replace(STEP, ""));
        else if (steps.length === 0) beforeSteps.push(line);
        else paragraphs.push(line);
      }
      continue;
    }
    if (/^(?:You can use|Common mistakes|Mistakes to avoid)\b/i.test(block)) {
      folded.push(block);
      continue;
    }
    if (seenSteps) paragraphs.push(block);
    else beforeSteps.push(block);
  }
  let summary = "";
  const notes = [...paragraphs];
  if (steps.length) {
    summary = beforeSteps.join(" ");
  } else {
    const all = beforeSteps;
    const first = all[0] || "";
    const parts = sentences(first);
    if (all.length === 1 && parts.length > 2) {
      summary = parts[0];
      notes.unshift(parts.slice(1).join(" "));
    } else if (all.length > 1) {
      summary = parts[0] === first ? first : parts[0];
      if (parts.length > 1) notes.unshift(parts.slice(1).join(" "));
      notes.unshift(...[]);
      for (const extra of all.slice(1)) notes.push(extra);
    } else {
      return { summary: "", steps: [], notes: [first], folded, plain: raw };
    }
  }
  return {
    summary,
    steps,
    notes: notes.filter(Boolean),
    folded: folded.length ? [{ label: "Materials and common mistakes", text: folded.join("\n\n") }] : [],
    plain: raw
  };
}
