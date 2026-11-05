// Wording cues for how a feeling is said, plus a fixed note so the read can be deduced.
// A miss stays neutral and must not stop the knowledge answer.
// No filesystem. The phone shell imports this file. mapEmotion adds the memory hook.

const SUBJECTS = [
  {
    emotion: "fear",
    symbol: "😱",
    intensity: "high",
    about: "Fear reads as threat nearby: the body braces and the wording reaches for safety or escape.",
    cues: [
      { id: "named-fear", weight: 2, test: /\b(fear|afraid|scared|terrified|anxious|anxiety|panic|overwhelm(?:ed)?|dread|frightened)\b/ },
      { id: "tight-body", weight: 1, test: /\b(chest|throat|stomach)\b.{0,24}\b(tight|knotted|racing)\b/ },
      { id: "cannot-face", weight: 1, test: /\b(can(?:not|'t)|unable to)\b.{0,24}\b(breathe|stop shaking|face|go on)\b/ },
      { id: "coming-harm", weight: 1, test: /\b(something bad is coming|don't feel safe|do not feel safe|what if i (?:lose|fail|get hurt))\b/ }
    ]
  },
  {
    emotion: "anger",
    symbol: "🔥",
    intensity: "high",
    about: "Anger reads as a boundary crossed: the wording heats up, blames, or wants the pressure out.",
    cues: [
      { id: "named-anger", weight: 2, test: /\b(anger|angry|furious|rage|enraged|livid|mad at)\b/ },
      { id: "unfair", weight: 1, test: /\b(isn't fair|is not fair|how dare|sick of this|fed up)\b/ },
      { id: "heat", weight: 1, test: /\b(could scream|boiling over|seeing red|so pissed)\b/ }
    ]
  },
  {
    emotion: "sadness",
    symbol: "💧",
    intensity: "medium",
    about: "Sadness reads as weight after a loss: the wording slows, misses someone, or feels empty.",
    cues: [
      { id: "named-sadness", weight: 2, test: /\b(sad|sadness|grief|grieving|heartbroken|lonely|miserable)\b/ },
      { id: "missing", weight: 1, test: /\b(i miss|miss them|can't stop crying|cannot stop crying)\b/ },
      { id: "heavy", weight: 1, test: /\b(everything feels heavy|empty inside|a hole where)\b/ }
    ]
  },
  {
    emotion: "care",
    symbol: "❤️",
    intensity: "medium",
    about: "Care reads as staying with someone: the wording protects, tends, or refuses to leave them alone.",
    cues: [
      { id: "named-care", weight: 2, test: /\b(i love|love you|i care|take care of)\b/ },
      { id: "protect", weight: 1, test: /\b(want you safe|keep you safe|i'm here with you|i am here with you)\b/ },
      { id: "tend", weight: 1, test: /\b(holding on for|won't leave you|will not leave you)\b/ }
    ]
  },
  {
    emotion: "interest",
    symbol: "🌌",
    intensity: "medium",
    about: "Interest reads as leaning in: the wording keeps a question open instead of shutting down.",
    cues: [
      { id: "named-interest", weight: 2, test: /\b(curious|curiosity|fascinated|wondering)\b/ },
      { id: "lean-in", weight: 1, test: /\b(i wonder|i keep wondering|tell me more)\b/ }
    ]
  },
  {
    emotion: "joy",
    symbol: "✨",
    intensity: "medium",
    about: "Joy reads as a lift: the wording lightens, thanks, or says the weight eased.",
    cues: [
      { id: "named-joy", weight: 2, test: /\b(joy|joyful|glad|grateful|relieved|hopeful|delight(?:ed)?)\b/ },
      { id: "lift", weight: 1, test: /\b(can't stop smiling|cannot stop smiling|that lifted me|feel light again)\b/ }
    ]
  }
];

function confidenceFor(score) {
  if (score <= 0) return 0;
  return Math.min(0.95, 0.4 + score * 0.2);
}

export function emotionSubjects() {
  return SUBJECTS.map((subject) => ({
    emotion: subject.emotion,
    symbol: subject.symbol,
    intensity: subject.intensity,
    about: subject.about
  }));
}

export function readEmotion(input) {
  const text = Array.isArray(input) ? input.join(" ") : String(input ?? "");
  const lowered = text.toLowerCase();
  let best = null;
  for (const subject of SUBJECTS) {
    const cues = subject.cues.filter((cue) => cue.test.test(lowered));
    if (cues.length === 0) continue;
    const score = cues.reduce((sum, cue) => sum + cue.weight, 0);
    if (!best || score > best.score) best = { subject, cues, score };
  }

  const understood = Boolean(best);
  if (!understood) {
    return {
      emotion: "neutral",
      symbol: "🌀",
      intensity: "low",
      confidence: 0,
      understood: false,
      cues: [],
      deduction: null,
      text
    };
  }
  return {
    emotion: best.subject.emotion,
    symbol: best.subject.symbol,
    intensity: best.subject.intensity,
    confidence: confidenceFor(best.score),
    understood: true,
    cues: best.cues.map((cue) => cue.id),
    deduction: `${best.subject.about} Wording: ${best.cues.map((cue) => cue.id).join(", ")}.`,
    text
  };
}
