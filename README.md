# Yehsa / Axi0net

Yehsa (also spelled Yesha) is an experimental offline symbolic agent. The phone app a person opens is Yehsa (`App.js`, `App.tsx`, `index.js`). The npm package name and the Expo slug stay Axi0net so the existing shell and EAS project keep their technical ids. The agent itself is local Node scripts plus Termux/Android helpers for speech and Bluetooth. Optional HTTP and TCP listeners map allowlisted symbols to local actions. They are not open mesh ingress.

Most of this repository is local dictionary and trainer data under `symbolic_memory/`. The Termux mesh helpers call `termux-bluetooth-scan` and `termux-bluetooth-connect` when those binaries exist, and they degrade when they do not. An EAS preview build uses the phone's Bluetooth radio through `react-native-ble-plx`. Many older symbolic radio files still only log a line.

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

Yehsa can be installed on a phone, and that install binds to that phone. The check is the Android id from `settings get secure android_id` (`symbolic/device_owner.js`). A Linux machine-id, a hostname, or `YEHSA_MESH_TOKEN` alone does not open mesh, BLE, or control. On a machine with no phone id, those paths refuse and do not start a listener or a scan. There is no cipher and no military-style encryption claim: `encryption` in `yesha_modules/config/identity.json` stays `none`. `useAxionetRuntimeGuarantee` does not attest the phone or grant access. `biometric_lock.js` is a local yes/no for unlock, erase, and shutdown after the phone matches. It does not read a fingerprint.

Nothing outside that phone is admitted. HTTP and TCP listen on `127.0.0.1` only, and only after the phone check. `YEHSA_BIND_HOST` cannot move them onto a LAN address, a public address, or `0.0.0.0`. A non-loopback value is refused and the process does not listen. A connection whose peer address is not loopback is denied. On the bound phone, listeners still require `YEHSA_MESH_TOKEN`.

```bash
export YEHSA_MESH_TOKEN="choose-a-long-random-token"
npm run mesh:http      # POST /symbol on PORT (default 3180)
npm run mesh:tcp       # JSON over TCP on YEHSA_WATCHDOG_PORT (default 3175)
```

HTTP accepts the token as `Authorization: Bearer <token>` or `X-Yehsa-Token`. The body is `{ "symbol": "<allowlisted symbol>" }`. The symbol must exist in `symbolic/symbolic_dictionary.js`. The request is executed locally. It is not treated as a trusted mesh command, and a client-supplied `action` is ignored.

TCP expects one JSON object: `{ "token": "<token>", "symbol": "<allowlisted symbol>" }`. The socket has to be loopback on this device. After the owner, token, and allowlist checks, the symbol is dispatched through the mesh listener.

Speech and Bluetooth helpers (`symbolic/symbolic_speaker.js`, `utils/mesh_utils.mjs`) pass arguments with `execFile` and reject unexpected payload text. They still expect Termux commands (`termux-tts-speak`, `termux-bluetooth-send`) when those binaries exist.

## BLE mesh discovery

Symbol dispatch stays a queue plus send on the link already held (`symbolic/ble_dispatch.js`). It does not scan. Discovery and join are separate (`npm run mesh:discover`, `npm run mesh:join`, or `radio_driver.receive`).

The scan is a BLE passive observer: `termux-bluetooth-scan` with `--transport le --scan-type passive --scan-mode low-power --mode observer --filter YEHSA --keep-link 1`. Join uses `termux-bluetooth-connect` with `--transport le --keep-existing 1` and a remembered Yehsa peer address. Both commands go through `execFile`. A real radio call requires this device's owner record and `YEHSA_MESH_TOKEN`. Discovery does not open a socket.

A BLE peer is another install. It is labeled `exterior-mesh-peer` and `owner: false`. Seeing or joining that peer does not let it execute symbols here. `receiveMeshCommand` runs a symbol only after loopback admission (`localOwner` plus `ingress: "loopback"`).

`npm run mesh:phone` is the user-facing service on that mesh: an offline phone path (short text on the link already held, no cellular call, no bill). It stays up whether or not position is locked. Joining the mesh reports the same `phoneService` view.

Position lock is separate and opt-in. `node symbolic/position_lock.js` does not read a fix. `node symbolic/position_lock.js --consent` asks the local GPS provider with `termux-location -p gps` (`execFile`, fixed arguments). That is the phone's satellite GNSS hook in the same Termux family as `termux-tts-speak`. The repo has no second GNSS stack. A network, passive, or peer-mesh fix is not accepted. If `termux-location` is missing, the lock degrades and the phone service stays up. `--share` sends the fix on the held link only when `--consent` is also present. A BLE or mesh caller cannot lock this install. The fix file is `symbolic_memory/position_lock.json` (gitignored).

Peers are remembered in `symbolic_memory/mesh_peers.json` when the advertisement name is `YEHSA` (or `YEHSA` plus a separator) or the service UUID is `59454853-4100-4d45-5348-000000000001`. Other sightings are dropped and not written. Weak RSSI is kept, so a distant advertisement can still be remembered. Join picks the strongest remembered peer. A second Yehsa peer can be added beside the primary. The primary address is not replaced and nothing in this path sends disconnect, unpair, adapter disable, or classic inquiry.

The helper script itself has to be checkable. Yehsa reads it and runs it only when it declares `YEHSA_PASSIVE_LE_SCAN` or `YEHSA_PASSIVE_LE_CONNECT` and does not contain classic inquiry or GATT teardown (`startDiscovery`, `cancelDiscovery`, `scaninfo`, `gatt.disconnect`, `gatt.close`, `adapter.disable`). `termux-bluetooth-scaninfo` is never called.

Termux and Android limits:

- Official Termux:API (current releases, including v0.53) does not ship Bluetooth commands. `termux-bluetooth-send` is the command this repo already used; it is not in the official package. When `termux-bluetooth-scan` or `termux-bluetooth-connect` is missing, or `YEHSA_MESH_DRY_RUN=1`, discover and join return `degraded: true` and do not throw. Peer memory and a dry-run link record still update. `npm run test:mesh` covers that path.
- Open Termux change `termux/termux-api#686` scans with `BluetoothAdapter.startDiscovery()`. Android documents that classic inquiry as heavyweight: existing links lose bandwidth and gain latency, and new connections should wait until inquiry stops. That API is not used here.
- Android's public scan settings have no switch named "passive". `SCAN_MODE_LOW_POWER` is the coexistence-friendly userspace mode (about a 512 ms window every 5.1 s). The 12 second helper timeout covers two of those windows so a far advertisement has more than one chance. `SCAN_MODE_OPPORTUNISTIC` only reports other apps' results, so range is not reliable. `SCAN_MODE_LOW_LATENCY` is not requested.
- A live GATT connection can stay up during an LE scan. Classic RFCOMM connect is not the join path. The helper is killed on timeout; it is not told to drop GATT. A compliant helper must ignore SIGTERM as a disconnect.
- There is no in-repo Node Bluetooth stack. This machine has no phone radio. A binary helper cannot be checked for the passive contract, so it is refused and the call degrades.

## Knowledge areas

Offline reference for a survival-oriented agent. It is not emergency services, not medical advice, and not a foraging or treatment guide.

- Math: `symbolic_memory/math/topics.json` plus the allowlisted arithmetic parser in `symbolic/math_eval.js` (`reasonThrough`). Letters are rejected. There is no computer-algebra system.
- Medical names already committed: `symbolic_memory/medical_terms_only.txt`, `codesante_en.txt`, `glutanimate.txt`. They are looked up as names only. `desc2023.xml.gz` and `desc2024.xml` are HTML error pages and are not indexed. Short notes live in `symbolic_books/medical/`.
- Herbology cautions: `symbolic_books/herbology/`.
- Field notes (water, shelter, fire, navigation, weather, tools, signaling, food, camp): `symbolic_books/survival/`. Signaling means being found. It is not an attack tool.
- Landscape notes (biomes, terrain, watersheds, coasts, mountains, deserts, forests, arctic and tundra, river cues, natural landmarks, climate bands, declination, contours, map and compass): `symbolic_books/landscape/`. Natural features only. No city directory.
- Drop more `.txt` or verse `.json` files in those folders and run `npm run books:ingest`.

Symbol execution (`getMappedAction`) stays a direct map lookup so a thousand known symbols stay on the hot path. Dictionaries, books, math notes, medical names, survival text, and landscape notes are queried by `recallKnowledge` / `semanticAnswer` / `reasonThrough`, not by every mesh dispatch. The geo tools are not on that path.

## Offline landscape tools

These are the terrain tools a handheld can run with no signal. Distance, bearing, a destination point, waypoints, a track, compass labels, declination arithmetic, and a rough sunrise are local math plus files on this phone. There is no map tile client, no street database, and no city or point-of-interest gazetteer. Towns change; this layer does not try to follow them.

The earth model is a sphere of radius 6371 km, not a survey ellipsoid. Declination is not downloaded: east-positive degrees are the angle you read off the map you carry. Sunrise and sunset use a low-accuracy solar approximation. Expect errors of a few minutes, and ignore terrain on the horizon. Polar day and polar night come back as a condition instead of a clock time. If a consented GPS fix has no altitude, elevation stays unknown.

Waypoints and the track are `symbolic_memory/waypoints.json` and `symbolic_memory/track_log.json` (gitignored, same treatment as `position_lock.json`). Saving or reading them requires this phone's owner record and `--consent`. A course "from here" uses the opt-in position lock and does not run for a mesh or BLE caller. Coordinates you type into the command are that command's input. They are not a lookup of a place name.

```bash
npm run ask -- "What is magnetic declination?"
npm run ask -- "What is the distance and bearing from 0,0 to 0,1?"
npm run geo -- distance --from 0,0 --to 0,1
npm run geo -- bearing --from 0,0 --to 0,1
npm run geo -- waypoint save camp --at 45.1,-69.2 --consent
npm run test:knowledge
npm run test:mesh
```

`npm run geo` with no arguments lists destination, reverse bearing, compass, declination, sun, goto, track, and elevation.

## Dictionaries and books

The running agent reads these local stores. They are not only files sitting next to the code.

- `symbolic/symbolic_dictionary.js` is the curated symbol map. `getMappedAction` reads only that map, which keeps symbol dispatch fast.
- A single unknown word can still be resolved with `recallKnowledge`: WordNet stub, `dictionary_memory.json`, `full_dictionary.json`, then `webster_raw.json`.
- `wordnet_raw.json` is the committed stub: one gloss (`fear`). An earlier copy of this file was the text `404: Not Found`. There is no full WordNet download in the repo.
- `dictionary_memory.json` had one missing headword (`fingle-fangle`) that made the JSON invalid. That key is restored from Webster so the file loads.
- Books are indexed from `symbolic_memory/full_book_verses.json`, `symbolic_memory/tao_te_ching.json` (two committed verses), `symbolic_memory/math/`, and usable files under `symbolic_books/` including `medical/`, `herbology/`, `survival/`, and `landscape/`. `book_queue/combined_queue.json` is skipped unless `YEHSA_INDEX_BOOK_QUEUE=1`, because that dump mixes real lines with HTML from failed downloads.

```bash
npm run dictionary:load     # parse dictionary_memory.json and print the count
npm run books:ingest        # rebuild symbolic_memory/books_index.json from drop folders
npm run dictionary:build    # merge Webster and the WordNet stub into full_dictionary.json
npm run dictionary:phone   # rebuild the Expo pack from the same merge as npm run ask; does not delete the full files
```

`dictionary:build` rewrites `full_dictionary.json`. It keeps existing keys and adds Webster entries. Run it only when you want that merge.

`dictionary:phone` writes `symbolic_memory/phone_lexical.js` and `symbolic_memory/phone_medical.js`. The lexical pack is the ask merge: the WordNet stub, `dictionary_memory.json`, `full_dictionary.json`, then Webster for headwords those files do not already define. Glosses are not shortened. The medical pack is every name in `medical_terms_only.txt`, `codesante_en.txt`, and `glutanimate.txt`. Herbology, medical reference, survival, and landscape notes already ride along in `books_index.json`. The source files stay on disk.

`yesha.js` asks the knowledge index on each trigger. A full question is parsed first (`symbolic/ask.js`, `npm run ask -- "your question"`), which prints the answer as plain prose. `recallKnowledge` still gathers herbology, survival, landscape, medical, math, and dictionary evidence, then `reasonAnswer` deduces one reply: the use or care step first, then the limit. When the question includes coordinates, or a consented position lock and a from-here course, `ask` adds one sentence from the offline landscape tools. An exterior caller does not get that sentence. A care question that names a plant, a bite, or both joins those notes instead of listing ranked glosses. An incidental dictionary headword does not become the answer. `getMappedAction` stays a single map read and does not search these corpora. The trainer file and the learning queue are left in place.

Emotion is read from wording in `symbolic/emotion_mapper.js`. Each feeling has hardwired cues and a short note used to deduce it. If nothing matches, the read stays neutral with confidence 0, and the knowledge answer is still returned.

On the bound phone, `symbolic/user_learning.js` keeps a small local profile of wording cues, emotion reads, and topics asked. Later answers can note a return to the same topic or a feeling that has shown up before. The profile is not written on a machine that is not that phone, and `learning_queue.json` is not rewritten.

See `symbolic_books/README.md` for how to drop another `.txt` or verse `.json` into the library. Do not commit copyrighted books. Failed Gutenberg downloads are left as placeholders and skipped by the indexer.

## Benchmarks

`benchmark_symbol_exec.mjs`, `benchmark_chain_exec.mjs`, and `benchmark_text_search.mjs` are standalone tools. They do not replace the executor or the mesh listener. Symbol execution inside the benchmark is off unless `YEHSA_BENCHMARK_EXECUTE=1`.

## Phone app

The home screen says Yehsa. It is the offline interface for someone who does not want a terminal. Four tabs share the same ranking, position rules, and mesh peer rules as the Termux commands. Platform differences sit in adapters (`src/phone/location_provider.js`, `src/phone/ble_provider.js`, `src/phone/install_owner.js`). The screen does not pretend a sensor or a radio worked when the platform has no API for it.

- **Ask** — same parse, rank, and `reasonAnswer` path as `npm run ask`. The bundle includes the field notes plus the packaged merge (`symbolic_memory/phone_lexical.js`, `symbolic_memory/phone_medical.js`): the same headwords `npm run ask` reads, and the full medical name lists. Rebuild it with `npm run dictionary:phone` after you change the corpora. `dictionary_memory.json`, `full_dictionary.json`, `webster_raw.json`, and the medical name lists stay on disk. A wording cue appears beside the answer when emotion was read. It does not replace the note. This screen does not write the learning profile. If a wording cue is unclear, the note is still returned.
- **Land** — distance and bearing, declination from a number you type, waypoints, a track summary, and a rough sunrise. Coordinates are typed. "Use locked position" works only after consent and a held fix. There is no city or point-of-interest search.
- **Position** — opt-in. The control starts off and nothing locks until you turn it on and then tap **Try satellite lock**. Status is Unlocked, Degraded, or Locked. If a Termux bridge exposes `termux-location`, that GPS read is used and a network provider is refused. Otherwise the screen asks Expo Location for one high-accuracy fix (`BestForNavigation`, then a short watch on that same tap). A fix coarser than 100 m is not stored. Permission is requested on that tap, not at launch. A missing permission, location services that are off, a missing API, or a bad read is Degraded and does not invent coordinates. An existing lock is kept when a later read fails. Typed coordinates still lock after consent. Share is a separate button and does not transmit; the send stays `node symbolic/position_lock.js --consent --share` on the phone.
- **Mesh** — **Scan for Yehsa peers** runs a real probe. A Termux BLE bridge is used when present. On Android and iOS, an EAS build uses `react-native-ble-plx` (low-power scan, connect without cancelling a different link). A browser with Web Bluetooth uses a passive LE scan when `requestLEScan` exists, or a Yehsa-filtered chooser when it does not. Expo Go and a machine with no radio stay Degraded, and the screen does not invent peers. Connecting a second peer does not replace a link already held. If a link that was connected before the scan is gone afterward, the screen says so and does not claim Yehsa disconnected it. Peers stay exterior and cannot run symbols here. No cipher is claimed.
- **Offline phone** — on the Mesh tab, a short note can be kept on the device whether or not position is locked. It is not described as transmitted unless a bridge send, a native write, or a Web Bluetooth write to the Yehsa note characteristic reports that it queued the text on the held link. There is no cellular call and no bill.

Each Expo install binds to that device: Android id when Expo Application can read it, the iOS vendor id on iOS, or a stored install id in the browser. The record is `ownership: local-device`, `exterior: deny`. A stored record whose device mark does not match is left in place and denied. That store is not `symbolic_memory/device_owner.json`. Termux still mints that file from `settings get secure android_id`.

Waypoints and the track on these screens live in the session. Turning consent off clears them. They are not the Termux owner files (`symbolic_memory/waypoints.json`, `track_log.json`, `position_lock.json`), which still require this phone's Android id and `--consent`.

The Expo bundle cannot import Node `fs` or `child_process`. Shared modules that the screen imports (`knowledge_rank.js`, `mesh_peers.js`, `position_fix.js`, `position_adapter.js`, `owner_bind.js`) stay free of those. `getMappedAction` is still one map read and is not on this path. Metro is pinned to 0.82.4, the version this Expo SDK expects.

### Testing Expo and Termux

```bash
npm install
npm run test:knowledge
npm run test:mesh
npx expo start           # Expo dev server. The app name on the phone is Yehsa.
npm run web              # same shell in a browser
npm run android          # expo start --android
npm run ios              # expo start --ios
```

What a tester should expect:

| Action | Expo web | Expo Go (`npx expo start` on a phone) | EAS preview APK / iOS binary | Termux |
| --- | --- | --- | --- | --- |
| Ask a field question | Same prose as `npm run ask` for the packaged merge, including Webster headwords the smaller files do not already define, the full medical name lists, and the field notes. The footer states the counts. | Same bundle as web. | Same bundle as web. | `npm run ask` reads the corpora from disk. The prose matches the phone for those questions. |
| Position, consent off | Stays Unlocked. The satellite button does not read a fix. | Same. | Same. | `node symbolic/position_lock.js` without `--consent` does not read a fix. |
| Position, consent on, then Try satellite lock | Expo Location through the browser. A fix coarser than 100 m stays Degraded. Grant location to reach Locked when the browser can supply that accuracy. | Expo Location, which Expo Go includes. High accuracy can reach Locked and hold. Deny permission, or turn location services off, and the status stays Degraded. | Same Expo Location path as Expo Go, in the preview binary. | `node symbolic/position_lock.js --consent` uses `termux-location -p gps`. A missing binary is Degraded. |
| Mesh scan | Web Bluetooth scan or the Yehsa chooser when the browser has it. Otherwise Degraded, and no peers are invented. | Degraded. Expo Go does not include `react-native-ble-plx`. No peers are invented. | Native low-power scan and connect on Android and iOS. A missing radio or a denied permission stays Degraded. A held link is not cancelled by the scan. | `npm run mesh:discover` / `npm run mesh:join` with `termux-bluetooth-scan` and `termux-bluetooth-connect`. A missing helper is degraded and does not drop a held link. |
| Offline phone note | Available after the install binds, including while position is Unlocked. The note stays on the phone unless a write to the held link accepts it. | Same. The note stays on the phone. | Same, and a connected peer that exposes the Yehsa note characteristic can take the text. Otherwise it stays on the phone. | `npm run mesh:phone` and `node utils/mesh_service.mjs send ...` queue on the held link without a position lock. |
| Device bind | A browser install id, stored in the shell. A copied owner record whose device mark does not match is denied and left in place. | Android id, or the iOS vendor id, from Expo Application. A copied mismatched record stays denied. | Same native ids as Expo Go. | `symbolic/device_owner.js` via `settings get secure android_id`. A Linux machine with no phone id is refused. |

## EAS preview

The display name is Yehsa. The Expo slug stays `axionet`. `eas.json` profile `preview` is an internal build. Android is an APK (`buildType: apk`). iOS is a device build and needs Apple credentials; without them, use the Android APK.

```bash
npm install
npx eas login
npx eas build --profile preview --platform android
npx eas build --profile preview --platform ios
```

The project id is already in `app.json` (`extra.eas.projectId`). The first Android build asks EAS to create or reuse the project for slug `axionet`. When it finishes, EAS prints a URL for the APK. Install that APK on the phone. It is not a Play Store listing. The iOS command is the same profile; EAS will stop if this Apple account has no distribution certificate.

`npx expo start` is still the dev server. Expo Go can run Ask, the landscape math, consent, and Expo Location. It cannot run the native Bluetooth module. That module is in the preview binary.

`npm start` is the same Expo entry (`babel.config.js`, `babel-preset-expo`). `App.js` and `App.tsx` both open the Yehsa home and still call `useAxionetRuntimeGuarantee`. That hook is a documented stub: it does not keep the app alive, and it is not a biometric or encryption feature. `assets/icon.png` is a placeholder because the original icon was not committed.

`node App.js` still fails on JSX; Metro is what compiles the shell. The Node agent paths above remain the owner-file, radio, and full-dictionary system. Symbol benchmarks stay separate and are not started by the phone shell.
