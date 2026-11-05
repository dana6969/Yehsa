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

## Benchmarks

`benchmark_symbol_exec.mjs`, `benchmark_chain_exec.mjs`, and `benchmark_text_search.mjs` are standalone tools. They do not replace the executor or the mesh listener. Symbol execution inside the benchmark is off unless `YEHSA_BENCHMARK_EXECUTE=1`.

## Expo shell

`npm start` launches Expo. `App.tsx` imports `src/hooks/useAxionetRuntimeGuarantee`, which is a documented stub: the original hook was not in this repository, and the stub does not keep the process alive. `assets/icon.png` is a placeholder because the original icon file was not committed. `App.js` remains the plain Expo starter.
