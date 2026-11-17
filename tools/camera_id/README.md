# Camera ID build (v2)

Offline camera ID compares a photo with 170 classes (plants, trees, mushrooms, animals, tracks, scat)
using **DINOv2-small** image embeddings and a **linear head** that also has a "something else" class.
No photos ship; only the 384-d head (about 95 KB), class notes and photo credits.

## Pieces

| File | What |
|---|---|
| `classes_spec.py` | The 170 classes: iNaturalist taxa, group, use (edible / medicinal / toxic / deadly / ...), look, caution, look-alikes. |
| `fetch_inat.py` | Research-grade iNaturalist photos, licence CC0 / CC BY / CC BY-SA only, North America, one photo per observer. Tracks and scat use the "Evidence of Presence" annotation. Also builds the `_other` pool of species not in the set. |
| `fetch_hard.py` | Hard negatives: other conifers (Pinaceae, Cupressaceae), other umbels, other mushrooms, other snakes, etc. |
| `quantize_weights.py` | Weight-only int8 of the DINOv2-small ONNX export (`onnx-community/dinov2-small`, Apache-2.0). Activations stay float so every runtime gives the same embedding. |
| `embed_inat.py` | Embeds every photo (and with `--flip` its mirror). Centre square crop, 224 px bilinear, ImageNet mean/std. |
| `build_index2.py` | Trains the head, picks the "not sure" thresholds on a calibration split, prints held-out numbers, and with `--write` writes `assets/camera_id/{index,classes,credits}.json`. |
| `make_conifer_fixture.py` | Builds the spruce/fir regression fixture. |
| `eval_split.py` | Earlier experiments used to choose the model and head (kNN vs linear, feature choice). |

## Rebuild

```sh
python tools/camera_id/fetch_inat.py <data>/full
python tools/camera_id/fetch_hard.py <data>/full
python tools/camera_id/quantize_weights.py dino_s_fp32.onnx dino_w8.onnx   # copy to assets/camera_id/dinov2_small_w8.onnx
python tools/camera_id/embed_inat.py <data>/full dino_w8 && python tools/camera_id/embed_inat.py <data>/full dino_w8 --flip
python tools/camera_id/build_index2.py <data>/full <emb_dir> assets/camera_id            # report only
python tools/camera_id/build_index2.py <data>/full <emb_dir> assets/camera_id --write    # write assets
```

iNaturalist contents change over time, so a rebuild picks different photos. `credits.json` lists the
observation id, observer and licence of every photo used.

## Held-out numbers

`eval/camera_id/REPORT.md` and `eval/camera_id/report.json`. The split is by a hash of the photo id:
about 64% reference, 18% calibration (thresholds only), 18% test. The test split is never used for
training or for choosing a threshold. The shipped head is retrained on all photos, so the report is a
slightly conservative estimate.

The earlier MobileNetV3 build is kept in `v1_mobilenet/` for history.
