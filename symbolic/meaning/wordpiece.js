// BERT uncased WordPiece tokenizer for the offline meaning matcher.
// Pure JavaScript with no filesystem, so Node and the phone share it.
// Matches the BertNormalizer + BertPreTokenizer + WordPiece settings of the bundled model.

const CLS = "[CLS]";
const SEP = "[SEP]";
const UNK = "[UNK]";

export function buildVocab(vocabText) {
  const map = new Map();
  const lines = String(vocabText || "").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const token = lines[i].replace(/\r$/, "");
    if (token && !map.has(token)) map.set(token, i);
  }
  return map;
}

function isControl(code) {
  if (code === 9 || code === 10 || code === 13) return false;
  return (code < 32) || (code >= 127 && code < 160);
}

function isWhitespace(ch) {
  return /\s/.test(ch);
}

function isPunctuation(ch) {
  const code = ch.codePointAt(0);
  if ((code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126)) {
    return true;
  }
  return /\p{P}/u.test(ch);
}

function isCjk(code) {
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x20000 && code <= 0x2a6df)
    || (code >= 0x2a700 && code <= 0x2b73f) || (code >= 0x2b740 && code <= 0x2b81f) || (code >= 0x2b820 && code <= 0x2ceaf)
    || (code >= 0xf900 && code <= 0xfaff) || (code >= 0x2f800 && code <= 0x2fa1f);
}

export function basicTokens(text) {
  let clean = "";
  for (const ch of String(text || "")) {
    const code = ch.codePointAt(0);
    if (code === 0 || code === 0xfffd || isControl(code)) continue;
    if (isCjk(code)) clean += ` ${ch} `;
    else clean += isWhitespace(ch) ? " " : ch;
  }
  clean = clean.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");
  const out = [];
  for (const word of clean.split(" ")) {
    if (!word) continue;
    let current = "";
    for (const ch of word) {
      if (isPunctuation(ch)) {
        if (current) out.push(current);
        out.push(ch);
        current = "";
      } else {
        current += ch;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

function wordPiece(word, vocab, out) {
  const chars = Array.from(word);
  if (chars.length > 100) {
    out.push(vocab.get(UNK));
    return;
  }
  const pieces = [];
  let start = 0;
  while (start < chars.length) {
    let end = chars.length;
    let found = null;
    while (start < end) {
      const piece = (start > 0 ? "##" : "") + chars.slice(start, end).join("");
      if (vocab.has(piece)) {
        found = vocab.get(piece);
        break;
      }
      end -= 1;
    }
    if (found == null) {
      out.push(vocab.get(UNK));
      return;
    }
    pieces.push(found);
    start = end;
  }
  for (const id of pieces) out.push(id);
}

// Returns token ids with [CLS] ... [SEP], cut to maxLength.
export function encode(text, vocab, maxLength = 128) {
  const ids = [vocab.get(CLS)];
  for (const word of basicTokens(text)) {
    wordPiece(word, vocab, ids);
    if (ids.length >= maxLength - 1) break;
  }
  ids.length = Math.min(ids.length, maxLength - 1);
  ids.push(vocab.get(SEP));
  return ids;
}
