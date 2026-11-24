# Look it up: answer any question, keep what you approve

Dana, Nov 24: "if no live learning then I want it to have a way to answer any questions and retain
the knowledge." This is the core of web learning. Yehsa still never learns on its own. It looks
something up only when you ask, and keeps it only when you say Keep.

## The flow

1. **A miss offers to save.** When the field notes have nothing, Ask replies
   "I don't have that yet. Save it to look up next time you're online?" with **Save it** and
   **No thanks**. Save it puts the question in **Look it up later**, a private list on this phone.
2. **Fetch.** Under Me, Learned, each saved question has **Fetch** (and **Fetch all**). With
   **Look up live questions when I'm online** turned on, a missed question is looked up right away.
3. **Review.** The answer is a short card: up to three sentences quoted word for word, each
   followed by its citation number, then the sources. Tap **Keep** or **Toss**.
4. **Kept.** A kept answer becomes a learned note tagged **Learned, from [source], [date]**
   (for example "Learned, from ATP 3-50.21, Nov 24, 2026"). From then on it answers offline,
   after the field notes and only when they had nothing. Edit or Delete it on the Learned screen;
   an edit keeps the source tag and adds "Edited by you".

Nothing is used before review: a waiting answer is never an answer, and nothing enters review
unless you tapped Fetch or turned on live look-ups.

## Where it looks (the whole allowlist)

| Source | How | License shown |
| --- | --- | --- |
| ATP 3-50.21 Survival (2018), ATP 4-02.11 Casualty Response, TCCC and First Aid (2026) | On-phone pack, `assets/atp/atp_sections.json`, cited by paragraph ("para 4-81"). Works offline. | US Government work, approved for public release |
| CDC, NWS, USDA, USFWS, NPS, USFS | This phone fetches known pages from `symbolic/web/gov_directory.js` (https, cdc.gov, weather.gov, usda.gov, fws.gov, nps.gov only) | US Government work |
| Wikipedia (en) | This phone fetches search and page text from en.wikipedia.org | CC BY-SA 4.0, labeled on every citation |
| State wildlife agencies | Link only. Never fetched or quoted. Shown for wildlife questions when the state is named or guessed on the phone from a held position | Link only |

All network reads go through `symbolic/web/fetch_guard.js`: https only, the hosts above only, no
cookies, size and time caps, no redirect off the list. ATP and state wildlife are link-only groups
that `guardedFetch` refuses outright.

**What leaves the phone:** only the cleaned words from `outboundQuery()` (personal bits stripped),
and only to Wikipedia's search. Government pages are fetched by their fixed address. The full
question stays in the sealed store.

## Why ATP is on the phone

The two manuals are PDFs (24 MB and 13 MB). A phone cannot read a PDF page by page without a heavy
parser, and they are the most useful sources in the field, where there is no signal. So
`tools/atp/build_atp_pack.mjs` turns `pdftotext` output into numbered paragraphs (about 1 MB,
532 + 1055 paragraphs). ATP 3-50.21 chapter 2 (survival medicine) has no paragraph numbers in the
PDF and is not in the pack; ATP 4-02.11 covers first aid and is the current manual.

## Building the answer

`symbolic/web/answer_builder.js` is extractive. It never paraphrases, so a source cannot be cited
for something it did not say. Sentences are scored by how many of the question's topic words they
contain (with a few swaps: scat = droppings = feces), manuals first, then agencies, then one line
per Wikipedia page. Captions, menus and lines that read like instructions to an assistant are dropped.
Doses and eat-or-poison claims can be kept only as unverified, with a warning.

## Storage

Everything (the queue, waiting answers, kept notes, their vectors) is one sealed store
(`symbolic/sealed_vault.js`): a 32-byte key in the Android Keystore through expo-secure-store,
ciphertext in app storage. Copied app data cannot be opened on another phone. It is separate from
the core pack and from notes you wrote; nothing in `symbolic/web/` touches the field-note index.

## Files

- `symbolic/web/lookup_queue.js` queue, the miss offer text, answer to note
- `symbolic/web/look_up.js` the lookup (ATP, gov pages, Wikipedia)
- `symbolic/web/answer_builder.js`, `atp_lookup.js`, `gov_directory.js`, `state_wildlife.js`, `allowlist.js`, `synonyms.js`
- `symbolic/web/web_notes.js` review, Keep, Toss, edit, delete, the learned tag, offline answers
- `src/phone/web_learn.js`, `src/phone/WebLearnCards.js`, `src/phone/atp_pack.js`
- Tests: `test_look_it_up.mjs`, `test_web_learn.mjs`
