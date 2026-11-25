// R11: startup cost in node: evaluate every symbolic module the phone app imports (src/phone/*.js),
// as Hermes does when the bundle starts. Fresh process per run.
//   node eval/r11/startup.mjs --root /path/to/checkout [--runs 5]
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg("root", process.cwd()));
const runs = Number(arg("runs", 5));
const phone = path.join(ROOT, "src/phone");
const mods = new Set();
for (const f of fs.readdirSync(phone)) {
  if (!/\.js$/.test(f) || /\.web\.js$/.test(f)) continue;
  const src = fs.readFileSync(path.join(phone, f), "utf8");
  for (const m of src.matchAll(/from\s+["'](\.\.\/\.\.\/(?:symbolic|symbolic_memory)\/[^"']+)["']/g)) {
    const abs = path.resolve(phone, m[1]);
    if (/\.(js|json)$/.test(abs) && fs.existsSync(abs)) mods.add(abs);
  }
}
const list = [...mods];
const script = `const t=process.hrtime.bigint();const L=${JSON.stringify(list)};for(const m of L){try{await import(m.endsWith('.json')?'file://'+m:'file://'+m, m.endsWith('.json')?{with:{type:'json'}}:undefined)}catch(e){}}console.log(Number(process.hrtime.bigint()-t)/1e6)`;
const times = [];
for (let i = 0; i < runs; i += 1) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: ROOT, encoding: "utf8" });
  times.push(Number(r.stdout.trim()));
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ root: ROOT, modules: list.length, medianMs: +times[Math.floor(times.length / 2)].toFixed(1), runs: times.map((t) => +t.toFixed(1)) }));
