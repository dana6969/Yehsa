"""Builds the Yehsa icon, splash and adaptive icon from yehsa-logo-original.png (Pillow + numpy)."""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(HERE)
BG = (13, 10, 7, 255)  # #0d0a07

src = Image.open(os.path.join(HERE, "yehsa-logo-original.png")).convert("RGBA")
arr = np.array(src)
arr[arr[..., 3] < 6] = 0  # drop near-invisible dust so nothing haloes on dark
src = Image.fromarray(arr)
bbox = src.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox()
logo = src.crop(bbox)

# Farthest visible pixel from the crop center, so the mark can be fit inside a circle.
a = np.array(logo.getchannel("A")) > 40
ys, xs = np.nonzero(a)
cy, cx = (logo.height - 1) / 2, (logo.width - 1) / 2
radius = float(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max())


def place(size, scale, bg=None):
    canvas = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    w, h = round(logo.width * scale), round(logo.height * scale)
    mark = logo.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(mark, ((size - w) // 2, (size - h) // 2))
    return canvas


# App icon: whole emblem with the wordmark, padded on the dark background.
place(1024, 1024 * 0.90 / max(logo.size), BG).convert("RGB").save(os.path.join(ASSETS, "icon.png"), optimize=True)
# Adaptive foreground: transparent, every visible pixel inside the 66% safe circle (radius 338 of 1024).
place(1024, 330 / radius).save(os.path.join(ASSETS, "adaptive-icon.png"), optimize=True)
# Splash icon for expo-splash-screen: transparent square, mark inside the Android 12 icon circle.
place(1024, 335 / radius).save(os.path.join(ASSETS, "splash-icon.png"), optimize=True)
# Legacy / web splash: full logo on the dark background, contain.
place(1284, 1284 * 0.80 / max(logo.size), BG).convert("RGB").save(os.path.join(ASSETS, "splash.png"), optimize=True)
# Small header mark and favicon.
place(256, 256 * 0.96 / max(logo.size)).save(os.path.join(ASSETS, "brand", "yehsa-mark-256.png"), optimize=True)
place(192, 192 * 0.94 / max(logo.size), BG).convert("RGB").save(os.path.join(ASSETS, "favicon.png"), optimize=True)
print("logo bbox", bbox, "radius", round(radius))
