# Offline meaning matcher

Ask matches words. The meaning matcher adds a check on what a question means, so a reworded
question ("blood keeps dripping out of my kid's nostrils") can reach the right note, and a note
that only shares words with the question is not used. It runs fully offline on the phone and in
Node, and every reply is still a stored note or a quoted passage. Nothing is generated.

## What it is

- A small sentence-embedding model (bge-small-en-v1.5, int8 ONNX, about 34 MB, MIT license),
  not a language model.
- Precomputed int8 vectors for the approved field notes (medical, herbology, landscape,
  survival, math topics), routing prototypes, and the scripture index.
- On the phone: `onnxruntime-react-native` (Expo config plugin, version pinned by
  `plugins/withOrtVersion.js`). In Node: `onnxruntime-node` (dev dependency, used by the eval).
- Lazy: the model loads on the first question that needs it, never at launch.
- Off the hot path: `getMappedAction` and `symbolic_dictionary.js` never import it
  (`test_meaning_matcher.mjs` checks the import graph).

## Order of decisions

1. Calculators, dictionary lookups, safety corrections, and exact references
   (John 3:16, chapter 1 stanza 1) answer first, unchanged.
2. A lexical note is kept when the meaning agrees with it.
3. When lexical and meaning clearly disagree, the meaning note is used if it clears the
   threshold and margin. If they disagree strongly and no note is clear, Ask stays silent.
4. When lexical found nothing, a meaning note fills the gap only above a threshold plus a margin
   over notes from other topics, and only when it shares a content word with the question,
   the question names the note's condition, or the meaning score is very high.
5. Questions that read as shopping, news, crafts, prices, or drug doses do not get a filled note.
6. Hard rule: a care or medication note is never attached to an unrelated injury
   (`symbolic/meaning/treatment_guard.js`). This also applies on the lexical path.

It is also used for:

- Emergency detection from described signs (`result.emergency`), which adds the reassurance line.
- Scripture retrieval by meaning when there is no exact reference, and routing questions like
  "What does the Bible say about worry?" to the quoted texts.
- Multi-part questions: each part that clearly matches its own note gets that note.

The thresholds are in `THRESHOLDS` in `symbolic/meaning/meaning_layer.js`. They were tuned on
the paraphrase dev set below, so that set is not an unbiased measure. A blind set is needed for that.

## Measured

See `eval/paraphrase_results.json` and the PR description for the numbers. Commands:

```bash
node eval/run.mjs && node eval/gate.mjs     # frozen 411 gate, meaning on when the model is present
node eval/dev_run.mjs                       # dev set (add --lexical for the old path)
node eval/paraphrase_run.mjs                # 100 reworded questions (add --lexical for before)
npm run test:meaning
```

`YEHSA_MEANING_OFF=1` turns the matcher off in Node.
