// Build symbolic_memory/spiritual_index.json from public-domain files.
// Quotes stay the source lines. This does not paraphrase them.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "symbolic_books", "spiritual");
const OUT = path.join(ROOT, "symbolic_memory", "spiritual_index.json");

function body(text) {
  const start = text.search(/\*\*\*\s*START OF THE PROJECT GUTENBERG/i);
  const end = text.search(/\*\*\*\s*END OF THE PROJECT GUTENBERG/i);
  let slice = text;
  if (start >= 0 && end > start) {
    const lineEnd = text.indexOf("\n", start);
    slice = text.slice(lineEnd > 0 ? lineEnd + 1 : start, end);
  }
  return slice.replace(/\r/g, "");
}

function tidy(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function chunks(text) {
  const quote = tidy(text);
  if (quote.length < 8 || /project gutenberg|www\.gutenberg/i.test(quote)) return [];
  if (quote.length <= 480) return [quote];
  const parts = [];
  let rest = quote;
  while (rest.length > 480) {
    let cut = rest.lastIndexOf(". ", 480);
    if (cut < 160) cut = 480;
    else cut += 1;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length >= 8) parts.push(rest);
  return parts;
}

function push(out, title, ref, text, file) {
  const parts = chunks(text);
  parts.forEach((quote, index) => {
    out.push({
      title,
      ref: parts.length > 1 ? `${ref} part ${index + 1}` : ref,
      text: quote,
      source: file
    });
  });
}

function tao(file, out) {
  const raw = body(fs.readFileSync(path.join(DIR, file), "utf8"));
  let chapter = 0;
  let section = 0;
  let buf = [];
  const flush = () => {
    if (chapter && buf.length) {
      push(out, "Tao Te Ching (Legge)", `Ch. ${chapter}.${section || 1}`, buf.join(" "), `symbolic_books/spiritual/${file}`);
    }
    buf = [];
  };
  const begin = (nextChapter, nextSection, first) => {
    flush();
    chapter = nextChapter;
    section = nextSection;
    buf = first ? [first] : [];
  };
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^PART /.test(trimmed)) continue;
    const headed = trimmed.match(/^Ch\.\s+(\d{1,2})\.\s+(\d+)\.\s+(.*)$/);
    const both = headed || trimmed.match(/^(\d{1,2})\.\s+(\d+)\.\s+(.*)$/);
    if (both) {
      const next = Number(both[1]);
      if (next >= 1 && next <= 81 && next >= chapter) {
        begin(next, Number(both[2]), both[3]);
        continue;
      }
    }
    const numbered = trimmed.match(/^(\d{1,2})\.\s*(.*)$/);
    if (numbered) {
      const next = Number(numbered[1]);
      const rest = numbered[2] || "";
      if (next >= 1 && next <= 81 && chapter && next === chapter + 1 && next !== section + 1) {
        begin(next, rest ? 1 : 0, rest);
        continue;
      }
      if (chapter && next >= 1 && next <= 9 && next === section + 1) {
        flush();
        section = next;
        if (rest) buf = [rest];
        continue;
      }
    }
    if (!chapter) continue;
    buf.push(trimmed);
  }
  flush();
}

function dhammapada(file, out) {
  const raw = body(fs.readFileSync(path.join(DIR, file), "utf8"));
  let chapter = "Chapter";
  let verse = "";
  let number = "";
  const flush = () => {
    if (verse && number) push(out, "Dhammapada (Muller)", `${chapter}, verse ${number}`, verse, `symbolic_books/spiritual/${file}`);
    verse = "";
    number = "";
  };
  for (const line of raw.split("\n")) {
    const heading = line.match(/^Chapter ([IVXLC]+)\.\s*(.*)$/);
    if (heading) {
      flush();
      chapter = `Chapter ${heading[1]}`;
      continue;
    }
    const start = line.match(/^(\d+)\.\s+(.*)$/);
    if (start && Number(start[1]) < 500) {
      flush();
      number = start[1];
      verse = start[2];
      continue;
    }
    if (verse && line.trim() && !/^Chapter /.test(line)) verse += ` ${line.trim()}`;
  }
  flush();
}

function gita(file, out) {
  const raw = body(fs.readFileSync(path.join(DIR, file), "utf8"));
  let chapter = "";
  let stanza = 0;
  let buf = [];
  const flush = () => {
    if (chapter && buf.length) {
      stanza += 1;
      push(out, "Bhagavad Gita (Arnold)", `${chapter}, stanza ${stanza}`, buf.join(" "), `symbolic_books/spiritual/${file}`);
    }
    buf = [];
  };
  for (const line of raw.split("\n")) {
    const heading = line.match(/^CHAPTER ([IVXLC]+)\s*$/);
    if (heading) {
      flush();
      chapter = `Chapter ${heading[1]}`;
      stanza = 0;
      continue;
    }
    if (!chapter) continue;
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\[/.test(line.trim()) || /^CONTENTS/.test(line)) continue;
    buf.push(line.trim());
  }
  flush();
}

function kybalion(file, out) {
  const raw = body(fs.readFileSync(path.join(DIR, file), "utf8"));
  let chapter = "";
  let buf = [];
  let part = 0;
  const flush = () => {
    if (chapter && buf.length) {
      part += 1;
      push(out, "The Kybalion", `${chapter}, part ${part}`, buf.join(" "), `symbolic_books/spiritual/${file}`);
    }
    buf = [];
  };
  for (const line of raw.split("\n")) {
    const heading = line.match(/^CHAPTER ([IVXLC]+)\s*$/);
    if (heading) {
      flush();
      chapter = `Chapter ${heading[1]}`;
      part = 0;
      continue;
    }
    if (!chapter) continue;
    if (!line.trim()) {
      flush();
      continue;
    }
    buf.push(line.trim());
  }
  flush();
}

function kjv(file, out) {
  const raw = body(fs.readFileSync(path.join(DIR, file), "utf8"));
  const lines = raw.split("\n");
  let book = "";
  let current = null;
  const flush = () => {
    if (current && current.book) {
      push(out, "Bible (KJV)", `${current.book} ${current.chapter}:${current.verse}`, current.text, `symbolic_books/spiritual/${file}`);
    }
    current = null;
  };
  const isBookHeader = (index) => {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.length > 80 || trimmed.includes("***") || /^\d/.test(trimmed)) return false;
    if (!/^[A-Z]/.test(trimmed)) return false;
    let looked = 0;
    for (let j = index + 1; j < lines.length && looked < 6; j += 1) {
      if (!lines[j].trim()) continue;
      looked += 1;
      if (/^1:1\s/.test(lines[j])) return true;
      if (/^\d+:\d+\s/.test(lines[j])) return false;
    }
    return false;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const verse = line.match(/^(\d+):(\d+)\s+(.*)$/);
    if (verse) {
      flush();
      current = { book, chapter: verse[1], verse: verse[2], text: verse[3].trim() };
      continue;
    }
    if (isBookHeader(i)) {
      flush();
      book = line.trim().replace(/\s+/g, " ");
      continue;
    }
    if (current && line.trim()) current.text += ` ${line.trim()}`;
  }
  flush();
}

function ocrBook(file, title, out) {
  let raw = fs.readFileSync(path.join(DIR, file), "utf8").replace(/\r/g, "");
  raw = raw.replace(/Digitized\s+by\s+Microsoft[^\n]*/gi, "");
  raw = raw.replace(/[ \t]{2,}/g, " ");
  let heading = "opening";
  let buf = [];
  let part = 0;
  const flush = () => {
    const quote = tidy(buf.join(" "));
    buf = [];
    const letters = (quote.match(/[A-Za-z]/g) || []).length;
    if (quote.length < 80 || letters < quote.length * 0.55) return;
    if (/digitized by|internet archive|project gutenberg|fair use/i.test(quote)) return;
    part += 1;
    push(out, title, `${heading}, part ${part}`, quote, `symbolic_books/spiritual/${file}`);
  };
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const headingLike = trimmed.length < 70 && !/[.]/.test(trimmed) && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
    if (headingLike) {
      flush();
      heading = trimmed.replace(/\s+/g, " ");
      part = 0;
      continue;
    }
    buf.push(trimmed);
  }
  flush();
}

const passages = [];
tao("tao_te_ching.txt", passages);
dhammapada("dhammapada.txt", passages);
gita("bhagavad_gita.txt", passages);
kybalion("kybalion.txt", passages);
kjv("kjv.txt", passages);
ocrBook("hermetica_mead_vol2.txt", "Thrice-Greatest Hermes (Mead)", passages);
ocrBook("barddas.txt", "Barddas (Williams, 1862)", passages);

const sources = [
  { file: "symbolic_books/spiritual/tao_te_ching.txt", title: "Tao Te Ching", translator: "James Legge", origin: "Project Gutenberg eBook 216" },
  { file: "symbolic_books/spiritual/bhagavad_gita.txt", title: "Bhagavad Gita (The Song Celestial)", translator: "Edwin Arnold", origin: "Project Gutenberg eBook 2388" },
  { file: "symbolic_books/spiritual/dhammapada.txt", title: "Dhammapada", translator: "F. Max Muller", origin: "Project Gutenberg eBook 2017" },
  { file: "symbolic_books/spiritual/kybalion.txt", title: "The Kybalion", translator: "Three Initiates", origin: "Project Gutenberg eBook 14209" },
  { file: "symbolic_books/spiritual/kjv.txt", title: "Bible, King James Version", translator: "", origin: "Project Gutenberg eBook 10" },
  { file: "symbolic_books/spiritual/hermetica_mead_vol2.txt", title: "Thrice-Greatest Hermes, Volume II", translator: "G. R. S. Mead", origin: "London: Theosophical Publishing Society, 1906. OCR from Internet Archive MeadGRSThriceGreatestHermesVolII1906. Not a Project Gutenberg file." },
  { file: "symbolic_books/spiritual/barddas.txt", title: "Barddas", translator: "J. Williams Ab Ithel, from Iolo Morganwg", origin: "London: Welsh Manuscript Society, 1862. OCR from Internet Archive barddasoracolle00willgoog. Iolo's papers are not a verified ancient druid liturgy." }
];

fs.writeFileSync(OUT, JSON.stringify({ sources, count: passages.length, passages }));
const by = {};
for (const passage of passages) by[passage.title] = (by[passage.title] || 0) + 1;
console.log(JSON.stringify({ count: passages.length, by }, null, 2));
