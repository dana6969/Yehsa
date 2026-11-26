# Downloaded documents (R6)

Dana, Nov 24: "I would also like it to be able to find and download documents I ask it and learn from those."

## What it does

- **Ask** spots requests like "download FM 21-76", "find the Maine hunting regulations PDF" or
  "get me the USDA canning guide" (`symbolic/docs/doc_find.js`, `documentIntent`). Ordinary questions
  are left alone; a test checks that no eval, dev or paraphrase question is taken as a document request.
- It searches once (DuckDuckGo HTML, Bing RSS fallback) with the cleaned words plus "pdf", then asks
  each top link what it is with a HEAD request (type, size, date). It shows up to five candidates with
  title, site, size, date and link. **Nothing downloads until a tap.**
- On **Download**: https only, public hosts only, redirects re-checked, no cookies, 50 MB cap,
  content-type check, then the first bytes are sniffed (`doc_check.js`). Only PDF, EPUB, plain text and
  web pages are read. Programs (MZ, ELF, dex, Mach-O, `#!`), APKs, archives, pictures, audio and video
  are refused whatever they claim to be.
- The text is read **on the phone** (`doc_text.js`): PDFs with `pdf_text.js`, EPUB chapters through
  fflate's unzip, web pages and text as plain text. Every paragraph goes through the same cleaner as web
  pages, so invisible characters, links and instruction-like lines ("ignore previous instructions...")
  are dropped. Document text is data; nothing in it is run, rendered as HTML or followed.
- It is split into sections with page numbers and headings (`doc_sections.js`), sealed, and indexed:
  words right away, and the on-device meaning matcher (bge-small, the same model as Ask) in the
  background, one int8 vector per section.
- **Ask answers from it offline** after Yehsa's own notes miss, or straight away when the question
  names the document ("in the canning guide, ..."). Answers are word-for-word passages labelled
  `From downloaded document "Title":`, each with `[n] "Title", page 30, BITES AND STINGS. <link>`, and
  marked unverified. Medical, legal and dose answers add a "check the source" line.
- **Me, Learned, Documents** lists everything downloaded: View (plain-text reader with page turn and
  find), Rename, Re-index, Delete.
- The general web answer (R5 look-up) now reads PDF results too (up to 12 MB, first 120 pages).

## Storage and security

- One 32-byte key in the platform secure store (Android Keystore through expo-secure-store,
  `yehsa.docs`). The catalog and each document body (pages, sections, vectors) are sealed with
  tweetnacl secretbox, like Learned-from-the-web notes, and written as files under the app's private
  `documentDirectory/yehsa-docs/`. Copy the app data to another phone and it reports "sealed on
  another phone" instead of opening.
- The downloaded file itself is **not kept**: its text is read in memory, sealed, and the bytes are
  dropped. The link stays in the list to download it again.
- What leaves the phone is shown in the chat: the search words, then a HEAD and (on tap) a GET to the
  chosen link. Nothing else.
- None of this is imported by `getMappedAction` or the symbol dictionary (tested).

## The PDF reader

`symbolic/docs/pdf_text.js` is a small pure-JavaScript reader written for Yehsa (about 30 KB of
source, no new dependency). Inflate comes from `fflate`, which the app already ships for map tiles.
It handles classic and compressed object streams (PDF 1.5+), Flate, LZW, ASCIIHex and ASCII85
filters with PNG predictors, the page tree with inherited resources, ToUnicode maps, WinAnsi,
MacRoman and Differences encodings, two-byte (Type0) fonts and form XObjects. Spacing and line
breaks come from the font widths and the text matrix. It has no workers, no eval and no canvas, so it
runs in Hermes. It yields to the screen every few pages.

Not handled: encrypted (locked) PDFs and scans with no text layer are reported plainly ("That PDF is
locked" / "pictures of pages") rather than guessed at.

pdf.js (`pdfjs-dist` legacy) was the alternative. It is about 1 MB minified plus a worker, and leans on
browser APIs that Hermes lacks, so it was not used.

Tested on real public PDFs: FM 21-76 (233 pages, archive.org), FM 21-76 (277 pages, another
scan-free edition), FM 21-76-1, ATP 3-50.21 (228 pages, 23 MB, armypubs), the USDA Complete Guide to
Home Canning (MSU Extension and NCHFP), and the Maine 2026-27 hunting law book (44 pages). All read
with text matching `pdftotext`.
