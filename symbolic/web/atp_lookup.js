// Reads the on-phone ATP pack (tools/atp/build_atp_pack.mjs). Returns passages as candidates for
// the answer builder. A passage is never an answer on its own: it goes to review like a web page.

import { coverage, questionGroups } from "./answer_builder.js";
import { GOV_LICENSE } from "./sources.js";

export function searchAtp(pack, question, limit = 3) {
  const groups = questionGroups(question);
  if (!pack?.sections?.length || groups.length === 0) return [];
  const pubs = new Map((pack.pubs || []).map((pub) => [pub.pub, pub]));
  const need = groups.length === 1 ? 1 : 0.5;
  return pack.sections
    .map((section, order) => {
      const body = coverage(section.text, groups);
      const head = coverage(`${section.section} ${section.chapter}`, groups);
      return { section, order, score: body + head * 0.5, body };
    })
    .filter((hit) => hit.body >= need)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ section }) => {
      const pub = pubs.get(section.pub) || {};
      return {
        sourceId: pub.id || section.pub,
        sourceName: section.pub,
        kind: "pack",
        ref: `para ${section.para}`,
        title: pub.title || "",
        section: section.section,
        url: pub.url || "https://armypubs.army.mil/",
        license: GOV_LICENSE.name,
        licenseUrl: GOV_LICENSE.url,
        attribution: `${section.pub}${pub.title ? `, ${pub.title}` : ""}${pub.date ? ` (${pub.date})` : ""}. Approved for public release; distribution is unlimited.`,
        text: section.text
      };
    });
}
