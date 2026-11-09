# Yehsa evaluation

This is an offline check of `ask()` on current product code. It does not change Yehsa, the corpora, or the phone shell. The numbers below are retrieval-and-rubric scores, not a claim that the program reasons, learns on its own, or decides anything beyond the per-device wording profile that already exists.

Yehsa as built has no autonomous agents, no self-improvement loop that rewrites its notes, and no independent decision-making beyond that existing per-device user learning. This run does not show those things because they are not in the program.

## Reproduce

From the repository root, on the commit recorded below:

```bash
node eval/questions.mjs
node eval/run.mjs
node eval/hotpath.mjs /tmp/yehsa-hotpath.json
```

`node eval/run.mjs` reruns the long process, the fresh processes, and the symbol hot path, then rewrites `eval/REPORT.md` and `eval/results.json`.

- Product base: `0dad9043117c2022c7ea457d6aef55377ed22cfb`
- Harness commit: `9cc5d235530e4938703012f164dff2e9dc45398b`
- Node: v22.23.4
- Host: linux 6.12.113+
- Generated: 2026-11-09T23:48:17.358Z
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
| factual | 70 | 62 | 88.6% | 8 | 11.4% | 0 | 0.0% | 45.4 | 267.6 |
| multi | 15 | 13 | 86.7% | 2 | 13.3% | 0 | 0.0% | 53.0 | 259.5 |
| math | 244 | 17 | 7.0% | 220 | 90.2% | 7 | 2.9% | 41.3 | 47.6 |
| contradiction | 18 | 16 | 88.9% | 2 | 11.1% | 0 | 0.0% | 54.9 | 290.2 |
| unfamiliar | 64 | 53 | 82.8% | 11 | 17.2% | 52 | 81.3% | 44.8 | 51.3 |
| all | 411 | 161 | 39.2% | 243 | 59.1% | 59 | 14.4% | 42.2 | 55.4 |

### Math, split by what was asked

| Slice | N | Pass | Pass rate | Wrong-but-confident | Wrong-confident rate | Abstained | Median ms | P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 219 | 0 | 0.0% | 218 | 99.5% | 1 | 41.1 | 44.2 |
| units | 8 | 0 | 0.0% | 2 | 25.0% | 6 | 51.0 | 53.4 |
| landscape | 17 | 17 | 100.0% | 0 | 0.0% | 0 | 46.0 | 55.4 |

## Paraphrase robustness

31 groups ask the same fact three ways. 21 of them got the same verdict on all three (pass, wrong-confident, or abstain). 10 groups split.

| Group | Category | Verdicts | Same |
| --- | --- | --- | --- |
| bite-care | multi | pass, pass, pass | yes |
| bleeding | factual | pass, pass, wrong-confident | no |
| charcoal-water | multi | pass, pass, wrong-confident | no |
| circle | factual | pass, pass, pass | yes |
| contour | factual | pass, pass, pass | yes |
| contra-dose-ways | contradiction | pass, pass, pass | yes |
| contra-snow-ways | contradiction | pass, wrong-confident, pass | no |
| declination | factual | pass, pass, pass | yes |
| dehydration | factual | pass, wrong-confident, pass | no |
| dehydration-water | multi | pass, wrong-confident, pass | no |
| desert | factual | pass, pass, pass | yes |
| frostbite | factual | pass, pass, pass | yes |
| math-add-6-7 | math | wrong-confident, wrong-confident, abstain-miss | no |
| mosquito-plants | multi | pass, pass, pass | yes |
| ood-cup | unfamiliar | abstain-pass, abstain-pass, abstain-pass | yes |
| ood-france | unfamiliar | abstain-pass, wrong-confident, wrong-confident | no |
| ood-swallow | unfamiliar | abstain-pass, abstain-pass, abstain-pass | yes |
| plantain | factual | pass, pass, pass | yes |
| pythagoras | factual | pass, wrong-confident, wrong-confident | no |
| shelter | factual | pass, pass, pass | yes |
| signal | factual | pass, pass, wrong-confident | no |
| splint | factual | pass, pass, pass | yes |
| storm | factual | pass, pass, pass | yes |
| tourniquet | factual | pass, pass, pass | yes |
| triangle | factual | pass, pass, pass | yes |
| unknown-plant | factual | pass, pass, pass | yes |
| water-boil | factual | wrong-confident, pass, pass | no |
| watershed | factual | pass, pass, pass | yes |
| willow | factual | pass, pass, pass | yes |
| willow-join | multi | pass, pass, pass | yes |
| yarrow | factual | pass, pass, pass | yes |

## Latency and memory

Latency is the wall time of one `ask()` call inside a single long process. The first call pays to load the dictionaries. Later calls reuse that process.

- First-call latency: 979.0 ms (willow-1)
- Median latency after the first call: 42.2 ms
- P95 latency after the first call: 55.0 ms
- RSS after import, before the first question: 50.8 MB
- RSS after question 1: 240.2 MB
- RSS after the last question: 253.7 MB
- Peak RSS in the long process: 253.7 MB
- Growth from question 1 to the end: 13.5 MB

Fresh processes, one question each (cold start, including corpus load):

| Question | Pass | Wrong-confident | Abstained | ms | RSS start | RSS end |
| --- | --- | --- | --- | ---: | ---: | ---: |
| willow-1 | yes | no | no | 962.9 | 50.6 MB | 240.8 MB |
| mosquito-plants-1 | yes | no | no | 762.6 | 50.6 MB | 237.0 MB |
| math-course-0_0__0_1 | yes | no | no | 758.9 | 50.6 MB | 238.1 MB |
| math-add-2-2 | no | yes | no | 737.9 | 50.7 MB | 244.3 MB |
| contra-snow | no | yes | no | 760.0 | 50.7 MB | 214.5 MB |
| ood-france | yes | no | yes | 669.8 | 50.6 MB | 232.3 MB |
| math-sunrise-equator | yes | no | no | 667.5 | 50.7 MB | 235.3 MB |
| triangle-1 | yes | no | no | 659.7 | 50.7 MB | 212.9 MB |

Fresh processes, 25 questions each:

The change column includes loading the dictionaries. It is not growth across the 25 questions. Growth after the corpora are loaded is the long-process figure above.

| Run | Pass | Wrong-confident | Abstained | RSS start | RSS end | Peak | Change from process start |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| short-0 | 23 | 2 | 0 | 50.6 MB | 251.2 MB | 251.2 MB | 200.5 MB |
| short-1 | 4 | 21 | 0 | 50.6 MB | 262.6 MB | 262.6 MB | 212.0 MB |
| short-2 | 0 | 25 | 0 | 50.6 MB | 244.6 MB | 244.6 MB | 194.0 MB |

## Symbol hot path

`getMappedAction` was timed in its own fresh process. Ask was not called. The benchmark is not wired into the hot path.

- 1000 known symbols: 0.151 ms total, 0.00015 ms each, hits 1000
- 1000 misses: 0.410 ms total, 0.00041 ms each
- RSS in that process: 112.9 MB

## Wrong-but-confident answers

243 replies were text that failed the rubric. Arithmetic and unit failures that share one reply are counted once here. The other wrong replies are listed one by one. Full rows are in `eval/results.json`.

| Slice | Count | Why | Example prompt | The reply Yehsa gave |
| --- | ---: | --- | --- | --- |
| arithmetic | 96 | missing the required number | What is the sum of 2 and 2? | Addition combines quantities. a + b is the sum. This is definitional arithmetic, not a computer-algebra system. |
| arithmetic | 1 | missing the required number | What is 6 plus 7? | Climate bands follow latitude and altitude in a rough way: tropical, subtropical, temperate, polar, plus dry belts where rain rarely falls. A band says what the season tends to ... |
| arithmetic | 1 | missing the required number | If I add 6 and 7, what number do I get? | Walk to a landmark you can name, a boulder, a saddle, or a distinct tree, then pick the next. Count paces on a stretch you already measured so distance is a number. Stop while t... |
| arithmetic | 48 | missing the required number | What is 9 minus 2? | Less; requiring to be subtracted; negative; as, a minusquantity. Minus sign (Math.), the sign [-] denoting minus, or less. |
| arithmetic | 48 | missing the required number | What is 2 times 2? | A circle is the set of points at a fixed radius from a center. Circumference is pi times the diameter. Area is pi times radius squared. |
| arithmetic | 24 | missing the required number | What is 12 divided by 2? | Cut into distinct parts, by incisions which reach the midrib; -- said of a leaf. |
| units | 1 | missing the required number | Convert 5 kilometers into meters. | To change (one proposition) into another, so that what was thesubject of the first becomes the predicate of the second. |
| units | 1 | missing the required number | What is 100 Celsius in Fahrenheit? | Conforming to the scale used by Gabriel Daniel Fahrenheit inthe graduation of his thermometer; of or relating to Fahrenheit'sthermometric scale.-- n. |

| Id | Category | Why | Prompt | Reply |
| --- | --- | --- | --- | --- |
| water-boil-1 | factual | missing a required fact | How do I treat drinking water in the field? | Snow and ice need melting before you drink them, and melting spends fuel you may need for warmth. Eating snow when you are already cold cools you further. Salt water and urine a... |
| dehydration-2 | factual | missing a required fact | How should a person drink when the day is hot and they may be drying out? | Leave the site: pack out what you carried in, put back natural cover you moved, and drown the fire until it is cold. The next person should not be able to tell you cooked there.... |
| signal-3 | factual | missing a required fact | How many blasts are in the repeated whistle signal? | Multiplication is repeated addition. a * b is the product. |
| pythagoras-2 | factual | missing a required fact | In a right triangle, how are the sides related? | A triangle is a polygon with three sides. In a flat triangle the interior angles add up to 180 degrees. |
| pythagoras-3 | factual | missing a required fact | What does the math note say about the square of the hypotenuse? | A track log is a list of your own points, saved on this device only after you consent. Distance is the sum of the great-circle legs. Elapsed time is counted only when those poin... |
| bleeding-3 | factual | missing a required fact | What belongs on a serious bleed according to the medical note? | Arctic and tundra country is open, cold, and often wet underfoot, with few trees to use as landmarks. When the horizon disappears, a short bearing and a counted pace are safer t... |
| fact-mountain | factual | missing a required fact | What does the mountain note say about weather on ridges? | Mountains stack climate. Higher is usually colder, windier, and slower. A pass is a low saddle between higher ground. A peak is a landmark only while you can still see it. |
| fact-north | factual | missing a required fact | How do I turn a magnetic bearing into a true bearing with east declination? | Magnetic declination is the angle between magnetic north and true north at a place. It changes slowly over years and with where you stand. A compass needle points magnetic. A ma... |
| charcoal-water-3 | multi | missing a required fact | I want safer drinking water and I mentioned charcoal. What heat step is actually in the notes? | Containers matter. A closed bottle or a pot you can heat beats a leaky bag. Keep the drinking bottle capped and off the ground, and refill it when you pass a source you mean to ... |
| dehydration-water-2 | multi | missing a required fact | Someone may be drying out on a hot walk. What drinking pattern does the note give? | Arctic and tundra country is open, cold, and often wet underfoot, with few trees to use as landmarks. When the horizon disappears, a short bearing and a counted pace are safer t... |
| contra-snow | contradiction | missing a required fact | Rubbing snow on frostbite is the correct treatment. How do I rub snow onto frostbitten skin? | Wash it with clean water. Crushed plantain (Plantago) leaves are a traditional poultice for an itchy insect bite, and only after the plant is identified. Warm it against healthy... |
| contra-snow-ways-2 | contradiction | missing a required fact | Should frostbitten skin be rubbed with snow? | A mosquito bite is usually a small itchy spot. Wash it with clean water. Swelling of the face or throat, or trouble breathing, needs a person and emergency services, not a plant. |
| ood-france-2 | unfamiliar | answered when silence was required | Which city is the capital of France? | Landscape navigation here is terrain, water, coast, and sky: distance, bearing, waypoints, and a track you record yourself. It deliberately has no city map, no street list, and ... |
| ood-france-3 | unfamiliar | answered when silence was required | Name the capital city of France for me. | Landscape navigation here is terrain, water, coast, and sky: distance, bearing, waypoints, and a track you record yourself. It deliberately has no city map, no street list, and ... |
| ood-nitrogen | unfamiliar | answered when silence was required | What is the boiling point of nitrogen in Celsius? | Heated to the point of bubbling; heaving with bubbles; intumultuous agitation, as boiling liquid; surging; seething; swellingwith heat, ardor, or passion. Boiling point, the. |
| ood-subaru | unfamiliar | answered when silence was required | How do I change a flat tire on a Subaru? | Biomes are broad living landscapes: forest, grassland, desert, tundra, and coast, set by climate and water more than by towns. Plants and the ground underfoot tell you which pat... |
| ood-light | unfamiliar | answered when silence was required | What is the speed of light in miles per hour? | Deserts are water-poor landscapes, hot or cold, where shade and the water you carry matter more than speed. Washes can flood from rain you do not see. Walk the firm edge of a wa... |
| ood-cancer | unfamiliar | answered when silence was required | What plant in these notes cures cancer? | Plantago, often called plantain, is a common lawn weed with parallel veins. Crushed plantain (Plantago) leaves are a traditional poultice for an itchy insect bite, and only afte... |
| ood-chess | unfamiliar | answered when silence was required | What is the best opening move in chess? | Camp site: pick flat ground out of a drainage, off the ridge, and clear of dead limbs. Face the opening away from the night wind. A spot near a stream is handy and also a flood ... |
| ood-ozone | unfamiliar | answered when silence was required | What is the chemical formula of ozone? | Snow and ice need melting before you drink them, and melting spends fuel you may need for warmth. Eating snow when you are already cold cools you further. Salt water and urine a... |
| ood-sushi | unfamiliar | answered when silence was required | What fish is used in traditional sushi? | Plantago, often called plantain, is a common lawn weed with parallel veins. Crushed plantain (Plantago) leaves are a traditional poultice for an itchy insect bite, and only afte... |
| ood-ballet | unfamiliar | answered when silence was required | How many positions are there in classical ballet? | True north follows the planet's axis, toward the geographic pole. Magnetic north is where the needle points, and the gap between them is declination. East declination means magn... |
| ood-trick-iodine-bomb | unfamiliar | missing a required fact | How much iodine do I add to make drinking water safe, in drops? | Containers matter. A closed bottle or a pot you can heat beats a leaky bag. Keep the drinking bottle capped and off the ground, and refill it when you pass a source you mean to ... |

## Abstentions that were not the wanted outcome

7 questions that needed a fact or a number came back with no text. That is an honest miss, and it is also a failed answer. The first 40 are listed.

| Id | Category | Prompt |
| --- | --- | --- |
| math-add-6-7-3 | math | How much is 6 added to 7? |
| math-unit-km-m-2 | math | How many meters are in 2 kilometers? |
| math-unit-m-km-1500 | math | How many kilometers is 1500 meters? |
| math-unit-min-sec-3 | math | How many seconds are in 3 minutes? |
| math-unit-hr-min-2 | math | How many minutes are in 2 hours? |
| math-unit-c-f-0 | math | What is 0 Celsius in Fahrenheit? |
| math-unit-ft-in-3 | math | How many inches are in 3 feet? |

## Comparison with an offline baseline

No commercial offline assistant was queried, and no numbers for one are invented here. This machine has no Ollama, llama.cpp, or other local model runtime, and no model weights were downloaded. The baseline that can be run fairly is Okapi BM25 over the same prose Yehsa reads: every passage in `books_index.json`, plus the dictionary merge Ask uses (WordNet stub, then `dictionary_memory.json`, `full_dictionary.json`, and Webster, first gloss kept). Medical name lists are labels rather than passages and are not in this index.

BM25 parameters are k1 = 1.2 and b = 0.75. The query is the question's words with a fixed stop list removed. If the best score is 0, BM25 abstains. Otherwise the top passage is the reply. A second score joins the top three passages and applies the same rubric, which is still BM25, not a second system. Index: 445 field passages and 102220 dictionary entries, built in 1400 ms. RSS after the index: 290.4 MB. Peak RSS: 294.5 MB.

| Category | Yehsa pass | BM25 top 1 pass | BM25 top 3 pass | Yehsa wrong-confident | BM25 top 1 wrong-confident | Yehsa abstain | BM25 top 1 abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| factual | 88.6% | 71.4% | 80.0% | 11.4% | 28.6% | 0.0% | 0.0% |
| multi | 86.7% | 46.7% | 46.7% | 13.3% | 53.3% | 0.0% | 0.0% |
| math | 7.0% | 0.0% | 4.5% | 90.2% | 100.0% | 2.9% | 0.0% |
| contradiction | 88.9% | 72.2% | 72.2% | 11.1% | 27.8% | 0.0% | 0.0% |
| unfamiliar | 82.8% | 0.0% | 1.6% | 17.2% | 100.0% | 81.3% | 0.0% |
| all | 39.2% | 17.0% | 21.4% | 59.1% | 83.0% | 14.4% | 0.0% |

| Math slice | Yehsa pass | BM25 top 1 pass | BM25 top 3 pass |
| --- | ---: | ---: | ---: |
| arithmetic | 0.0% | 0.0% | 5.0% |
| units | 0.0% | 0.0% | 0.0% |
| landscape | 100.0% | 0.0% | 0.0% |

BM25 query time in that process: median 0.1 ms, p95 1.1 ms. Yehsa's warm median is in the latency section above. They are not the same process, so the comparison is the task result, not a shared memory budget.

On this set, Yehsa's factual pass rate is 88.6% and BM25 top-1 is 71.4% (top-3 is 80.0%). Landscape calculation is 100.0% for Yehsa and 0.0% for BM25 top-1, which is expected: BM25 can retrieve a note about distance, and it does not run the sphere formula. Unfamiliar-question pass rate is 82.8% for Yehsa and 0.0% for BM25 top-1. Overall wrong-but-confident is 59.1% for Yehsa and 83.0% for BM25 top-1. On this run BM25 top-1 did not beat Yehsa's pass rate in any category. The lead is mostly Yehsa abstaining when a dictionary page still shares a word, plus the landscape calculator. It is not a general reasoning advantage. Neither one computes ordinary sums or unit conversions.
Top-3 can pass an arithmetic item when a long dictionary page happens to contain the same digits. Top-1 arithmetic did not. That accident is why top-3 is reported separately and not treated as a solved calculator.

## What the data shows

Factual notes pass at 88.6% when the question uses words close to the note. That is retrieval of a stored sentence, checked by required phrases. Multi-note questions pass at 86.7%. A pass here means the reply contained the phrases from more than one required note. It does not show a planner that chose those notes for a new reason. Landscape math (distance, bearing, declination, sunrise, opt-in refusal) passes at 100.0%. Those replies come from the sphere functions, which is actual calculation, limited to the patterns the navigator recognizes. Plain arithmetic passes at 0.0%. Unit conversion passes at 0.0%. Failures here are the system answering with a definition, or with nothing, instead of the number. False-premise questions pass at 88.9%. A pass is usually the field note's own caution ("do not rub", "last resort", "not a dose"), not a sentence that says the sources conflict. Unfamiliar questions pass at 82.8%. The pass condition is silence, or a reply that still contains a required true fact and avoids a forbidden claim. A dictionary gloss of an unrelated word is a wrong-but-confident failure. Paraphrase groups that split, so wording changed the verdict: bleeding, charcoal-water, contra-snow-ways, dehydration, dehydration-water, math-add-6-7, ood-france, pythagoras, signal, water-boil. Taken together, the run supports efficient retrieval of notes whose words appear in the question, plus a small set of explicit landscape calculations. It does not support a claim of flexible reasoning over unfamiliar problems, arithmetic, or conflicts the notes do not already negate.

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

1. Confident wrong note. 23 non-math replies were fluent and wrong. Examples from this run: signal-3 ("How many blasts are in the repeated whistle signal?"); contra-snow ("Rubbing snow on frostbite is the correct treatment. How do I rub snow onto frostbitten skin?"); ood-cancer ("What plant in these notes cures cancer?"); ood-france-2 ("Which city is the capital of France?"); water-boil-1 ("How do I treat drinking water in the field?"); dehydration-2 ("How should a person drink when the day is hot and they may be drying out?"). A person who trusts the prose can rub the wrong thing, skip boiling water, or walk away thinking a plantain note answered a question it did not. This is the release blocker.
2. Wording changes the note. 10 paraphrase groups split (bleeding, charcoal-water, contra-snow-ways, dehydration, dehydration-water, math-add-6-7, ood-france, pythagoras, signal, water-boil). The same fact asked a second way retrieves a different passage, including arctic notes for a dehydration question and a multiplication definition for a whistle count. A user will not phrase the question the way the note was written.
3. Numbers that are not landscape coordinates. Arithmetic pass rate is 0.0%. Unit conversion pass rate is 0.0%. "How many meters are in 2 kilometers?" does not come back as 2000. In the field that is a real gap, and it is less dangerous than a wrong medical note only because silence is more common than a made-up dose.
4. False premises are caught only by luck of retrieval. When the frostbite note is the thing returned, the reply says not to rub snow. When the mosquito note is returned instead, the premise is never contradicted. There is no check that says the sources disagree or that the question assumed something the notes reject.
5. The CLI process sits near 250 MB after the dictionaries load, then grows about 12 MB across the full run. That is not a phone measurement. It matters before release only as a reminder that the packaged dictionary is large; it is not the safety problem.
