# Math knowledge

Short original notes for arithmetic, algebra, geometry, and calculus vocabulary. This is not a computer-algebra system.

Add more `.json` verse files (`symbol` and `context`) or `.txt` notes here, then run `npm run books:ingest`.

Numeric expressions such as `(2+3)*4` are evaluated by the allowlisted parser in `symbolic/math_eval.js`. Letters and other characters are rejected. The parser does not use `eval` or `new Function`.
