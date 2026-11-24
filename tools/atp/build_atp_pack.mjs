// Builds assets/atp/atp_sections.json from the two Army publications Yehsa may look things up in:
//   ATP 3-50.21, Survival (18 September 2018)
//   ATP 4-02.11, Casualty Response, Tactical Combat Casualty Care, and First Aid (23 March 2026)
// Both are "Approved for public release; distribution is unlimited." US Government works.
//
// Usage: download the PDFs from armypubs.army.mil, run `pdftotext file.pdf out.txt` (poppler), then
//   node tools/atp/build_atp_pack.mjs <atp_3-50.21.txt> <atp_4-02.11.txt>
// The pack is only read by the Look-it-up step. It is never a trusted answer on its own: a passage
// reaches the person as a fetched answer that waits for Keep or Toss, like a web page.

import fs from "node:fs";
import path from "node:path";

export const PUBS = [
  {
    id: "atp-3-50.21",
    pub: "ATP 3-50.21",
    title: "Survival",
    date: "2018-09-18",
    url: "https://armypubs.army.mil/epubs/DR_pubs/DR_a/pdf/web/ARN12086_ATP%203-50x21%20FINAL%20WEB%202.pdf",
    details: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1005316"
  },
  {
    id: "atp-4-02.11",
    pub: "ATP 4-02.11",
    title: "Casualty Response, Tactical Combat Casualty Care, and First Aid",
    date: "2026-03-23",
    url: "https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN46159-ATP_4-02.11-000-WEB-1.pdf",
    details: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032717"
  }
];

const PARA = /^(\d{1,2}|[A-Z])-(\d{1,3})\.\s+(.*)$/;
const NOISE = [
  /^\s*$/,
  /^(?:\d{1,2}|[A-Z])-\d{1,3}$/,            // page number
  /^ATP \d-\d{2}\.\d{1,2}$/,                // running header
  /^\d{1,2} [A-Z][a-z]+ \d{4}$/,            // running date
  /^[ivxlc]+$/i,
  /[\u0000-\u0008\u000e-\u001f]/,           // broken font lines
  /^(?:Figure|Table) [A-Z0-9]+-\d+\./,
  /^Chapter \d+$/,
  /^Appendix [A-Z]$/
];

function clean(line) {
  return line.replace(/\f/g, "").replace(/\u2019/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
}

function tocOf(lines) {
  const chapters = {};
  const sections = new Set();
  for (let i = 0; i < Math.min(lines.length, 600); i += 1) {
    const ch = /^(?:Chapter (\d+)|Appendix ([A-Z]))$/.exec(lines[i]);
    if (ch) {
      let j = i + 1;
      while (j < lines.length && !lines[j]) j += 1;
      const title = (lines[j] || "").replace(/\s*\.{3,}.*$/, "").trim();
      if (title && !chapters[ch[1] || ch[2]]) chapters[ch[1] || ch[2]] = title.charAt(0) + title.slice(1).toLowerCase();
      continue;
    }
    const entry = /^(.{3,80}?)\s*\.{3,}\s*(?:\d{1,2}|[A-Z])-\d+$/.exec(lines[i]);
    if (entry) sections.add(entry[1].trim().toLowerCase());
  }
  return { chapters, sections };
}

export function buildSections(text, pub) {
  const lines = String(text).split(/\r?\n/).map(clean);
  const { chapters, sections } = tocOf(lines);
  const out = [];
  let current = null;
  let section = "";
  const flush = () => {
    if (!current) return;
    const body = current.text.replace(/\s+z\s+/g, " • ").replace(/^z\s+/, "• ").replace(/\s+/g, " ").replace(/(\w)- (\w)/g, "$1$2").trim();
    if (body.length >= 60) {
      out.push({ id: `${pub.id}:${current.para}`, pub: pub.pub, para: current.para, chapter: chapters[current.chapter] || "", section: current.section, text: body.slice(0, 1600) });
    }
    current = null;
  };
  let started = false;
  let wantTitle = null;
  for (const line of lines) {
    const head = /^Chapter (\d+)$/.exec(line);
    if (head) {
      wantTitle = chapters[head[1]] ? null : head[1];
      continue;
    }
    if (wantTitle && line && !NOISE.some((re) => re.test(line))) {
      if (line.length < 80 && !PARA.test(line)) chapters[wantTitle] = line.charAt(0) + line.slice(1).toLowerCase();
      wantTitle = null;
      continue;
    }
    if (NOISE.some((re) => re.test(line))) continue;
    const m = PARA.exec(line);
    if (m && (m[1] === "1" && m[2] === "1")) started = true;
    if (!started) continue;
    if (/^(?:Glossary|References|Index)$/i.test(line) && current) {
      flush();
      if (out.length > 50) break;
    }
    if (sections.has(line.toLowerCase()) || (/^[A-Z][A-Z ,'&-]{3,60}$/.test(line) && !m)) {
      flush();
      section = line.charAt(0) + line.slice(1).toLowerCase();
      continue;
    }
    if (m) {
      flush();
      current = { para: `${m[1]}-${m[2]}`, chapter: m[1], section, text: m[3] };
      continue;
    }
    if (current) {
      // A short line without an end mark after a full paragraph is most likely a sub-heading.
      if (line.length < 50 && !/[.,;:)]$/.test(line) && /[.:]$/.test(current.text) && /^[A-Z]/.test(line) && !/^z /.test(line)) {
        flush();
        section = line;
        continue;
      }
      current.text += ` ${line}`;
    }
  }
  flush();
  for (const item of out) if (!item.chapter) item.chapter = chapters[item.para.split("-")[0]] || "";
  // Keep the first copy of a paragraph number (a few appear in figure notes too).
  const seen = new Set();
  return out.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (files.length !== 2) throw new Error("usage: node tools/atp/build_atp_pack.mjs <atp_3-50.21.txt> <atp_4-02.11.txt>");
  const pack = {
    v: 1,
    built: new Date().toISOString().slice(0, 10),
    license: "US Government work. Approved for public release; distribution is unlimited.",
    pubs: PUBS.map(({ id, pub, title, date, url, details }) => ({ id, pub, title, date, url, details })),
    sections: files.flatMap((file, i) => buildSections(fs.readFileSync(file, "utf8"), PUBS[i]))
  };
  const target = path.join("assets", "atp", "atp_sections.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(pack));
  const counts = PUBS.map((p) => `${p.pub}: ${pack.sections.filter((s) => s.pub === p.pub).length}`).join(", ");
  console.log(`wrote ${target} (${fs.statSync(target).size} bytes) ${counts}`);
}
