// Prints the committed held-out numbers for the camera model (eval/camera_id/report.json).
// To regenerate them see tools/camera_id/README.md.
import fs from "node:fs";
const r = JSON.parse(fs.readFileSync(new URL("./report.json", import.meta.url), "utf8"));
const pct = (x) => `${(100 * x).toFixed(1)}%`;
console.log(`${r.model}; ${r.classes} classes; ${r.photos} photos; split ${JSON.stringify(r.split)}`);
console.log(`Thresholds (from the calibration split): weak ${r.thresholds.weak}, possible ${r.thresholds.possible}`);
const h = r.heldout;
console.log(`Held-out, ${h.n_pos} photos of classes in the set: top-1 ${pct(h.top1_all)}, top-3 ${pct(h.top3_all)}`);
console.log(`  Answered (not "I'm not sure"): ${pct(h.answered_pos)}; top-1 when answered ${pct(h.top1_answered)}, top-3 when answered ${pct(h.top3_answered)}`);
console.log(`  "Possible match" share ${pct(h.possible_share)}, top-1 there ${pct(h.top1_possible)}`);
console.log(`Held-out, ${h.n_neg} photos of things NOT in the set: said "I'm not sure" ${pct(h.neg_declined)}`);
console.log(`Deadly photos with a deadly class in the top 3: ${pct(h.deadly_photos_with_deadly_top3)}`);
for (const [g, v] of Object.entries(r.per_group)) console.log(`  ${g.padEnd(9)} n=${String(v.n).padStart(4)} top-1 ${pct(v.top1)} top-3 ${pct(v.top3)} answered ${pct(v.answered)}`);
