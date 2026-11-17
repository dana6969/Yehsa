# The frozen 411 evaluation

This note describes a development check that lives in this repository. It is not a published scorecard, not a marketing claim, and not proof that Yehsa is complete or perfect. Nothing here should be posted or quoted in public until Dana has reviewed it.

## What it is

`eval/regression/v1/` is a frozen set of 411 questions, with expected-answer rubrics, gate thresholds, and a SHA-256 manifest. Do not edit v1. If the suite needs to grow, add a new folder such as `eval/regression/v2/`.

The runner calls `ask()` on current product code. It does not change Yehsa, the field notes, or the dictionaries. Expo and EAS are not used. Knowledge is not tuned to these questions.

The product goal of the check is honesty: required facts should be present when a note covers them, and the app should stay silent rather than guess when it does not have a note.

## Outcome buckets

Each question is placed in one bucket. Correct, incorrect, and refusals add up to 411. Incorrect is incorrect-confident plus incorrect-hedged. Refusals are appropriate abstentions plus unnecessary refusals.

- **Correct.** The reply meets the rubric: required phrases or numbers are present, and no forbidden claim is present.
- **Incorrect-confident.** The app answered, the rubric failed, and the wording does not hedge. The gate fails if this count is above zero.
- **Incorrect-hedged.** The app answered, the rubric failed, and the wording shows uncertainty (for example "I am not sure").
- **Appropriate abstention.** The app gave no answer, and the rubric allowed or required silence. This is the honest miss: "No offline note answered that."
- **Unnecessary refusal.** The app stayed silent on a question that should have been answered. The gate fails if this count is above zero.

Rubric kinds:

- `facts` and `number`: a reply is required, every required phrase is present, no forbidden phrase is present, and any required number is present within tolerance.
- `abstain`: a reply is a failure. Silence is the pass.
- `abstain_or_facts`: either an honest miss or a reply that meets the fact rules. A confident reply that misses the facts is not a pass.

The questions cover factual retrieval from the notes, multi-note replies, arithmetic and unit and landscape math, false premises, and wording whose distinctive phrase is not in the field index.

## The gate

The frozen floor is:

- at least 349 correct
- 0 incorrect-confident answers
- 0 unnecessary refusals
- a total of 411 questions

CI runs this gate on each push and pull request (`.github/workflows/eval-gate.yml`). It also fails if v1 changes without a new version folder, or if a v1 question is removed.

The recorded baseline in `eval/baseline_breakdown.json` is 349 correct, 0 incorrect-confident, 0 incorrect-hedged, 62 appropriate abstentions, and 0 unnecessary refusals, on 411 questions. A later run may move a question from one passing bucket to another; it must not fall below that floor.

## How to reproduce

From the repository root:

```bash
node eval/run.mjs
node eval/gate.mjs
```

`node eval/run.mjs` scores every frozen v1 question, then also:

- starts eight fresh processes, one question each
- starts three fresh processes, 25 questions each
- times the `getMappedAction` hot path
- runs a BM25 baseline for comparison

It rewrites `eval/REPORT.md` and `eval/results.json`. `node eval/gate.mjs` reads those results and exits with a non-zero status if the floor is missed.

Do not regenerate the v1 questions as part of a routine run. `eval/questions.mjs` is the older builder; the frozen suite is loaded from `eval/regression/v1/`.

The symbol timing and the BM25 comparison can be run on their own:

```bash
node eval/hotpath.mjs /tmp/yehsa-hotpath.json
node eval/bm25.mjs /tmp/yehsa-bm25.json
```

## What this is not

This check is a retrieval-and-rubric score, not a claim that Yehsa reasons, learns on its own, or is ready for every field use. It is not permission to post the numbers, the questions, or this document outside the repository.
