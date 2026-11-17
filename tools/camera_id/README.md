# Camera ID reference build

Offline camera ID (plan step 6) compares a photo's embedding with precomputed
embeddings of reference photos of plants Yehsa has notes for. The photos
themselves are **not** shipped, only int8 embeddings plus credits
(`assets/camera_id/index.json`, about 0.5 MB).

## Model

- MediaPipe Image Embedder, MobileNetV3-Small, float32
  (`https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/latest/mobilenet_v3_small.tflite`)
- License: Apache-2.0 (stated in the model metadata)
- 4,117,670 bytes, sha256 `bbbb4c51a55a53905af1daec995ca1aae355046f8839bb8c9f5ce9271394bc40`
- Input 1x224x224x3 float in [0, 1]; output a 1024-d feature vector
- Runs on the phone through `react-native-fast-tflite` 2.0.0 (MIT, LiteRT 1.4.0)

## Classes

yarrow, plantain, willow (the picture-guide plants) and wild carrot, poison
hemlock, water hemlock, wild onion, death camas (the look-alike notes in
`symbolic_books/herbology/notes.json`). Nothing outside these can be suggested.

## Rebuild

```sh
python3 -m venv venv && . venv/bin/activate && pip install ai-edge-litert pillow numpy
# 1. Fetch Commons photos (CC0 / public domain / CC BY / CC BY-SA only, JPEG >= 600 px,
#    titles that look like drawings, plates, herbarium sheets or maps skipped,
#    order fixed by an md5 of the file title so the pick is not hand-chosen).
python tools/camera_id/fetch_refs.py <(python -c "import json;print(json.dumps(json.load(open('tools/camera_id/refs_spec.json'))['positives']))") refs 14
python tools/camera_id/fetch_refs.py <(python -c "import json;print(json.dumps(json.load(open('tools/camera_id/refs_spec.json'))['negatives']))") negs 6
# 2. Remove the photos listed in excluded.json (micrographs, illustrations, plant not visible).
# 3. Copy picture-guide plant photos (not the look-alike one) to guide/, other guide images to guide_neg/.
python tools/camera_id/embed_refs.py mobilenet_v3_small.tflite aug.json "ref=refs/*.jpg" "guide=guide/*.webp" "neg=negs/*.jpg" "gneg=guide_neg/*.webp"
python tools/camera_id/build_index.py aug.json refs/sources.json
node eval/camera_id/loo.mjs --write
```

Commons category contents change over time, so a rebuild can pick different
photos; `index.json` keeps the credits for the photos actually used.
