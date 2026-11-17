# Offline areas, Before you go, and your own books

## Download this area (plan step 3)
- `symbolic/area_download.js`: plans terrain and elevation tiles (AWS Terrarium, public domain) for
  the visible map or a 5/10/25/50 km radius. It picks the zooms (about 5 levels, top zoom 12),
  caps a job at 600 tiles / 160 MB, shows the size before anything is fetched, and runs a
  resumable job (`done` keys are persisted, and Resume skips them).
- **No road or street layer.** `REFUSED_LAYERS` are rejected. Roads need Dana's approval.
- `src/phone/area_store(.native).js`: tiles are saved in `documentDirectory/yehsa-areas/<id>/`
  on the phone, and the list is in AsyncStorage `yehsa.areas.v1`.
- `src/phone/area_tiles.js` `areaDemLayers(area)` turns a saved area into the same
  `{ stored, demTiles, contours }` that LandPane builds today, so the map can call
  `publishDem(stored)`, `setDemTiles(demTiles)` and `setContours(contours)`.
- `src/phone/DownloadArea.js`: the card UI (radius chips, size, Download / Pause / Resume / Delete).

## Before you go
- `symbolic/before_you_go.js` (pure) and `src/phone/BeforeYouGo.js` (screen).
- Checks: offline map coverage for the trip area, battery level and saver, GPS permission
  (read only; **Allow GPS** asks), mesh readiness, knowledge packs, emergency contacts (saved only on
  the phone), and telling someone your plan (written on the phone and shared through the system
  share sheet, so you pick who gets it). It also has two items you tick yourself: hunting regs,
  and display mode.
- Every row shows an icon and a word (Ready / Check / Missing), not color alone.
- It can stand in for the checklist shell in `FieldPane.js` (PR #16) because it takes the same props:
  `<BeforeYouGo onBack={close} onOpenLayers={onOpenLayers} onOpenScreen={onOpenScreen} position={position} />`.

## Your books (plan step 5)
- `symbolic/book_import.js`: EPUB (zip with the OPF spine, read by `fflate`) and TXT are parsed on the
  device. DRM EPUBs are refused. Text is split into ~900-character notes under headings, and each note's
  source is `Imported book: <title>` with trust `imported`. Each book can be deleted.
- Storage: `documentDirectory/yehsa-books/imported.json` on the phone
  (`src/phone/book_store.native.js`), and AsyncStorage on the web.
- Indexing: `buildImportIndex` builds a token index in slices of 200 notes and yields between
  slices. `src/phone/imported_books.js` runs it in the background at boot and after each change,
  and registers the finished index in `symbolic/imported_registry.js`.
- Ask: `askField` checks imported books **only after** the safety rules, the approved field
  notes, navigation, and learned notes have all missed. A passage that trips the danger list
  (for example "cut and suck a snakebite") is never returned. Care questions get a line saying the
  passage is from an import, not a checked care note. `getMappedAction` and the eval path don't
  change.
- Screen: `src/phone/BooksPane.js` (import, delete with confirm, indexing progress, and Kiwix ZIM).
- ZIM: see `docs/kiwix-zim.md`.

## Wiring
Everything is exported from `src/phone/screens_index.js`. Importing that file also starts
loading imported books in the background. YehsaApp.js is unchanged.

## New dependencies
- `expo-document-picker` ~13.1.6 (native, small), `expo-battery` ~9.1.4 (native, small)
- `fflate` ^0.8.3 and `fzstd` ^0.1.1 (pure JS)
