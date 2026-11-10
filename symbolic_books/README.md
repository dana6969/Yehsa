# Book drop folder

Put plain `.txt` or verse `.json` files here, then run:

```bash
npm run books:ingest
```

That rebuilds `symbolic_memory/books_index.json`. The agent reads that index offline. It does not download books.

Verse JSON is an array of `{ "symbol": "my_book_1", "context": "passage text" }`.

Files that are only `404: Not Found` or an HTML error page are recorded as unavailable and are not indexed. The old placeholder files `hermetica.txt` and `druidry_handbook.txt` were removed. They were not texts.

`spiritual/` holds the texts Ask quotes for life and scripture questions. Rebuild that index with `npm run books:spiritual`. It reads:

- Tao Te Ching, James Legge, Project Gutenberg eBook 216
- Bhagavad Gita (The Song Celestial), Edwin Arnold, Project Gutenberg eBook 2388
- Dhammapada, F. Max Müller, Project Gutenberg eBook 2017
- The Kybalion, Three Initiates, Project Gutenberg eBook 14209
- Bible, King James Version, Project Gutenberg eBook 10
- Thrice-Greatest Hermes, Volume II, G. R. S. Mead, London, 1906. This is not on Project Gutenberg. The file is OCR from Internet Archive item `MeadGRSThriceGreatestHermesVolII1906`. Passage refs are the heading and paragraph in that OCR, not a critical edition line.
- Barddas, edited by J. Williams Ab Ithel from Iolo Morganwg's papers, Welsh Manuscript Society, 1862. OCR from Internet Archive item `barddasoracolle00willgoog`. This is a public-domain book about bardic and druidic material. Parts of Iolo's papers are his own composition, not a verified ancient druid liturgy. The index does not claim otherwise.

The same Tao and Kybalion files are also at `tao_te_ching.txt` and `kybalion.txt` so those old paths are no longer an HTML error page or a 404. Field ingest skips those two names and the `spiritual/` folder. Quotes come from `symbolic_memory/spiritual_index.json`.

`the_kybalion.txt` used to be named `five_rings.txt`. The file is a Project Gutenberg copy of The Kybalion, not the Book of Five Rings. A public-domain Book of Five Rings was not added, so the filename was changed to the book it actually contains. `story_of_the_great_war_vol_v.txt` is The Story of the Great War, Volume V. It used to be stored under the name `bhagavad_gita.txt`. The ingest path keeps the title it finds in the file instead of trusting the filename.

`landscape/` holds original terrain notes (watersheds, contours, declination, biomes). It is not a city gazetteer. `survival/` holds field notes. Do not add copyrighted books you do not have the rights to commit.
