# Book drop folder

Put plain `.txt` or verse `.json` files here, then run:

```bash
npm run books:ingest
```

That rebuilds `symbolic_memory/books_index.json`. The agent reads that index offline. It does not download books.

Verse JSON is an array of `{ "symbol": "my_book_1", "context": "passage text" }`.

Files that are only `404: Not Found` or an HTML error page are recorded as unavailable and are not indexed. Several files already in this folder are failed downloads (`druidry_handbook.txt`, `hermetica.txt`, `kybalion.txt`, `tao_te_ching.txt`). Replace those with your own text if you want those titles in memory.

`five_rings.txt` is a Project Gutenberg copy of The Kybalion, not the Book of Five Rings. `bhagavad_gita.txt` is a Project Gutenberg copy of The Story of the Great War, Volume V, not the Bhagavad Gita. The ingest path keeps the title it finds in the file instead of trusting the filename.

`landscape/` holds original terrain notes (watersheds, contours, declination, biomes). It is not a city gazetteer. `survival/` holds field notes. Do not add copyrighted books you do not have the rights to commit.
