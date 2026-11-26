# Known-good v0.15.0 pre-security

Recovery point before the peer-key storage and clone-protection commits.

- Commit: `caa053578aaefd7d9136e3432e937532d59c9cc9`
- Annotated tag: `yehsa-v0.15.0-pre-security`
- Branch: `known-good/pre-security`
- Web export: https://github.com/dana6969/Yehsa/releases/tag/yehsa-v0.15.0-pre-security

## Outcome breakdown

| Bucket | Count |
| --- | ---: |
| Correct | 349 |
| Incorrect-confident | 0 |
| Incorrect-hedged | 0 |
| Incorrect | 0 |
| Appropriate abstentions | 62 |
| Unnecessary refusals | 0 |
| Refusals | 62 |
| Total | 411 |

Correct + incorrect + refusals = 411.

## Tests

- Knowledge: 81 passed
- Mesh: 30 passed
- Safety holdout: 9 passed
- Peer chat: 3 passed
- Hot path: 0.168435 ms for 1000 lookups
- Peak RSS in the long eval: 178 MB
