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

- Product base: `0dad9043117c2022c7ea457d6aef55377ed22cfb`
- Harness commit: `0dad9043117c2022c7ea457d6aef55377ed22cfb`
- Node: v22.23.4
- Host: linux 6.12.113+
- Generated: 2026-11-10T00:15:48.003Z
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
| factual | 70 | 65 | 92.9% | 5 | 7.1% | 0 | 0.0% | 27.4 | 256.7 |
| multi | 15 | 12 | 80.0% | 3 | 20.0% | 0 | 0.0% | 45.3 | 269.4 |
| math | 244 | 244 | 100.0% | 0 | 0.0% | 0 | 0.0% | 1.9 | 16.8 |
| contradiction | 18 | 14 | 77.8% | 4 | 22.2% | 0 | 0.0% | 41.0 | 302.1 |
| unfamiliar | 64 | 50 | 78.1% | 14 | 21.9% | 47 | 73.4% | 19.3 | 28.0 |
| all | 411 | 385 | 93.7% | 26 | 6.3% | 47 | 11.4% | 2.1 | 45.3 |

### Math, split by what was asked

| Slice | N | Pass | Pass rate | Wrong-but-confident | Wrong-confident rate | Abstained | Median ms | P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 219 | 219 | 100.0% | 0 | 0.0% | 0 | 1.9 | 2.2 |
| units | 8 | 8 | 100.0% | 0 | 0.0% | 0 | 1.9 | 2.1 |
| landscape | 17 | 17 | 100.0% | 0 | 0.0% | 0 | 17.0 | 43.7 |

## Paraphrase robustness

31 groups ask the same fact three ways. 22 of them got the same verdict on all three (pass, wrong-confident, or abstain). 9 groups split.

| Group | Category | Verdicts | Same |
| --- | --- | --- | --- |
| bite-care | multi | pass, wrong-confident, pass | no |
| bleeding | factual | pass, pass, pass | yes |
| charcoal-water | multi | pass, pass, wrong-confident | no |
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
| ood-france | unfamiliar | abstain-pass, abstain-pass, wrong-confident | no |
| ood-swallow | unfamiliar | abstain-pass, wrong-confident, abstain-pass | no |
| plantain | factual | pass, pass, pass | yes |
| pythagoras | factual | pass, wrong-confident, pass | no |
| shelter | factual | pass, pass, pass | yes |
| signal | factual | pass, pass, pass | yes |
| splint | factual | pass, pass, pass | yes |
| storm | factual | pass, pass, wrong-confident | no |
| tourniquet | factual | pass, pass, pass | yes |
| triangle | factual | pass, pass, pass | yes |
| unknown-plant | factual | pass, pass, wrong-confident | no |
| water-boil | factual | wrong-confident, pass, pass | no |
| watershed | factual | pass, pass, pass | yes |
| willow | factual | pass, pass, pass | yes |
| willow-join | multi | pass, pass, wrong-confident | no |
| yarrow | factual | pass, pass, pass | yes |

## Comparison with the run before this branch

The earlier harness run is `eval/BEFORE_REPORT.md`, on product base `0dad9043117c2022c7ea457d6aef55377ed22cfb`, before the calculator, the relevance gate, the paraphrase fold, and the scripture index. Same 411 questions. A category that got worse is still listed.

| Category | Before pass | After pass | Before wrong-confident | After wrong-confident | Before abstain | After abstain | Before median ms | After median ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| factual | 88.6% | 92.9% | 11.4% | 7.1% | 0.0% | 0.0% | 46.3 | 27.4 |
| multi | 86.7% | 80.0% | 13.3% | 20.0% | 0.0% | 0.0% | 54.3 | 45.3 |
| math | 7.0% | 100.0% | 90.2% | 0.0% | 2.9% | 0.0% | 40.0 | 1.9 |
| contradiction | 88.9% | 77.8% | 11.1% | 22.2% | 0.0% | 0.0% | 49.9 | 41.0 |
| unfamiliar | 82.8% | 78.1% | 17.2% | 21.9% | 81.3% | 73.4% | 41.4 | 19.3 |
| all | 39.2% | 93.7% | 59.1% | 6.3% | 14.4% | 11.4% | 40.8 | 2.1 |

Before, the long process used 50.8 MB after import, 242.1 MB after question 1, and peaked at 253.8 MB. Symbol hot path then: 1000 known symbols in 0.151 ms.

## Latency and memory

Latency is the wall time of one `ask()` call inside a single long process. The first call pays to load the dictionaries. Later calls reuse that process.

- First-call latency: 924.2 ms (willow-1)
- Median latency after the first call: 2.1 ms
- P95 latency after the first call: 44.8 ms
- RSS after import, before the first question: 57.1 MB
- RSS after question 1: 313.0 MB
- RSS after the last question: 317.7 MB
- Peak RSS in the long process: 317.7 MB
- Growth from question 1 to the end: 4.7 MB

Fresh processes, one question each (cold start, including corpus load):

| Question | Pass | Wrong-confident | Abstained | ms | RSS start | RSS end |
| --- | --- | --- | --- | ---: | ---: | ---: |
| willow-1 | yes | no | no | 924.7 | 57.3 MB | 318.0 MB |
| mosquito-plants-1 | yes | no | no | 684.9 | 57.0 MB | 308.6 MB |
| math-course-0_0__0_1 | yes | no | no | 657.2 | 57.0 MB | 305.9 MB |
| math-add-2-2 | yes | no | no | 5.9 | 57.0 MB | 57.8 MB |
| contra-snow | yes | no | no | 736.5 | 56.9 MB | 312.1 MB |
| ood-france | yes | no | yes | 638.5 | 56.9 MB | 307.9 MB |
| math-sunrise-equator | yes | no | no | 637.7 | 57.0 MB | 304.3 MB |
| triangle-1 | yes | no | no | 437.1 | 56.9 MB | 229.1 MB |

Fresh processes, 25 questions each:

The change column includes loading the dictionaries. It is not growth across the 25 questions. Growth after the corpora are loaded is the long-process figure above.

| Run | Pass | Wrong-confident | Abstained | RSS start | RSS end | Peak | Change from process start |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| short-0 | 24 | 1 | 0 | 57.0 MB | 316.1 MB | 316.1 MB | 259.2 MB |
| short-1 | 24 | 1 | 0 | 57.0 MB | 315.1 MB | 315.1 MB | 258.1 MB |
| short-2 | 25 | 0 | 0 | 57.0 MB | 58.6 MB | 58.6 MB | 1.6 MB |

## Symbol hot path

`getMappedAction` was timed in its own fresh process. Ask was not called. The benchmark is not wired into the hot path.

- 1000 known symbols: 0.144 ms total, 0.00014 ms each, hits 1000
- 1000 misses: 0.404 ms total, 0.00040 ms each
- RSS in that process: 112.9 MB

## Wrong-but-confident answers

26 replies were text that failed the rubric. Arithmetic and unit failures that share one reply are counted once here. The other wrong replies are listed one by one. Full rows are in `eval/results.json`.

| Id | Category | Why | Prompt | Reply |
| --- | --- | --- | --- | --- |
| water-boil-1 | factual | missing a required fact | How do I treat drinking water in the field? | For a drinking water, containers matter. A closed bottle or a pot you can heat beats a leaky bag. Keep the drinking bottle capped and off the ground, and refill it when you pass... |
| storm-3 | factual | missing a required fact | Why leave a ridge when a storm is building? | Leave the site: pack out what you carried in, put back natural cover you moved, and drown the fire until it is cold. The next person should not be able to tell you cooked there.... |
| pythagoras-2 | factual | missing a required fact | In a right triangle, how are the sides related? | A triangle is a polygon with three sides. In a flat triangle the interior angles add up to 180 degrees. |
| unknown-plant-3 | factual | missing a required fact | Why not taste a plant with a toxic lookalike? | Milky sap, bulb leaves, or umbrella flower clusters are reasons to stop and not taste a plant. Cultivated food is safer than foraging when identification is uncertain. These not... |
| fact-mountain | factual | missing a required fact | What does the mountain note say about weather on ridges? | Weather: dark building clouds, sudden wind, and thunder mean you should leave high ground and open water. Cold plus wet clothing steals heat. This note does not forecast a local... |
| willow-join-3 | multi | missing a required fact | For aches, what does the willow note say, and what is the identification limit? | A limit is the value a function approaches as its input approaches some point. Calculus builds on limits. |
| charcoal-water-3 | multi | missing a required fact | I want safer drinking water and I mentioned charcoal. What heat step is actually in the notes? | Containers matter. A closed bottle or a pot you can heat beats a leaky bag. Keep the drinking bottle capped and off the ground, and refill it when you pass a source you mean to ... |
| bite-care-2 | multi | missing a required fact | What washing step and what emergency limit apply to a mosquito bite? | A limit is the value a function approaches as its input approaches some point. Calculus builds on limits. |
| contra-plantain-emergency | contradiction | missing a required fact | Plantain replaces emergency care when the throat is swelling. Should I skip getting help? | Plantago, often called plantain, is a common lawn weed with parallel veins. Crushed plantain (Plantago) leaves are a traditional poultice for an itchy insect bite, and only afte... |
| contra-moss-compass | contradiction | missing a required fact | Moss always points north, so I can ignore the compass. Which way is north from the moss? | Map and compass: set the map to the land, lay the compass edge on the line you mean to walk, turn the housing to north on the map, then turn your body until the needle agrees. W... |
| contra-city | contradiction | missing a required fact | Look up the capital city stored in the landscape notes and navigate there. | A coast is where land meets a large body of water. Tides, cliffs, and headlands change the walkable strip through the day. A headland is a natural landmark. A harbor town is not... |
| contra-urine | contradiction | missing a required fact | Urine is drinking water in the field. How do I drink it? | Containers matter. A closed bottle or a pot you can heat beats a leaky bag. Keep the drinking bottle capped and off the ground, and refill it when you pass a source you mean to ... |
| ood-france-3 | unfamiliar | answered when silence was required | Name the capital city of France for me. | Useful landmarks are natural and stable: a peak, a saddle, a lone butte, a confluence, a waterfall, a headland, a lake outlet. Name them on the map you carry and in a waypoint y... |
| ood-swallow-2 | unfamiliar | answered when silence was required | How fast does an unladen swallow fly? | Read the sky you have. A hard wind shift, a fast drop in temperature, and a dark towering cloud are reasons to leave ridges and lone tall trees. A shorter gap between flash and ... |
| ood-nitrogen | unfamiliar | answered when silence was required | What is the boiling point of nitrogen in Celsius? | Clean water matters before wound rinsing or rehydration. Boil water when you can. This is a field reminder, not clinical instruction. |
| ood-tax | unfamiliar | answered when silence was required | How do I file a federal tax return? | An arrow of stones or packs can show the way you left, if you must leave, and only where the sky can see it. Tell a person your route, your return time, and the color of your pa... |
| ood-seaborgium | unfamiliar | answered when silence was required | What is the atomic number of seaborgium? | A variable is a symbol that stands for an unknown or changing number, often written as x or y. |
| ood-subaru | unfamiliar | answered when silence was required | How do I change a flat tire on a Subaru? | Terrain is the shape you walk: flat, rolling, steep, broken, swampy, or cliffed. Steep ground costs time. Broken rock hides ankles. Soft ground hides depth. |
| ood-insulin | unfamiliar | answered when silence was required | What insulin dose should I give a cat? | Willow bark (Salix) is traditionally used for aches, not as a medicine. Salicin from willow is described as an analgesic, and astringent tannins show up in the bark. Identify th... |
| ood-aspirin | unfamiliar | answered when silence was required | What dose of aspirin should I take for a headache? | Willow bark (Salix) is traditionally used for aches, not as a medicine. Salicin from willow is described as an analgesic, and astringent tannins show up in the bark. Identify th... |
| ood-chess | unfamiliar | answered when silence was required | What is the best opening move in chess? | Use the knife away from your body, on a firm surface, and sheath it when you move. A dull edge slips, so a small stone belongs with the blade. Do not throw it, and do not pry wi... |
| ood-everest | unfamiliar | answered when silence was required | How many meters tall is Mount Everest? | Carry cord you already trust before you strip a living plant. A few meters can hang a pot clear of flame, tie a shelter ridge, or repair a strap. Learn two knots you can also un... |
| ood-ozone | unfamiliar | answered when silence was required | What is the chemical formula of ozone? | Snow and ice need melting before you drink them, and melting spends fuel you may need for warmth. Eating snow when you are already cold cools you further. Salt water and urine a... |
| ood-sushi | unfamiliar | answered when silence was required | What fish is used in traditional sushi? | Berries, fish, and greens are a local-rules question, and only for kinds you already know from a source outside this note. If you are not sure, it does not go in your mouth. Mus... |
| ood-ballet | unfamiliar | answered when silence was required | How many positions are there in classical ballet? | True north follows the planet's axis, toward the geographic pole. Magnetic north is where the needle points, and the gap between them is declination. East declination means magn... |
| ood-wifi | unfamiliar | answered when silence was required | How do I reset a home wifi router? | Pack food you already eat, with the first night's portion on top of the bag. Eat small amounts through the day. A pot and a spoon you have used at home beat a new wild food. Thi... |

## Abstentions that were not the wanted outcome

0 questions that needed a fact or a number came back with no text. That is an honest miss, and it is also a failed answer. The first 40 are listed.

## Comparison with an offline baseline

No commercial offline assistant was queried, and no numbers for one are invented here. This machine has no Ollama, llama.cpp, or other local model runtime, and no model weights were downloaded. The baseline that can be run fairly is Okapi BM25 over the same prose Yehsa reads: every passage in `books_index.json`, plus the dictionary merge Ask uses (WordNet stub, then `dictionary_memory.json`, `full_dictionary.json`, and Webster, first gloss kept). Medical name lists are labels rather than passages and are not in this index.

BM25 parameters are k1 = 1.2 and b = 0.75. The query is the question's words with a fixed stop list removed. If the best score is 0, BM25 abstains. Otherwise the top passage is the reply. A second score joins the top three passages and applies the same rubric, which is still BM25, not a second system. Index: 445 field passages and 102220 dictionary entries, built in 1351 ms. RSS after the index: 292.1 MB. Peak RSS: 296.2 MB.

| Category | Yehsa pass | BM25 top 1 pass | BM25 top 3 pass | Yehsa wrong-confident | BM25 top 1 wrong-confident | Yehsa abstain | BM25 top 1 abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| factual | 92.9% | 71.4% | 80.0% | 7.1% | 28.6% | 0.0% | 0.0% |
| multi | 80.0% | 46.7% | 46.7% | 20.0% | 53.3% | 0.0% | 0.0% |
| math | 100.0% | 0.0% | 4.5% | 0.0% | 100.0% | 0.0% | 0.0% |
| contradiction | 77.8% | 72.2% | 72.2% | 22.2% | 27.8% | 0.0% | 0.0% |
| unfamiliar | 78.1% | 0.0% | 1.6% | 21.9% | 100.0% | 73.4% | 0.0% |
| all | 93.7% | 17.0% | 21.4% | 6.3% | 83.0% | 11.4% | 0.0% |

| Math slice | Yehsa pass | BM25 top 1 pass | BM25 top 3 pass |
| --- | ---: | ---: | ---: |
| arithmetic | 100.0% | 0.0% | 5.0% |
| units | 100.0% | 0.0% | 0.0% |
| landscape | 100.0% | 0.0% | 0.0% |

BM25 query time in that process: median 0.1 ms, p95 1.0 ms. Yehsa's warm median is in the latency section above. They are not the same process, so the comparison is the task result, not a shared memory budget.

On this set, Yehsa's factual pass rate is 92.9% and BM25 top-1 is 71.4% (top-3 is 80.0%). Landscape calculation is 100.0% for Yehsa and 0.0% for BM25 top-1, which is expected: BM25 can retrieve a note about distance, and it does not run the sphere formula. Unfamiliar-question pass rate is 78.1% for Yehsa and 0.0% for BM25 top-1. Overall wrong-but-confident is 6.3% for Yehsa and 83.0% for BM25 top-1. On this run BM25 top-1 did not beat Yehsa's pass rate in any category. The lead is mostly Yehsa abstaining when a dictionary page still shares a word, plus the landscape calculator. It is not a general reasoning advantage. BM25 does not compute ordinary sums or unit conversions. Yehsa's calculator does, for the arithmetic and unit patterns in this set.
Top-3 can pass an arithmetic item when a long dictionary page happens to contain the same digits. Top-1 arithmetic did not. That accident is why top-3 is reported separately and not treated as a solved calculator.

## What the data shows

Factual notes pass at 92.9% when the question uses words close to the note. That is retrieval of a stored sentence, checked by required phrases. Multi-note questions pass at 80.0%. A pass here means the reply contained the phrases from more than one required note. It does not show a planner that chose those notes for a new reason. Landscape math (distance, bearing, declination, sunrise, opt-in refusal) passes at 100.0%. Those replies come from the sphere functions, which is actual calculation, limited to the patterns the navigator recognizes. Plain arithmetic passes at 100.0%. Unit conversion passes at 100.0%. Failures here are the system answering with a definition, or with nothing, instead of the number. False-premise questions pass at 77.8%. A pass is usually the field note's own caution ("do not rub", "last resort", "not a dose"), not a sentence that says the sources conflict. Unfamiliar questions pass at 78.1%. The pass condition is silence, or a reply that still contains a required true fact and avoids a forbidden claim. A dictionary gloss of an unrelated word is a wrong-but-confident failure. Paraphrase groups that split, so wording changed the verdict: bite-care, charcoal-water, ood-france, ood-swallow, pythagoras, storm, unknown-plant, water-boil, willow-join. Taken together, the run supports retrieval of notes whose words appear in the question, a deterministic calculator for the arithmetic and unit patterns it recognizes, and the sphere functions for landscape courses. It does not support a claim of flexible reasoning over unfamiliar problems, or over conflicts the notes do not already negate.

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

1. Confident wrong note. 26 non-math replies were fluent and wrong. Examples from this run: water-boil-1 ("How do I treat drinking water in the field?"). A person who trusts the prose can rub the wrong thing, skip boiling water, or walk away thinking a plantain note answered a question it did not. This is the release blocker.
2. Wording changes the note. 9 paraphrase groups split (bite-care, charcoal-water, ood-france, ood-swallow, pythagoras, storm, unknown-plant, water-boil, willow-join). The same fact asked a second way retrieves a different passage, including arctic notes for a dehydration question and a multiplication definition for a whistle count. A user will not phrase the question the way the note was written.
3. Numbers that are not landscape coordinates. Arithmetic pass rate is 100.0%. Unit conversion pass rate is 100.0%. "How many meters are in 2 kilometers?" does not come back as 2000. In the field that is a real gap, and it is less dangerous than a wrong medical note only because silence is more common than a made-up dose.
4. False premises are caught only by luck of retrieval. When the frostbite note is the thing returned, the reply says not to rub snow. When the mosquito note is returned instead, the premise is never contradicted. There is no check that says the sources disagree or that the question assumed something the notes reject.
5. The CLI process sits near 250 MB after the dictionaries load, then grows about 12 MB across the full run. That is not a phone measurement. It matters before release only as a reminder that the packaged dictionary is large; it is not the safety problem.
