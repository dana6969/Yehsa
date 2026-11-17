# Camera ID v2: held-out report

Run: 2026-11-17. Regenerate the numbers with `npm run camera:eval` (reads `report.json`) and
rebuild them with `tools/camera_id/README.md`.

## What was measured

* Model: DINOv2-small, weights int8 / float compute, CLS token (384-d), mean of the photo and its mirror.
* Head: multinomial logistic regression over 170 classes plus a "something else" class.
* Photos: 9,115 openly licensed iNaturalist research-grade photos (CC0, CC BY, CC BY-SA), North America,
  one photo per observer per class, plus 1,636 photos of things **not** in the set (other species, and hard
  negatives such as other conifers, other umbels, other mushrooms).
* Split: fixed hash of the photo id. About 61% reference (the head is trained on these), 19% calibration
  (the "not sure" thresholds are chosen here only), 20% test (never used for training or choosing anything).
  Reference 5,584, calibration 1,728, test 1,803 photos.

## Held-out results (test split)

| | |
|---|---|
| Photos of classes in the set | 1,385 |
| **Top-1** (every photo, nothing withheld) | **76.0%** |
| **Top-3** | **89.1%** |
| Answered (not "I'm not sure") | 73.5% |
| Top-1 / top-3 when answered | 88.3% / 96.6% |
| "Possible match" band: share / top-1 | 64.3% / 92.4% |
| Photos of things not in the set | 418 |
| Said "I'm not sure" on those | 80.1% |
| ... called a deadly class with an answer | 1.4% |
| Deadly-class photos with a deadly class in the top 3 | 96.2% |
| Deadly-class photos answered with a non-deadly top-1 | 4.6% |

Thresholds from the calibration split: weak 0.34, possible 0.46 (probability of the top class).
"I'm not sure" also fires whenever "something else" outscores every class.

| Group | n | top-1 | top-3 | answered |
|---|---|---|---|---|
| Plants | 617 | 85.3% | 93.0% | 79.3% |
| Mushrooms | 196 | 85.7% | 95.9% | 77.6% |
| Trees | 216 | 65.7% | 86.1% | 60.2% |
| Animals (incl. snakes, ticks, insects) | 257 | 67.3% | 83.7% | 73.2% |
| Scat | 51 | 56.9% | 76.5% | 68.6% |
| Tracks | 48 | 29.2% | 66.7% | 50.0% |

Weakest classes (small n, treat as rough): turkey, bobcat, bear and canine tracks, snowshoe hare,
American dog tick, black spruce, moose. Most common confusions: wild turkey vs great horned owl,
moose scat vs deer scat, balsam fir vs white spruce, red vs white spruce, red fox vs coyote,
deer vs canine tracks, foxglove vs mullein, cow parsnip vs giant hogweed.

## Compared with the previous model (v1, MobileNetV3, 8 classes)

v1 covered 8 plants from about 14 Commons photos each and had no "not sure" outcome; its leave-one-out
numbers are in `v1_mobilenet/REPORT.md`. It is not comparable on the same photos. In the field it called
a spruce branch "Water hemlock" (screenshot 8).

## The conifer regression

`fixtures/shot8_conifer.json` is the on-screen crop of that photo. v2 answers "I'm not sure", with white
and black spruce as the leading classes and nothing deadly. `test_camera_id.mjs` fails the build if
that photo is ever called Water hemlock, Poison hemlock or Death camas, or is matched to a non-conifer.
It also runs the shipped ONNX model in Node (onnxruntime-node) on that photo and checks the embedding
matches the Python one (cosine over 0.995), which also checks the JavaScript preprocessing.

## Caveats, said plainly

* These are web photos of observed organisms. Phone photos in poor light, partial plants or
  close-ups of a leaf will do worse. Tracks (29% top-1) are the weakest group and should be read as a hint
  at best. The app shows "not sure" often on purpose.
* The class list is not everything in New England. Anything outside it should land on "I'm not sure",
  but 20% of out-of-set photos still got an answer (1.4% a deadly one). The screen always says a photo is a hint,
  never an identification, and carries the emergency line.
* A deadly plant or mushroom appears in the top three for 96% of deadly-class photos, and a deadly
  look-alike scoring in the top three adds a warning to the result. 4.6% of deadly-class photos were
  answered with a non-deadly first choice; the look-alike notes are there for that.
* The model has been run on this Linux box with onnxruntime-node, which is the same version as the phone's
  runtime, but **not on a phone**. On-device speed, memory and the image-resize path (`expo-image-manipulator`
  vs PIL) need a real test. The weights-only quantisation was chosen because dynamic int8 gave
  runtime-dependent embeddings (cosine to the float model 0.93 on onnxruntime 1.24, 0.99 on 1.32); the
  shipped model scores 0.999 on both.
* The shipped head is trained on all photos (including the test split), so these numbers are a slightly
  conservative estimate for it. Thresholds were fixed before the test split was looked at.
* Photo credits (observer, observation id, licence) for every reference photo are in
  `assets/camera_id/credits.json`. Photos themselves are not shipped.
