# Kiwix ZIM in Yehsa: what works and what is missing

`symbolic/zim_reader.js` is a pure-JS ZIM reader. It never loads a whole file: every read goes
through `readAt(offset, length)` (on the phone, `expo-file-system` base64 reads with
`position`/`length`; on the web preview, `File.slice()`).

## Works (tested)

- Header, MIME list, URL pointer list, directory entries, redirects, link targets.
- Clusters: uncompressed and **zstd** (via `fzstd`, pure JS, ~8 KB), normal and extended (64-bit offsets).
- Title search by prefix with a binary search over the title order:
  - newer files (libzim 7+, `titlePtrPos` unset): `X/listing/titleOrdered/v1`, then `v0`;
  - older files: the header title pointer list.
- Metadata (`M/Title`, etc.) by URL binary search.
- Article HTML to plain text, and "Save to my books", which imports the article as lower-trust notes.
- Checked against a real file over HTTP range reads: `wikipedia_en_100_2026-08.zim` (333 MB,
  ZIM 6.3, zstd). Opening it, reading metadata and fetching two articles read about 2.4 MB in total.
- `test_book_import.mjs` builds small ZIM files with zstd, uncompressed and xz clusters.

## Missing

1. **xz (LZMA2) clusters.** Older ZIM files (from before about 2021) use xz. I don't know of a
   maintained pure-JS xz/LZMA2 decoder; the ones that exist use WASM (`xz-decompress`, `xzwasm`)
   or native code. Hermes on Android runs WASM only through an extra native module. The reader
   gives a clear error: "This ZIM uses xz compression…". Workaround: download a current
   (zstd) file from download.kiwix.org. To add it: port an LZMA2 decoder (about 600 lines, as
   in xz-embedded) or add a native module.
2. **Full-text search.** Kiwix full-text search is a Xapian database in the file
   (`X/fulltext/xapian`). There is no JS Xapian reader, so search is by title prefix only. The
   title Xapian index (`X/title/xapian`) isn't used either.
3. **Ask does not search ZIM files on its own.** `askField` is synchronous and ZIM reads are
   async, so a ZIM is searched from the Books screen. You can save an article to your books
   to make it answerable from Ask.
4. **Big clusters cost memory.** A zstd cluster is decompressed whole (usually 1–2 MB, sometimes
   up to about 8 MB). The reader keeps the last 4 clusters.
5. **Copy on import.** The Android picker copies the file into the cache, and Yehsa then copies
   it into its own folder so it lasts. A multi-GB ZIM needs that much free space twice for a
   short time. Reading a `content://` URI in place would avoid this, but it hasn't been tested
   on a device.
6. Images and other media inside articles are not shown.
