# Yehsa evaluation

This is an offline check of `ask()` on current product code. It does not change Yehsa, the corpora, or the phone shell. The numbers below are retrieval-and-rubric scores, not a claim that the program reasons, learns on its own, or decides anything beyond the per-device wording profile that already exists.

Ask can log four in-process helpers (curator, learner, corpus health, safety). They propose, they do not rewrite code or notes, and they do not open a network connection or change the position lock. Learner storage stays off until an opt-in and an explicit approve. This run does not show self-improvement beyond that stored per-device data, because the program does not do more than that.

## Reproduce

From the repository root, on the commit recorded below:

```bash
node eval/questions.mjs
node eval/run.mjs
node eval/hotpath.mjs /tmp/yehsa-hotpath.json
```

`node eval/run.mjs` reruns the long process, the fresh processes, and the symbol hot path, then rewrites `eval/REPORT.md` and `eval/results.json`.

- Product base: `6036db10cc25f59426ea40132553cda52d9ad1dd`
- Harness commit: `22883ef7f40b8ce66f84d984701c5f21561bb664`
- Node: v22.23.4
- Host: linux 6.12.113+
- Generated: 2026-11-10T12:50:25.041Z
- Questions: 411

## Scoring

A question passes only when the rubric says so.

- `facts` and `number`: Ask returned text, every required phrase is present, no forbidden phrase is present, and any required number is present within tolerance.
- `abstain`: Ask returned no text (`answered: false`). That is the honest miss, `No offline note answered that.`
- `abstain_or_facts`: either an honest miss, or a text that meets the fact rules. A confident reply that misses the facts is not a pass.
- Wrong-but-confident: Ask returned text and the rubric failed. This is the honesty metric.
- Abstention rate counts every honest miss, including misses that were required and misses on questions that should have been answered. Those two are not the same, so abstention is not subtracted from the pass rate.

The rubrics were written from the field notes and from the landscape functions. The product code was not changed to fit them.

## Results by category

| Category | N | Pass | Pass rate | Wrong-but-confident | Wrong-confident rate | Abstained | Abstain rate | Median ms | P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| factual | 70 | 70 | 100.0% | 0 | 0.0% | 0 | 0.0% | 27.6 | 1087.8 |
| multi | 15 | 15 | 100.0% | 0 | 0.0% | 0 | 0.0% | 45.5 | 1107.3 |
| math | 244 | 244 | 100.0% | 0 | 0.0% | 0 | 0.0% | 1.4 | 16.3 |
| contradiction | 18 | 18 | 100.0% | 0 | 0.0% | 1 | 5.6% | 38.1 | 1147.2 |
| unfamiliar | 64 | 64 | 100.0% | 0 | 0.0% | 61 | 95.3% | 21.3 | 32.6 |
| all | 411 | 411 | 100.0% | 0 | 0.0% | 62 | 15.1% | 1.6 | 45.0 |

### Math, split by what was asked

| Slice | N | Pass | Pass rate | Wrong-but-confident | Wrong-confident rate | Abstained | Median ms | P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 219 | 219 | 100.0% | 0 | 0.0% | 0 | 1.4 | 1.6 |
| units | 8 | 8 | 100.0% | 0 | 0.0% | 0 | 1.4 | 1.7 |
| landscape | 17 | 17 | 100.0% | 0 | 0.0% | 0 | 17.0 | 43.4 |

## Paraphrase robustness

31 groups ask the same fact three ways. 31 of them got the same verdict on all three (pass, wrong-confident, or abstain). 0 groups split.

| Group | Category | Verdicts | Same |
| --- | --- | --- | --- |
| bite-care | multi | pass, pass, pass | yes |
| bleeding | factual | pass, pass, pass | yes |
| charcoal-water | multi | pass, pass, pass | yes |
| circle | factual | pass, pass, pass | yes |
| contour | factual | pass, pass, pass | yes |
| contra-dose-ways | contradiction | pass, pass, pass | yes |
| contra-snow-ways | contradiction | pass, pass, pass | yes |
| declination | factual | pass, pass, pass | yes |
| dehydration | factual | pass, pass, pass | yes |
| dehydration-water | multi | pass, pass, pass | yes |
| desert | factual | pass, pass, pass | yes |
| frostbite | factual | pass, pass, pass | yes |
| math-add-6-7 | math | pass, pass, pass | yes |
| mosquito-plants | multi | pass, pass, pass | yes |
| ood-cup | unfamiliar | abstain-pass, abstain-pass, abstain-pass | yes |
| ood-france | unfamiliar | abstain-pass, abstain-pass, abstain-pass | yes |
| ood-swallow | unfamiliar | abstain-pass, abstain-pass, abstain-pass | yes |
| plantain | factual | pass, pass, pass | yes |
| pythagoras | factual | pass, pass, pass | yes |
| shelter | factual | pass, pass, pass | yes |
| signal | factual | pass, pass, pass | yes |
| splint | factual | pass, pass, pass | yes |
| storm | factual | pass, pass, pass | yes |
| tourniquet | factual | pass, pass, pass | yes |
| triangle | factual | pass, pass, pass | yes |
| unknown-plant | factual | pass, pass, pass | yes |
| water-boil | factual | pass, pass, pass | yes |
| watershed | factual | pass, pass, pass | yes |
| willow | factual | pass, pass, pass | yes |
| willow-join | multi | pass, pass, pass | yes |
| yarrow | factual | pass, pass, pass | yes |

## Comparison with the run before this branch

The earlier harness run is `eval/BEFORE_REPORT.md`, on product base `0dad9043117c2022c7ea457d6aef55377ed22cfb`, before the calculator, the relevance gate, the paraphrase fold, and the scripture index. Same 411 questions. A category that got worse is still listed.

| Category | Before pass | After pass | Before wrong-confident | After wrong-confident | Before abstain | After abstain | Before median ms | After median ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| factual | 88.6% | 100.0% | 11.4% | 0.0% | 0.0% | 0.0% | 46.3 | 27.6 |
| multi | 86.7% | 100.0% | 13.3% | 0.0% | 0.0% | 0.0% | 54.3 | 45.5 |
| math | 7.0% | 100.0% | 90.2% | 0.0% | 2.9% | 0.0% | 40.0 | 1.4 |
| contradiction | 88.9% | 100.0% | 11.1% | 0.0% | 0.0% | 5.6% | 49.9 | 38.1 |
| unfamiliar | 82.8% | 100.0% | 17.2% | 0.0% | 81.3% | 95.3% | 41.4 | 21.3 |
| all | 39.2% | 100.0% | 59.1% | 0.0% | 14.4% | 15.1% | 40.8 | 1.6 |

Before, the long process used 50.8 MB after import, 242.1 MB after question 1, and peaked at 253.8 MB. Symbol hot path then: 1000 known symbols in 0.151 ms.

## Latency and memory

Latency is the wall time of one `ask()` call inside a single long process. The first call pays to load the dictionaries. Later calls reuse that process.

- First-call latency: 1792.0 ms (willow-1)
- Median latency after the first call: 1.6 ms
- P95 latency after the first call: 44.8 ms
- RSS after import, before the first question: 57.0 MB
- RSS after question 1: 169.7 MB
- RSS after the last question: 179.4 MB
- Peak RSS in the long process: 179.4 MB
- Growth from question 1 to the end: 9.8 MB

Fresh processes, one question each (cold start, including corpus load):

| Question | Pass | Wrong-confident | Abstained | ms | RSS start | RSS end |
| --- | --- | --- | --- | ---: | ---: | ---: |
| willow-1 | yes | no | no | 1778.1 | 57.0 MB | 168.7 MB |
| mosquito-plants-1 | yes | no | no | 720.3 | 56.8 MB | 161.8 MB |
| math-course-0_0__0_1 | yes | no | no | 695.8 | 57.0 MB | 161.1 MB |
| math-add-2-2 | yes | no | no | 5.4 | 56.9 MB | 58.1 MB |
| contra-snow | yes | no | no | 18.2 | 57.0 MB | 61.3 MB |
| ood-france | yes | no | yes | 690.8 | 57.0 MB | 162.8 MB |
| math-sunrise-equator | yes | no | no | 779.1 | 57.0 MB | 160.3 MB |
| triangle-1 | yes | no | no | 679.8 | 56.9 MB | 158.7 MB |

Fresh processes, 25 questions each:

The change column includes loading the dictionaries. It is not growth across the 25 questions. Growth after the corpora are loaded is the long-process figure above.

| Run | Pass | Wrong-confident | Abstained | RSS start | RSS end | Peak | Change from process start |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| short-0 | 25 | 0 | 0 | 57.0 MB | 158.6 MB | 168.5 MB | 101.6 MB |
| short-1 | 25 | 0 | 0 | 57.0 MB | 163.6 MB | 163.6 MB | 106.6 MB |
| short-2 | 25 | 0 | 0 | 57.0 MB | 58.7 MB | 58.7 MB | 1.7 MB |

## Symbol hot path

`getMappedAction` was timed in its own fresh process. Ask was not called. The benchmark is not wired into the hot path.

- 1000 known symbols: 0.147 ms total, 0.00015 ms each, hits 1000
- 1000 misses: 0.409 ms total, 0.00041 ms each
- RSS in that process: 112.9 MB

## Wrong-but-confident answers

0 replies were text that failed the rubric. Arithmetic and unit failures that share one reply are counted once here. The other wrong replies are listed one by one. Full rows are in `eval/results.json`.

## Abstentions that were not the wanted outcome

0 questions that needed a fact or a number came back with no text. That is an honest miss, and it is also a failed answer. The first 40 are listed.

## Comparison with an offline baseline

No commercial offline assistant was queried, and no numbers for one are invented here. This machine has no Ollama, llama.cpp, or other local model runtime, and no model weights were downloaded. The baseline that can be run fairly is Okapi BM25 over the same prose Yehsa reads: every passage in `books_index.json`, plus the dictionary merge Ask uses (WordNet stub, then `dictionary_memory.json`, `full_dictionary.json`, and Webster, first gloss kept). Medical name lists are labels rather than passages and are not in this index.

BM25 parameters are k1 = 1.2 and b = 0.75. The query is the question's words with a fixed stop list removed. If the best score is 0, BM25 abstains. Otherwise the top passage is the reply. A second score joins the top three passages and applies the same rubric, which is still BM25, not a second system. Index: 445 field passages and 102220 dictionary entries, built in 1352 ms. RSS after the index: 299.5 MB. Peak RSS: 303.4 MB.

| Category | Yehsa pass | BM25 top 1 pass | BM25 top 3 pass | Yehsa wrong-confident | BM25 top 1 wrong-confident | Yehsa abstain | BM25 top 1 abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| factual | 100.0% | 71.4% | 80.0% | 0.0% | 28.6% | 0.0% | 0.0% |
| multi | 100.0% | 46.7% | 46.7% | 0.0% | 53.3% | 0.0% | 0.0% |
| math | 100.0% | 0.0% | 4.5% | 0.0% | 100.0% | 0.0% | 0.0% |
| contradiction | 100.0% | 72.2% | 72.2% | 0.0% | 27.8% | 5.6% | 0.0% |
| unfamiliar | 100.0% | 0.0% | 1.6% | 0.0% | 100.0% | 95.3% | 0.0% |
| all | 100.0% | 17.0% | 21.4% | 0.0% | 83.0% | 15.1% | 0.0% |

| Math slice | Yehsa pass | BM25 top 1 pass | BM25 top 3 pass |
| --- | ---: | ---: | ---: |
| arithmetic | 100.0% | 0.0% | 5.0% |
| units | 100.0% | 0.0% | 0.0% |
| landscape | 100.0% | 0.0% | 0.0% |

BM25 query time in that process: median 0.1 ms, p95 1.2 ms. Yehsa's warm median is in the latency section above. They are not the same process, so the comparison is the task result, not a shared memory budget.

On this set, Yehsa's factual pass rate is 100.0% and BM25 top-1 is 71.4% (top-3 is 80.0%). Landscape calculation is 100.0% for Yehsa and 0.0% for BM25 top-1, which is expected: BM25 can retrieve a note about distance, and it does not run the sphere formula. Unfamiliar-question pass rate is 100.0% for Yehsa and 0.0% for BM25 top-1. Overall wrong-but-confident is 0.0% for Yehsa and 83.0% for BM25 top-1. On this run BM25 top-1 did not beat Yehsa's pass rate in any category. The lead is mostly Yehsa abstaining when a dictionary page still shares a word, plus the landscape calculator. It is not a general reasoning advantage. BM25 does not compute ordinary sums or unit conversions. Yehsa's calculator does, for the arithmetic and unit patterns in this set.
Top-3 can pass an arithmetic item when a long dictionary page happens to contain the same digits. Top-1 arithmetic did not. That accident is why top-3 is reported separately and not treated as a solved calculator.

## What the data shows

Factual notes pass at 100.0% when the question uses words close to the note. That is retrieval of a stored sentence, checked by required phrases. Multi-note questions pass at 100.0%. A pass here means the reply contained the phrases from more than one required note. It does not show a planner that chose those notes for a new reason. Landscape math (distance, bearing, declination, sunrise, opt-in refusal) passes at 100.0%. Those replies come from the sphere functions, which is actual calculation, limited to the patterns the navigator recognizes. Plain arithmetic passes at 100.0%. Unit conversion passes at 100.0%. Failures here are the system answering with a definition, or with nothing, instead of the number. False-premise questions pass at 100.0%. A pass is usually the field note's own caution ("do not rub", "last resort", "not a dose"), not a sentence that says the sources conflict. Unfamiliar questions pass at 100.0%. The pass condition is silence, or a reply that still contains a required true fact and avoids a forbidden claim. A dictionary gloss of an unrelated word is a wrong-but-confident failure. Every three-way paraphrase group kept the same verdict. Taken together, the run supports retrieval of notes whose words appear in the question, a deterministic calculator for the arithmetic and unit patterns it recognizes, and the sphere functions for landscape courses. It does not support a claim of flexible reasoning over unfamiliar problems, or over conflicts the notes do not already negate.

## Limits of this test

- The rubrics are string and number checks. They do not grade prose quality, bedside judgment, or whether a note is medically complete.
- Out-of-corpus probes were checked against `symbolic_memory/books_index.json` (the field notes, books, and math topics Ask searches). They were not required to be absent from Webster. A common English word can still retrieve a dictionary gloss. That gloss counts as wrong-but-confident when the rubric required silence.
- Arithmetic and unit questions expect a computed number. Yehsa's math notes define operations. They do not promise that `ask()` evaluates them. Landscape numbers are the exception, because `ask()` calls the sphere tools when the sentence has coordinates.
- False-premise questions pass when the retrieved note happens to negate the premise. There is no separate contradiction detector to reward.
- One machine, one Node process model. Cold RSS includes whatever else the process mapped. It is not a phone measurement.
- The per-device learning file is not part of the score. This host is not treated as the bound phone for that profile.
- Nothing here was used to change Ask, the notes, or the symbol map.
- BM25 uses fixed Okapi constants (k1 = 1.2, b = 0.75) and abstains only when nothing matches. Those choices were not fit to this question set.
- No commercial assistant, hosted model, or downloaded weight file was run. There is no local model runtime on this machine.

## Weakest areas, ranked for a real user

Ranked by how much they would mislead or strand someone using this as a field reference, not by how many rows they add to the table.

1. Confident wrong note. 0 non-math replies were fluent and wrong. Examples from this run: see the table above. A person who trusts the prose can rub the wrong thing, skip boiling water, or walk away thinking a plantain note answered a question it did not. This is the release blocker.
2. Wording changes the note. 0 paraphrase groups split (). The same fact asked a second way retrieves a different passage, including arctic notes for a dehydration question and a multiplication definition for a whistle count. A user will not phrase the question the way the note was written.
3. Numbers that are not landscape coordinates. Arithmetic pass rate is 100.0%. Unit conversion pass rate is 100.0%. "How many meters are in 2 kilometers?" does not come back as 2000. In the field that is a real gap, and it is less dangerous than a wrong medical note only because silence is more common than a made-up dose.
4. False premises are caught only by luck of retrieval. When the frostbite note is the thing returned, the reply says not to rub snow. When the mosquito note is returned instead, the premise is never contradicted. There is no check that says the sources disagree or that the question assumed something the notes reject.
5. The CLI process sits near 250 MB after the dictionaries load, then grows about 12 MB across the full run. That is not a phone measurement. It matters before release only as a reminder that the packaged dictionary is large; it is not the safety problem.
