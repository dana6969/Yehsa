# Yehsa evaluation harness

This folder scores `ask()` without changing Yehsa. The product code, the field notes, and the dictionaries stay as they are. Expo and EAS are not used.

The question set is built by `questions.mjs` (about 400 to 1000 full-sentence questions). Each item has a rubric: required phrases, a required number, a forbidden claim, or a required abstention (`No offline note answered that.`). Out-of-corpus probes are checked against `symbolic_memory/books_index.json` when the set is built. If a probe is actually in that index, the builder throws.

Categories:

1. Factual retrieval from the notes.
2. Multi-note replies that must contain phrases from more than one note.
3. Mathematics: arithmetic, unit conversion, and landscape distance, bearing, declination, and sunrise.
4. False premises. A pass is an abstention or a reply that negates the premise. Echoing the premise fails.
5. Questions whose distinctive phrase is not in the field index, including trick wording. Silence is the usual pass. A confident unrelated gloss fails.

Groups of three paraphrases are marked and scored for whether the verdict stays the same.

## Reproduce

From the repository root:

```bash
node eval/questions.mjs
node eval/run.mjs
```

`node eval/run.mjs` does all of the following and rewrites `REPORT.md` and `results.json`:

- one long process over every question, with per-call latency and RSS after each call
- eight fresh processes, one question each
- three fresh processes, 25 questions each
- a separate fresh process that times `getMappedAction` only

The symbol timing can also be run by itself:

```bash
node eval/hotpath.mjs /tmp/yehsa-hotpath.json
```

`REPORT.md` is the results write-up, including the category table and the wrong-but-confident replies.
