# Book drop folder

Put plain `.txt` or verse `.json` files here, then run:

```bash
npm run books:ingest
```

That rebuilds `symbolic_memory/books_index.json`. The agent reads that index offline. It does not download books.

Verse JSON is an array of `{ "symbol": "my_book_1", "context": "passage text" }`.

Files that are only `404: Not Found` or an HTML error page are recorded as unavailable and are not indexed. `druidry_handbook.txt` and `hermetica.txt` are still those placeholders. A public-domain Druidry handbook was not added. Project Gutenberg eBook 30276 was checked and is not the Hermetica, so it was not used.

`spiritual/` holds the texts Ask quotes for life and scripture questions. Rebuild that index with `npm run books:spiritual`. It reads:

- Tao Te Ching, James Legge, Project Gutenberg eBook 216
- Bhagavad Gita (The Song Celestial), Edwin Arnold, Project Gutenberg eBook 2388
- Dhammapada, F. Max Müller, Project Gutenberg eBook 2017
- The Kybalion, Three Initiates, Project Gutenberg eBook 14209
- Bible, King James Version, Project Gutenberg eBook 10

The same Tao and Kybalion files are also at `tao_te_ching.txt` and `kybalion.txt` so those old paths are no longer an HTML error page or a 404. Field ingest skips those two names and the `spiritual/` folder. Quotes come from `symbolic_memory/spiritual_index.json`, with the title and the passage reference taken from the file (Legge chapter and section, Arnold chapter and stanza, Müller chapter and verse, Kybalion chapter and part, KJV book chapter and verse).

`five_rings.txt` is still a Project Gutenberg copy of The Kybalion, not the Book of Five Rings. A public-domain Book of Five Rings was not added. `story_of_the_great_war_vol_v.txt` is The Story of the Great War, Volume V. It used to be stored under the name `bhagavad_gita.txt`. The ingest path keeps the title it finds in the file instead of trusting the filename.

`landscape/` holds original terrain notes (watersheds, contours, declination, biomes). It is not a city gazetteer. `survival/` holds field notes. Do not add copyrighted books you do not have the rights to commit.
