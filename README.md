# Yehsa / Axi0net

Yehsa (also spelled Yesha) is an experimental offline symbolic agent. The phone shell is the Expo app Axi0net (`App.js`, `App.tsx`, `index.js`). The agent itself is local Node scripts plus Termux/Android helpers for speech and Bluetooth. Optional HTTP and TCP listeners map allowlisted symbols to local actions. They are not open mesh ingress.

Most of this repository is local dictionary and trainer data under `symbolic_memory/`. Mesh, BLE, and radio modules are experimental scaffolds. Many of them only log a line. They do not talk to live radios.

The root `package.json` is CommonJS, matching the Expo lockfile. ESM code stays in `.mjs` files and in the `symbolic/` and `yesha_modules/` packages (`"type": "module"`). `yehsa_modules/` re-exports the canonical `yesha_modules/` path.

`LICENSE` says the software is proprietary. The GitHub repository is public. This tree does not change repository visibility.

## Run

Install dependencies, then:

```bash
npm install
npm run yesha          # node yesha_modules/yesha.js
npm run trainer        # run_trainer.sh → node symbolic/symbolic_trainer.js
```

`yesha.js` starts the small central dispatch loop (`startAutonomyLoop` plus `evaluateTriggers` every 3 seconds). It does not walk `trainer_learned.json`.

The long autonomy loop is separate, and it only starts when you run it directly:

```bash
npm run autonomy       # node symbolic/symbolic_autonomy_loop.js
```

Importing that module does not start the loop.

## HTTP and TCP listeners

Both require `YEHSA_MESH_TOKEN`. They bind to `127.0.0.1` unless you set `YEHSA_BIND_HOST` to another address.

```bash
export YEHSA_MESH_TOKEN="choose-a-long-random-token"
npm run mesh:http      # POST /symbol on PORT (default 3180)
npm run mesh:tcp       # JSON over TCP on YEHSA_WATCHDOG_PORT (default 3175)
```

HTTP accepts the token as `Authorization: Bearer <token>` or `X-Yehsa-Token`. The body is `{ "symbol": "<allowlisted symbol>" }`. The symbol must exist in `symbolic/symbolic_dictionary.js`. The request is executed locally. It is not treated as a trusted mesh command, and a client-supplied `action` is ignored.

TCP expects one JSON object: `{ "token": "<token>", "symbol": "<allowlisted symbol>" }`. After the token and allowlist checks, the symbol is dispatched through the mesh listener.

Speech and Bluetooth helpers (`symbolic/symbolic_speaker.js`, `utils/mesh_utils.mjs`) pass arguments with `execFile` and reject unexpected payload text. They still expect Termux commands (`termux-tts-speak`, `termux-bluetooth-send`) when those binaries exist.

## Dictionaries and books

The running agent reads these local stores. They are not only files sitting next to the code.

- `symbolic/symbolic_dictionary.js` is the curated symbol map used by `getMappedAction`.
- If a symbol is not in that map, lookup continues through `symbolic_memory/wordnet_raw.json`, `dictionary_memory.json`, `full_dictionary.json`, and `webster_raw.json`.
- `wordnet_raw.json` is the committed stub: one gloss (`fear`). An earlier copy of this file was the text `404: Not Found`. There is no full WordNet download in the repo.
- `dictionary_memory.json` had one missing headword (`fingle-fangle`) that made the JSON invalid. That key is restored from Webster so the file loads.
- Books are indexed from `symbolic_memory/full_book_verses.json`, `symbolic_memory/tao_te_ching.json` (two committed verses, not a full translation), usable files in `symbolic_books/`, and non-HTML lines in `symbolic_memory/book_queue/combined_queue.json`.

```bash
npm run dictionary:load     # parse dictionary_memory.json and print the count
npm run books:ingest        # rebuild symbolic_memory/books_index.json
npm run dictionary:build    # merge Webster and the WordNet stub into full_dictionary.json
```

`dictionary:build` rewrites `full_dictionary.json`. It keeps existing keys and adds Webster entries. Run it only when you want that merge.

`yesha.js` asks the knowledge index on each trigger. `semanticAnswer` searches trainer memory, then the dictionaries and book index.

See `symbolic_books/README.md` for how to drop another `.txt` or verse `.json` into the library. Do not commit copyrighted books. Failed Gutenberg downloads are left as placeholders and skipped by the indexer.

## Benchmarks

`benchmark_symbol_exec.mjs`, `benchmark_chain_exec.mjs`, and `benchmark_text_search.mjs` are standalone tools. They do not replace the executor or the mesh listener. Symbol execution inside the benchmark is off unless `YEHSA_BENCHMARK_EXECUTE=1`.

## Expo shell

`npm start` uses Expo and `babel.config.js` (`babel-preset-expo`). `App.js` and `App.tsx` both call `useAxionetRuntimeGuarantee`. That hook is a documented stub: it does not keep the app alive, and it is not a biometric or encryption feature. `assets/icon.png` is a placeholder because the original icon was not committed.

This environment has no phone or emulator. `node App.js` still fails on JSX; Metro is what compiles the shell. A web export also needs `react-native-web`, which this package does not depend on. The Node agent paths above are the runnable offline system.
