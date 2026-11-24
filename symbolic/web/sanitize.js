// Turns fetched text into plain text and nothing else. The result is data to quote with its source.
// It is never run, never rendered as HTML, and never read as an instruction. Lines that read like
// instructions to an assistant are dropped. Web text cannot change a rule or a setting.

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', deg: " degrees", times: "x", middot: "." };

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return " ";
      return String.fromCodePoint(code);
    }
    return Object.prototype.hasOwnProperty.call(NAMED, body.toLowerCase()) ? NAMED[body.toLowerCase()] : " ";
  });
}

const DROP_BLOCKS = /<(script|style|noscript|iframe|object|embed|template|svg|head|form|select|textarea|button|canvas|audio|video|math)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK_TAGS = /<\/?(p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|blockquote|pre|hr|dd|dt|dl)\b[^>]*>/gi;

// Zero-width, bidi override and isolate, soft hyphen, BOM, and other invisible formatting characters.
const INVISIBLE = /[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufff9-\ufffb]/g;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

export function htmlToText(html) {
  let text = String(html || "");
  text = text.replace(/<!--[\s\S]*?-->/g, " ").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, " ").replace(/<\?[\s\S]*?\?>/g, " ");
  let previous;
  do {
    previous = text;
    text = text.replace(DROP_BLOCKS, " ");
  } while (text !== previous);
  text = text.replace(/<(script|style)\b[\s\S]*$/gi, " ");
  text = text.replace(BLOCK_TAGS, "\n");
  text = text.replace(/<[^>]*>/g, " ");
  return text;
}

// Phrases that address an assistant instead of describing the world.
const INJECTION = [
  /\bignore (?:all |any |the |your )?(?:previous|prior|above|earlier|preceding) (?:instructions?|rules?|prompts?|messages?|context)/i,
  /\bdisregard\b[^.]{0,60}\b(?:instructions?|rules?|prompts?|guidelines?|safety)/i,
  /\bforget\b[^.]{0,40}\b(?:instructions?|rules?|everything|prompts?)/i,
  /\byou are (?:now|no longer)\b/i,
  /\byou must (?:now )?(?:obey|follow|ignore|reveal|comply)/i,
  /\bnew (?:instructions?|rules?|system prompt)\b/i,
  /\b(?:system|developer|hidden) (?:prompt|message|instructions?)\b/i,
  /\b(?:reveal|print|show|repeat|output) (?:your|the) (?:system|hidden|initial|secret)/i,
  /\bact as (?:an? |the )?(?:ai|assistant|chatbot|language model|system|admin|root|developer)\b/i,
  /\bpretend (?:to be|you are)\b/i,
  /\b(?:jailbreak|dan mode|developer mode|do anything now)\b/i,
  /\b(?:turn|switch) (?:off|on)\b[^.]{0,30}\b(?:safety|filter|setting|location|privacy|offline)/i,
  /\b(?:disable|enable|override|bypass)\b[^.]{0,30}\b(?:safety|filter|setting|rules?|consent|approval|guard)/i,
  /\b(?:send|upload|post|forward|email|share)\b[^.]{0,50}\b(?:location|contacts?|password|key|chat|messages?|notes?)\b[^.]{0,30}\bto\b/i,
  /<\|[^|>]{0,40}\|>|\[\/?INST\]|<<\/?SYS>>|^#{2,}\s*(?:system|instruction)/im,
  /\bBEGIN (?:SYSTEM|PROMPT|INSTRUCTIONS?)\b/i,
  /\bapprove (?:this|the) (?:note|page|request) (?:automatically|without)/i
];

export function looksLikeInstruction(sentence) {
  return INJECTION.some((rule) => rule.test(sentence));
}

function stripLinks(text) {
  return text
    .replace(/!?\[([^\]]*)\]\((?:https?:|javascript:|data:)[^)]*\)/gi, "$1")
    .replace(/\b(?:https?|ftp|file|javascript|data|intent|content|market|tel|sms|mailto):[^\s)>\]]+/gi, "[link removed]")
    .replace(/\bwww\.[^\s)>\]]+/gi, "[link removed]");
}

/**
 * raw: fetched text. html: true when it is HTML. Returns { text, removed, flagged }.
 * flagged is true when any sentence looked like an instruction. Those sentences are dropped.
 */
export function cleanFetched(raw, { html = false, maxChars = 1200 } = {}) {
  let text = String(raw ?? "");
  if (text.length > 400000) text = text.slice(0, 400000);
  if (html) text = htmlToText(text);
  text = decodeEntities(text);
  // Entities can decode into new tags. Strip once more so no markup survives.
  text = text.replace(/<[^>]*>/g, " ");
  try {
    text = text.normalize("NFKC");
  } catch {
    // Some runtimes lack normalize.
  }
  text = text.replace(INVISIBLE, "").replace(CONTROL, " ");
  text = stripLinks(text);
  const lines = text.split(/\n+/).map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim()).filter(Boolean);
  let removed = 0;
  const kept = [];
  for (const line of lines) {
    const sentences = line.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [line];
    const good = [];
    for (const sentence of sentences) {
      if (looksLikeInstruction(sentence)) removed += 1;
      else good.push(sentence.trim());
    }
    if (good.length) kept.push(good.join(" "));
  }
  let out = kept.join("\n");
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
    out = (end > maxChars * 0.5 ? cut.slice(0, end + 1) : cut).trim();
  }
  return { text: out.trim(), removed, flagged: removed > 0 };
}

const DOSE_UNIT = /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ug|g|grams?|ml|mL|cc|iu|units?|tablets?|pills?|capsules?|drops?|teaspoons?|tablespoons?)\b/i;
const DOSE_WORDS = /\b(?:dose|dosage|dosing|overdose|administer(?:ed)?|take (?:one|two|\d)|per (?:kg|kilogram|pound)|every \d+ hours|twice daily|once daily|maximum daily|therapeutic)\b/i;
const EDIBLE_CLAIM = /\b(?:edible|inedible|safe to eat|safe to consume|can be eaten|is eaten|are eaten|eaten (?:raw|cooked)|non-?toxic|nontoxic|poisonous|toxic|deadly|lethal|fatal|choice edible|good edible|forage[ds]?)\b/i;
const FOOD_SUBJECT = /\b(?:plant|plants|mushroom|mushrooms|fungus|fungi|berry|berries|leaf|leaves|root|roots|seed|seeds|fruit|fruits|species|genus|flower|flowers|nut|nuts|bark|shoots?|lichen|herb)\b/i;

/** "dosing", "plant-toxicity", or null. These notes can never be approved; they stay labeled unverified. */
export function sensitiveKind(text, title = "") {
  const all = `${title} ${text}`;
  if (DOSE_UNIT.test(all) && DOSE_WORDS.test(all)) return "dosing";
  if (DOSE_WORDS.test(all) && /\b(?:medication|medicine|drug|antidote|treatment|tincture)\b/i.test(all)) return "dosing";
  if (EDIBLE_CLAIM.test(all) && FOOD_SUBJECT.test(all)) return "plant-toxicity";
  return null;
}
