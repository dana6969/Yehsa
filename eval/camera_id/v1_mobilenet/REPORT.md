# Camera ID accuracy check (leave-one-out)

`node eval/camera_id/loo.mjs` (numbers below are in `results.json`).

## Setup

- Model: MediaPipe Image Embedder, MobileNetV3-Small float32 (Apache-2.0), 1024-d, 4.1 MB.
- 8 plant classes, 117 reference photos: 104 Wikimedia Commons photos (CC0, public domain,
  CC BY, CC BY-SA) and 13 Yehsa picture-guide plant images. Each reference is stored as
  three views (centre crop, mirror, 70% zoom); a query is the mean of the photo and its mirror.
- Matching: best cosine similarity per class, top 3 shown.
- Leave-one-out: each reference photo is held out, with all three of its views removed
  from the index, and matched against the rest.
- Negatives: 81 photos of things Yehsa has no camera notes for: 48 Commons photos (dandelion,
  red clover, oak leaves, bracken fern, lawn, granite, fly agaric, sunflower) plus the 33
  non-plant picture-guide images (knots, first aid, fire, sky, signals).

## Results

| Measure | Result |
| --- | ---: |
| Top-1 correct (all 117 held-out photos) | 66.7% |
| Correct plant somewhere in top 3 | 89.7% |
| Held-out plant photos declined ("nothing close") | 12.8% |
| Top-1 correct when shown as "Possible match" (84 photos) | 73.8% |
| Top-1 correct when shown as "Weak match" (18 photos) | 61.1% |
| Negatives declined | 70.4% (57 of 81) |
| Negatives shown as "Possible match" / "Weak match" | 13 / 11 |
| Held-out deadly photos (not declined) with a deadly plant in the top 3 | 30 of 30 |
| Held-out deadly photos whose top match was a non-deadly plant | 6 of 30 |
| Held-out edible photos where a deadly look-alike was shown or linked | 26 of 26 |
| Median match time in Node (after the embedding) | about 0.6 ms |

Per class (top-1 / top-3, declined): yarrow 77.8 / 83.3 (0 of 18), plantain 58.8 / 94.1
(5 of 17), willow 84.2 / 89.5 (3 of 19), wild carrot 78.6 / 92.9 (1 of 14), poison hemlock
38.5 / 84.6 (2 of 13), water hemlock 60.0 / 100 (1 of 10), wild onion 78.6 / 92.9 (1 of 14),
death camas 41.7 / 83.3 (2 of 12).

## What this does and does not show

- It is a small set (10–19 photos per class). With 117 photos, a top-1 figure has roughly
  ±9 points of uncertainty at 95%.
- The score cut-offs (0.50 possible, 0.42 weak) were picked after looking at this same score
  spread, so these numbers lean optimistic. They are not a field accuracy.
- Commons photos are mostly well framed. Phone photos in the field (blur, shade, mixed
  plants) will likely do worse.
- About 3 in 10 photos of unrelated things still get a suggestion. The screen always shows
  the photo warning and look-alikes for that reason.
- The model is a general image model, not a plant model. Hemlocks and death camas are the
  weakest classes, which is why any deadly plant in the top 3 is called out on screen and
  no result uses a word stronger than "Possible match".
- MobileNetV3-Large from the same family measured 71.8% top-1 / 91.5% top-3 on the same
  check, which is within noise of Small, for 10.9 MB instead of 4.1 MB. Small was kept.
- Not yet run on a phone. The Node pixel pipeline was checked against the Python reference
  embedding (cosine 1.0000); Android's own resize may differ slightly from Pillow's.
