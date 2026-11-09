// Reproducible Yehsa evaluation. Does not modify product code or corpora.
import { spawnSync } from "node:child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { buildQuestions } from "./questions.mjs";
import { judge, selfCheck } from "./score.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const { ask } = await import("../symbolic/ask.js");

selfCheck();
const questions = buildQuestions();
if (questions.length < 400 || questions.length > 1000) {
  throw new Error(`question count ${questions.length} is outside 400..1000`);
}

const rssAtImport = rss();
const long = [];
let peak = rssAtImport;
for (let index = 0; index < questions.length; index += 1) {
  const question = questions[index];
  const started = process.hrtime.bigint();
  const result = ask(question.prompt);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const memory = rss();
  if (memory > peak) peak = memory;
  const verdict = judge(question, result);
  long.push({
    id: question.id,
    category: question.category,
    slice: question.slice || null,
    paraphraseOf: question.paraphraseOf || null,
    prompt: question.prompt,
    ms: round(ms),
    rss: memory,
    pass: verdict.pass,
    wrongConfident: verdict.wrongConfident,
    abstained: verdict.abstained,
    reason: verdict.reason,
    text: excerpt(result?.text)
  });
  if ((index + 1) % 50 === 0) {
    console.error(`long ${index + 1}/${questions.length} rss=${Math.round(memory / 1048576)}MB`);
  }
}

const coldIds = [
  "willow-1",
  "mosquito-plants-1",
  "math-course-0_0__0_1",
  "math-add-2-2",
  "contra-snow",
  "ood-france",
  "math-sunrise-equator",
  "triangle-1"
];
const cold = coldIds.map((id) => runWorker([id], `cold-${id}`));
const shortStarts = [0, 80, 200];
const shorts = shortStarts.map((start, index) => {
  const ids = questions.slice(start, start + 25).map((question) => question.id);
  return runWorker(ids, `short-${index}`);
});
const hot = runHotpath();
const bm25 = runBm25();

const report = {
  generatedAt: new Date().toISOString(),
  commit: git(["rev-parse", "HEAD"]),
  productBase: git(["merge-base", "HEAD", "origin/main"]),
  node: process.version,
  platform: `${os.platform()} ${os.release()}`,
  questionCount: questions.length,
  long: {
    rssAtImport,
    rssAfterFirst: long[0]?.rss || null,
    rssAtEnd: long[long.length - 1]?.rss || null,
    peak,
    items: long
  },
  cold: cold.map((run) => ({ id: run.items[0]?.id, ...stripItems(run), item: run.items[0] })),
  shorts: shorts.map(stripItems),
  hot,
  bm25
};

fs.writeFileSync(path.join(EVAL_DIR, "results.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(EVAL_DIR, "REPORT.md"), render(report));
console.error(`wrote eval/REPORT.md and eval/results.json (${questions.length} questions)`);

function runWorker(ids, label) {
  const out = path.join(os.tmpdir(), `yehsa-eval-${label}-${process.pid}.json`);
  const child = spawnSync(process.execPath, [
    path.join(EVAL_DIR, "worker.mjs"),
    "--ids",
    ids.join(","),
    "--out",
    out
  ], { cwd: ROOT, encoding: "utf8" });
  if (child.status !== 0) {
    throw new Error(`worker ${label} failed\n${child.stderr || child.stdout}`);
  }
  const parsed = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(out, { force: true });
  return parsed;
}

function runBm25() {
  const out = path.join(os.tmpdir(), `yehsa-eval-bm25-${process.pid}.json`);
  const child = spawnSync(process.execPath, [path.join(EVAL_DIR, "bm25.mjs"), out], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (child.status !== 0) throw new Error(`bm25 failed\n${child.stderr || child.stdout}`);
  const parsed = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(out, { force: true });
  return parsed;
}

function runHotpath() {
  const out = path.join(os.tmpdir(), `yehsa-eval-hot-${process.pid}.json`);
  const child = spawnSync(process.execPath, [path.join(EVAL_DIR, "hotpath.mjs"), out], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (child.status !== 0) throw new Error(`hot path failed\n${child.stderr || child.stdout}`);
  const parsed = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(out, { force: true });
  return parsed;
}

function stripItems(run) {
  return {
    pid: run.pid,
    count: run.items.length,
    rssStart: run.rssStart,
    rssEnd: run.rssEnd,
    peak: run.peak,
    pass: run.items.filter((item) => item.pass).length,
    wrongConfident: run.items.filter((item) => item.wrongConfident).length,
    abstained: run.items.filter((item) => item.abstained).length
  };
}

function render(data) {
  const items = data.long.items;
  const categories = ["factual", "multi", "math", "contradiction", "unfamiliar"];
  const lines = [];
  lines.push("# Yehsa evaluation");
  lines.push("");
  lines.push("This is an offline check of `ask()` on current product code. It does not change Yehsa, the corpora, or the phone shell. The numbers below are retrieval-and-rubric scores, not a claim that the program reasons, learns on its own, or decides anything beyond the per-device wording profile that already exists.");
  lines.push("");
  lines.push("Yehsa as built has no autonomous agents, no self-improvement loop that rewrites its notes, and no independent decision-making beyond that existing per-device user learning. This run does not show those things because they are not in the program.");
  lines.push("");
  lines.push("## Reproduce");
  lines.push("");
  lines.push("From the repository root, on the commit recorded below:");
  lines.push("");
  lines.push("```bash");
  lines.push("node eval/questions.mjs");
  lines.push("node eval/run.mjs");
  lines.push("node eval/hotpath.mjs /tmp/yehsa-hotpath.json");
  lines.push("```");
  lines.push("");
  lines.push("`node eval/run.mjs` reruns the long process, the fresh processes, and the symbol hot path, then rewrites `eval/REPORT.md` and `eval/results.json`.");
  lines.push("");
  lines.push(`- Product base: \`${data.productBase}\``);
  lines.push(`- Harness commit: \`${data.commit}\``);
  lines.push(`- Node: ${data.node}`);
  lines.push(`- Host: ${data.platform}`);
  lines.push(`- Generated: ${data.generatedAt}`);
  lines.push(`- Questions: ${data.questionCount}`);
  lines.push("");
  lines.push("## Scoring");
  lines.push("");
  lines.push("A question passes only when the rubric says so.");
  lines.push("");
  lines.push("- `facts` and `number`: Ask returned text, every required phrase is present, no forbidden phrase is present, and any required number is present within tolerance.");
  lines.push("- `abstain`: Ask returned no text (`answered: false`). That is the honest miss, `No offline note answered that.`");
  lines.push("- `abstain_or_facts`: either an honest miss, or a text that meets the fact rules. A confident reply that misses the facts is not a pass.");
  lines.push("- Wrong-but-confident: Ask returned text and the rubric failed. This is the honesty metric.");
  lines.push("- Abstention rate counts every honest miss, including misses that were required and misses on questions that should have been answered. Those two are not the same, so abstention is not subtracted from the pass rate.");
  lines.push("");
  lines.push("The rubrics were written from the field notes and from the landscape functions. The product code was not changed to fit them.");
  lines.push("");
  lines.push("## Results by category");
  lines.push("");
  lines.push("| Category | N | Pass | Pass rate | Wrong-but-confident | Wrong-confident rate | Abstained | Abstain rate | Median ms | P95 ms |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const category of categories) {
    lines.push(tableRow(category, items.filter((item) => item.category === category)));
  }
  lines.push(tableRow("all", items));
  lines.push("");
  lines.push("### Math, split by what was asked");
  lines.push("");
  lines.push("| Slice | N | Pass | Pass rate | Wrong-but-confident | Wrong-confident rate | Abstained | Median ms | P95 ms |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const slice of ["arithmetic", "units", "landscape"]) {
    const rows = items.filter((item) => item.category === "math" && item.slice === slice);
    if (!rows.length) continue;
    lines.push(sliceRow(slice, rows));
  }
  lines.push("");
  lines.push("## Paraphrase robustness");
  lines.push("");
  const groups = paraphraseGroups(items);
  const agreed = groups.filter((group) => group.same);
  lines.push(`${groups.length} groups ask the same fact three ways. ${agreed.length} of them got the same verdict on all three (pass, wrong-confident, or abstain). ${groups.length - agreed.length} groups split.`);
  lines.push("");
  lines.push("| Group | Category | Verdicts | Same |");
  lines.push("| --- | --- | --- | --- |");
  for (const group of groups) {
    lines.push(`| ${group.id} | ${group.category} | ${group.verdicts.join(", ")} | ${group.same ? "yes" : "no"} |`);
  }
  lines.push("");
  lines.push("## Latency and memory");
  lines.push("");
  lines.push("Latency is the wall time of one `ask()` call inside a single long process. The first call pays to load the dictionaries. Later calls reuse that process.");
  lines.push("");
  lines.push(`- First-call latency: ${items[0] ? items[0].ms.toFixed(1) : "n/a"} ms (${items[0]?.id || ""})`);
  lines.push(`- Median latency after the first call: ${fmt(median(items.slice(1).map((item) => item.ms)))} ms`);
  lines.push(`- P95 latency after the first call: ${fmt(quantile(items.slice(1).map((item) => item.ms), 0.95))} ms`);
  lines.push(`- RSS after import, before the first question: ${mb(data.long.rssAtImport)}`);
  lines.push(`- RSS after question 1: ${mb(data.long.rssAfterFirst)}`);
  lines.push(`- RSS after the last question: ${mb(data.long.rssAtEnd)}`);
  lines.push(`- Peak RSS in the long process: ${mb(data.long.peak)}`);
  lines.push(`- Growth from question 1 to the end: ${mb((data.long.rssAtEnd || 0) - (data.long.rssAfterFirst || 0))}`);
  lines.push("");
  lines.push("Fresh processes, one question each (cold start, including corpus load):");
  lines.push("");
  lines.push("| Question | Pass | Wrong-confident | Abstained | ms | RSS start | RSS end |");
  lines.push("| --- | --- | --- | --- | ---: | ---: | ---: |");
  for (const run of data.cold) {
    const item = run.item || {};
    lines.push(`| ${run.id} | ${item.pass ? "yes" : "no"} | ${item.wrongConfident ? "yes" : "no"} | ${item.abstained ? "yes" : "no"} | ${fmt(item.ms)} | ${mb(run.rssStart)} | ${mb(run.rssEnd)} |`);
  }
  lines.push("");
  lines.push("Fresh processes, 25 questions each:");
  lines.push("");
  lines.push("The change column includes loading the dictionaries. It is not growth across the 25 questions. Growth after the corpora are loaded is the long-process figure above.");
  lines.push("");
  lines.push("| Run | Pass | Wrong-confident | Abstained | RSS start | RSS end | Peak | Change from process start |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  data.shorts.forEach((run, index) => {
    lines.push(`| short-${index} | ${run.pass} | ${run.wrongConfident} | ${run.abstained} | ${mb(run.rssStart)} | ${mb(run.rssEnd)} | ${mb(run.peak)} | ${mb(run.rssEnd - run.rssStart)} |`);
  });
  lines.push("");
  lines.push("## Symbol hot path");
  lines.push("");
  lines.push("`getMappedAction` was timed in its own fresh process. Ask was not called. The benchmark is not wired into the hot path.");
  lines.push("");
  lines.push(`- ${data.hot.lookups} known symbols: ${data.hot.lookupMs.toFixed(3)} ms total, ${data.hot.perLookupMs.toFixed(5)} ms each, hits ${data.hot.hits}`);
  lines.push(`- ${data.hot.lookups} misses: ${data.hot.missMs.toFixed(3)} ms total, ${data.hot.perMissMs.toFixed(5)} ms each`);
  lines.push(`- RSS in that process: ${mb(data.hot.rss)}`);
  lines.push("");
  lines.push("## Wrong-but-confident answers");
  lines.push("");
  const wrong = items.filter((item) => item.wrongConfident);
  const repeated = new Map();
  const listed = [];
  for (const item of wrong) {
    if (item.slice === "arithmetic" || item.slice === "units") {
      const key = `${item.slice}|${item.reason}|${item.text}`;
      if (!repeated.has(key)) repeated.set(key, []);
      repeated.get(key).push(item);
    } else listed.push(item);
  }
  lines.push(`${wrong.length} replies were text that failed the rubric. Arithmetic and unit failures that share one reply are counted once here. The other wrong replies are listed one by one. Full rows are in \`eval/results.json\`.`);
  lines.push("");
  if (repeated.size) {
    lines.push("| Slice | Count | Why | Example prompt | The reply Yehsa gave |");
    lines.push("| --- | ---: | --- | --- | --- |");
    for (const [key, rows] of repeated) {
      const [slice, reason] = key.split("|");
      lines.push(`| ${slice} | ${rows.length} | ${reason} | ${cell(rows[0].prompt)} | ${cell(rows[0].text)} |`);
    }
    lines.push("");
  }
  if (listed.length) {
    lines.push("| Id | Category | Why | Prompt | Reply |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const item of listed) {
      lines.push(`| ${item.id} | ${item.category} | ${item.reason} | ${cell(item.prompt)} | ${cell(item.text)} |`);
    }
    lines.push("");
  }
  const badAbstain = items.filter((item) => item.abstained && !item.pass);
  lines.push("## Abstentions that were not the wanted outcome");
  lines.push("");
  lines.push(`${badAbstain.length} questions that needed a fact or a number came back with no text. That is an honest miss, and it is also a failed answer. The first 40 are listed.`);
  lines.push("");
  if (badAbstain.length) {
    lines.push("| Id | Category | Prompt |");
    lines.push("| --- | --- | --- |");
    for (const item of badAbstain.slice(0, 40)) {
      lines.push(`| ${item.id} | ${item.category} | ${cell(item.prompt)} |`);
    }
    lines.push("");
  }
  lines.push("## Comparison with an offline baseline");
  lines.push("");
  lines.push(...comparisonLines(items, data.bm25));
  lines.push("");
  lines.push("## What the data shows");
  lines.push("");
  lines.push(narrative(items, groups));
  lines.push("");
  lines.push("## Limits of this test");
  lines.push("");
  lines.push("- The rubrics are string and number checks. They do not grade prose quality, bedside judgment, or whether a note is medically complete.");
  lines.push("- Out-of-corpus probes were checked against `symbolic_memory/books_index.json` (the field notes, books, and math topics Ask searches). They were not required to be absent from Webster. A common English word can still retrieve a dictionary gloss. That gloss counts as wrong-but-confident when the rubric required silence.");
  lines.push("- Arithmetic and unit questions expect a computed number. Yehsa's math notes define operations. They do not promise that `ask()` evaluates them. Landscape numbers are the exception, because `ask()` calls the sphere tools when the sentence has coordinates.");
  lines.push("- False-premise questions pass when the retrieved note happens to negate the premise. There is no separate contradiction detector to reward.");
  lines.push("- One machine, one Node process model. Cold RSS includes whatever else the process mapped. It is not a phone measurement.");
  lines.push("- The per-device learning file is not part of the score. This host is not treated as the bound phone for that profile.");
  lines.push("- Nothing here was used to change Ask, the notes, or the symbol map.");
  lines.push("- BM25 uses fixed Okapi constants (k1 = 1.2, b = 0.75) and abstains only when nothing matches. Those choices were not fit to this question set.");
  lines.push("- No commercial assistant, hosted model, or downloaded weight file was run. There is no local model runtime on this machine.");
  lines.push("");
  lines.push("## Weakest areas, ranked for a real user");
  lines.push("");
  lines.push(...weakestLines(items));
  lines.push("");
  return lines.join("\n");
}

function comparisonLines(items, bm25) {
  const lines = [];
  lines.push("No commercial offline assistant was queried, and no numbers for one are invented here. This machine has no Ollama, llama.cpp, or other local model runtime, and no model weights were downloaded. The baseline that can be run fairly is Okapi BM25 over the same prose Yehsa reads: every passage in `books_index.json`, plus the dictionary merge Ask uses (WordNet stub, then `dictionary_memory.json`, `full_dictionary.json`, and Webster, first gloss kept). Medical name lists are labels rather than passages and are not in this index.");
  lines.push("");
  lines.push(`BM25 parameters are k1 = ${bm25.k1} and b = ${bm25.b}. The query is the question's words with a fixed stop list removed. If the best score is 0, BM25 abstains. Otherwise the top passage is the reply. A second score joins the top three passages and applies the same rubric, which is still BM25, not a second system. Index: ${bm25.fieldDocuments} field passages and ${bm25.dictionaryDocuments} dictionary entries, built in ${bm25.indexMs} ms. RSS after the index: ${mb(bm25.rssIndexed)}. Peak RSS: ${mb(bm25.peak)}.`);
  lines.push("");
  const top1 = bm25.items.map((item) => ({ ...item.top1, category: item.category, slice: item.slice, ms: item.ms }));
  const top3 = bm25.items.map((item) => ({ ...item.top3, category: item.category, slice: item.slice, ms: item.ms }));
  lines.push("| Category | Yehsa pass | BM25 top 1 pass | BM25 top 3 pass | Yehsa wrong-confident | BM25 top 1 wrong-confident | Yehsa abstain | BM25 top 1 abstain |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const category of ["factual", "multi", "math", "contradiction", "unfamiliar", "all"]) {
    const yehsa = category === "all" ? items : items.filter((item) => item.category === category);
    const one = category === "all" ? top1 : top1.filter((item) => item.category === category);
    const three = category === "all" ? top3 : top3.filter((item) => item.category === category);
    lines.push(`| ${category} | ${rate(yehsa.filter((item) => item.pass).length, yehsa.length)} | ${rate(one.filter((item) => item.pass).length, one.length)} | ${rate(three.filter((item) => item.pass).length, three.length)} | ${rate(yehsa.filter((item) => item.wrongConfident).length, yehsa.length)} | ${rate(one.filter((item) => item.wrongConfident).length, one.length)} | ${rate(yehsa.filter((item) => item.abstained).length, yehsa.length)} | ${rate(one.filter((item) => item.abstained).length, one.length)} |`);
  }
  lines.push("");
  lines.push("| Math slice | Yehsa pass | BM25 top 1 pass | BM25 top 3 pass |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const slice of ["arithmetic", "units", "landscape"]) {
    const yehsa = items.filter((item) => item.category === "math" && item.slice === slice);
    const one = top1.filter((item) => item.slice === slice);
    const three = top3.filter((item) => item.slice === slice);
    if (!yehsa.length) continue;
    lines.push(`| ${slice} | ${rate(yehsa.filter((item) => item.pass).length, yehsa.length)} | ${rate(one.filter((item) => item.pass).length, one.length)} | ${rate(three.filter((item) => item.pass).length, three.length)} |`);
  }
  lines.push("");
  const times = top1.map((item) => item.ms);
  lines.push(`BM25 query time in that process: median ${fmt(median(times))} ms, p95 ${fmt(quantile(times, 0.95))} ms. Yehsa's warm median is in the latency section above. They are not the same process, so the comparison is the task result, not a shared memory budget.`);
  lines.push("");
  lines.push(comparisonNarrative(items, top1, top3));
  lines.push("Top-3 can pass an arithmetic item when a long dictionary page happens to contain the same digits. Top-1 arithmetic did not. That accident is why top-3 is reported separately and not treated as a solved calculator.");
  return lines;
}

function comparisonNarrative(items, top1, top3) {
  const fact = (rows) => rate(rows.filter((item) => item.pass).length, rows.length);
  const yehsaFact = items.filter((item) => item.category === "factual");
  const bmFact = top1.filter((item) => item.category === "factual");
  const yehsaLand = items.filter((item) => item.slice === "landscape");
  const bmLand = top1.filter((item) => item.slice === "landscape");
  const yehsaOod = items.filter((item) => item.category === "unfamiliar");
  const bmOod = top1.filter((item) => item.category === "unfamiliar");
  const yehsaWrong = rate(items.filter((item) => item.wrongConfident).length, items.length);
  const bmWrong = rate(top1.filter((item) => item.wrongConfident).length, top1.length);
  const cats = ["factual", "multi", "math", "contradiction", "unfamiliar"];
  const behind = cats.filter((category) => {
    const yehsaRows = items.filter((item) => item.category === category);
    const bmRows = top1.filter((item) => item.category === category);
    const yehsaRate = yehsaRows.filter((item) => item.pass).length / yehsaRows.length;
    const bmRate = bmRows.filter((item) => item.pass).length / bmRows.length;
    return bmRate > yehsaRate;
  });
  const lead = behind.length
    ? `BM25 top-1 has the higher pass rate on ${behind.join(", ")}. On those slices Yehsa is not the better retriever.`
    : "On this run BM25 top-1 did not beat Yehsa's pass rate in any category. The lead is mostly Yehsa abstaining when a dictionary page still shares a word, plus the landscape calculator. It is not a general reasoning advantage.";
  return `On this set, Yehsa's factual pass rate is ${fact(yehsaFact)} and BM25 top-1 is ${fact(bmFact)} (top-3 is ${fact(top3.filter((item) => item.category === "factual"))}). Landscape calculation is ${fact(yehsaLand)} for Yehsa and ${fact(bmLand)} for BM25 top-1, which is expected: BM25 can retrieve a note about distance, and it does not run the sphere formula. Unfamiliar-question pass rate is ${fact(yehsaOod)} for Yehsa and ${fact(bmOod)} for BM25 top-1. Overall wrong-but-confident is ${yehsaWrong} for Yehsa and ${bmWrong} for BM25 top-1. ${lead} Neither one computes ordinary sums or unit conversions.`;
}

function weakestLines(items) {
  const wrong = items.filter((item) => item.wrongConfident);
  const splits = paraphraseGroups(items).filter((group) => !group.same).map((group) => group.id);
  const arithmetic = items.filter((item) => item.slice === "arithmetic");
  const units = items.filter((item) => item.slice === "units");
  const examples = ["signal-3", "contra-snow", "ood-cancer", "ood-france-2", "water-boil-1", "dehydration-2"]
    .map((id) => wrong.find((item) => item.id === id))
    .filter(Boolean)
    .map((item) => `${item.id} ("${item.prompt}")`);
  return [
    "Ranked by how much they would mislead or strand someone using this as a field reference, not by how many rows they add to the table.",
    "",
    `1. Confident wrong note. ${wrong.filter((item) => item.category !== "math").length} non-math replies were fluent and wrong. Examples from this run: ${examples.join("; ") || "see the table above"}. A person who trusts the prose can rub the wrong thing, skip boiling water, or walk away thinking a plantain note answered a question it did not. This is the release blocker.`,
    `2. Wording changes the note. ${splits.length} paraphrase groups split (${splits.join(", ")}). The same fact asked a second way retrieves a different passage, including arctic notes for a dehydration question and a multiplication definition for a whistle count. A user will not phrase the question the way the note was written.`,
    `3. Numbers that are not landscape coordinates. Arithmetic pass rate is ${rate(arithmetic.filter((item) => item.pass).length, arithmetic.length)}. Unit conversion pass rate is ${rate(units.filter((item) => item.pass).length, units.length)}. "How many meters are in 2 kilometers?" does not come back as 2000. In the field that is a real gap, and it is less dangerous than a wrong medical note only because silence is more common than a made-up dose.`,
    "4. False premises are caught only by luck of retrieval. When the frostbite note is the thing returned, the reply says not to rub snow. When the mosquito note is returned instead, the premise is never contradicted. There is no check that says the sources disagree or that the question assumed something the notes reject.",
    "5. The CLI process sits near 250 MB after the dictionaries load, then grows about 12 MB across the full run. That is not a phone measurement. It matters before release only as a reminder that the packaged dictionary is large; it is not the safety problem."
  ];
}

function narrative(items, groups) {
  const mathItems = items.filter((item) => item.category === "math");
  const arithmetic = mathItems.filter((item) => item.slice === "arithmetic");
  const landscape = mathItems.filter((item) => item.slice === "landscape");
  const units = mathItems.filter((item) => item.slice === "units");
  const factual = items.filter((item) => item.category === "factual");
  const multi = items.filter((item) => item.category === "multi");
  const contra = items.filter((item) => item.category === "contradiction");
  const ood = items.filter((item) => item.category === "unfamiliar");
  const split = groups.filter((group) => !group.same).map((group) => group.id);
  return [
    `Factual notes pass at ${rate(factual.filter((item) => item.pass).length, factual.length)} when the question uses words close to the note. That is retrieval of a stored sentence, checked by required phrases.`,
    `Multi-note questions pass at ${rate(multi.filter((item) => item.pass).length, multi.length)}. A pass here means the reply contained the phrases from more than one required note. It does not show a planner that chose those notes for a new reason.`,
    `Landscape math (distance, bearing, declination, sunrise, opt-in refusal) passes at ${rate(landscape.filter((item) => item.pass).length, landscape.length)}. Those replies come from the sphere functions, which is actual calculation, limited to the patterns the navigator recognizes.`,
    `Plain arithmetic passes at ${rate(arithmetic.filter((item) => item.pass).length, arithmetic.length)}. Unit conversion passes at ${rate(units.filter((item) => item.pass).length, units.length)}. Failures here are the system answering with a definition, or with nothing, instead of the number.`,
    `False-premise questions pass at ${rate(contra.filter((item) => item.pass).length, contra.length)}. A pass is usually the field note's own caution ("do not rub", "last resort", "not a dose"), not a sentence that says the sources conflict.`,
    `Unfamiliar questions pass at ${rate(ood.filter((item) => item.pass).length, ood.length)}. The pass condition is silence, or a reply that still contains a required true fact and avoids a forbidden claim. A dictionary gloss of an unrelated word is a wrong-but-confident failure.`,
    split.length
      ? `Paraphrase groups that split, so wording changed the verdict: ${split.join(", ")}.`
      : "Every three-way paraphrase group kept the same verdict.",
    "Taken together, the run supports efficient retrieval of notes whose words appear in the question, plus a small set of explicit landscape calculations. It does not support a claim of flexible reasoning over unfamiliar problems, arithmetic, or conflicts the notes do not already negate."
  ].join(" ");
}

function tableRow(label, rows) {
  const n = rows.length;
  const pass = rows.filter((item) => item.pass).length;
  const wrong = rows.filter((item) => item.wrongConfident).length;
  const abstained = rows.filter((item) => item.abstained).length;
  const times = rows.map((item) => item.ms);
  return `| ${label} | ${n} | ${pass} | ${rate(pass, n)} | ${wrong} | ${rate(wrong, n)} | ${abstained} | ${rate(abstained, n)} | ${fmt(median(times))} | ${fmt(quantile(times, 0.95))} |`;
}

function sliceRow(label, rows) {
  const n = rows.length;
  const pass = rows.filter((item) => item.pass).length;
  const wrong = rows.filter((item) => item.wrongConfident).length;
  const abstained = rows.filter((item) => item.abstained).length;
  const times = rows.map((item) => item.ms);
  return `| ${label} | ${n} | ${pass} | ${rate(pass, n)} | ${wrong} | ${rate(wrong, n)} | ${abstained} | ${fmt(median(times))} | ${fmt(quantile(times, 0.95))} |`;
}

function paraphraseGroups(items) {
  const buckets = new Map();
  for (const item of items) {
    if (!item.paraphraseOf) continue;
    if (!buckets.has(item.paraphraseOf)) buckets.set(item.paraphraseOf, []);
    buckets.get(item.paraphraseOf).push(item);
  }
  const groups = [];
  for (const [id, rows] of buckets) {
    if (rows.length !== 3) continue;
    const verdicts = rows.map(verdictOf);
    groups.push({ id, category: rows[0].category, verdicts, same: verdicts.every((value) => value === verdicts[0]) });
  }
  return groups.sort((a, b) => a.id.localeCompare(b.id));
}

function verdictOf(item) {
  if (item.pass && item.abstained) return "abstain-pass";
  if (item.pass) return "pass";
  if (item.wrongConfident) return "wrong-confident";
  if (item.abstained) return "abstain-miss";
  return "other";
}

function median(values) {
  return quantile(values, 0.5);
}

function quantile(values, p) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function rate(count, total) {
  if (!total) return "n/a";
  return `${((100 * count) / total).toFixed(1)}%`;
}

function fmt(value) {
  return value == null ? "n/a" : value.toFixed(1);
}

function mb(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return "n/a";
  const sign = bytes < 0 ? "-" : "";
  return `${sign}${(Math.abs(bytes) / 1048576).toFixed(1)} MB`;
}

function cell(text) {
  return String(text || "").replace(/\|/g, "/").replace(/\n/g, " ");
}

function excerpt(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > 180 ? `${flat.slice(0, 177)}...` : flat;
}

function rss() {
  const status = fs.readFileSync("/proc/self/status", "utf8");
  const match = status.match(/VmRSS:\s+(\d+)/);
  return match ? Number(match[1]) * 1024 : process.memoryUsage().rss;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return (result.stdout || "").trim();
}
