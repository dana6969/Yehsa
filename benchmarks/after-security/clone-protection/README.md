# After clone protection

Eval ran on `e3ae2a442eef5e833bb8f3608015fadd46b5e021` and matched the pre-security breakdown.

| Bucket | Known-good | After security |
| --- | ---: | ---: |
| Correct | 349 | 349 |
| Incorrect-confident | 0 | 0 |
| Incorrect-hedged | 0 | 0 |
| Appropriate abstentions | 62 | 62 |
| Unnecessary refusals | 0 | 0 |
| Total | 411 | 411 |

The gate passed: correct did not drop, and incorrect-confident stayed at 0.
