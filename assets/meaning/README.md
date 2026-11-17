# Offline meaning matcher assets

- `bge-small-en-v1.5-int8.onnx`: BAAI/bge-small-en-v1.5 sentence-embedding model, int8 dynamic
  quantization as published in the ONNX export at https://huggingface.co/Xenova/bge-small-en-v1.5
  (`onnx/model_quantized.onnx`). 384 dimensions, CLS pooling. About 34 MB.
  SHA-256 `6c9c6101a956d62dfb5e7190c538226c0c5bb9cb27b651234b6df063ee7dbfe4`.
  License: MIT (https://huggingface.co/BAAI/bge-small-en-v1.5). Copyright (c) BAAI.
  It is an embedding model, not a language model. It turns a sentence into a vector; it never writes text.
- `scripture.i8`: int8 vectors for the passages of `symbolic_memory/spiritual_index.json`, in the
  same row order. Built by `npm run meaning:index`.

The field-note vectors and routing prototypes are small and live in `symbolic/meaning/notes_index.js`.
Rebuild both after any note or prototype change: `npm run meaning:index` (or `-- --notes` for the
notes only). `test_meaning_matcher.mjs` fails if a note changed and the index was not rebuilt.

The tokenizer in `symbolic/meaning/wordpiece.js` uses the model's own WordPiece vocabulary
(`symbolic/meaning/vocab.js`, from the same model repository).
