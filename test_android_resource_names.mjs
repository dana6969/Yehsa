// Android packs bundled assets as res/raw (and res/drawable for images) and drops the file
// extension, so two assets in one folder that differ only by extension (vt.yrg + vt.ypl) collide
// and fail :app:mergeReleaseResources ("Duplicate resources"). This guards every file under assets/.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

const IMAGE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test("no two bundled assets share an Android resource name", () => {
  const seen = new Map();
  const dupes = [];
  for (const file of walk("assets")) {
    const ext = path.extname(file).toLowerCase();
    const type = IMAGE.has(ext) ? "drawable" : "raw";
    const key = `${type}/${file.slice(0, -ext.length || undefined).toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
    if (seen.has(key)) dupes.push(`${seen.get(key)} <> ${file}`);
    else seen.set(key, file);
  }
  assert.deepEqual(dupes, []);
});
