// R10: pure layout math for the keyboard inset (src/phone/keyboard_inset.js).
/** Pure: how far the keyboard covers the app's view, in points. */
export function keyboardOverlap({ viewBottom, keyboardTop, keyboardHeight, screenHeight }) {
  const h = Number(keyboardHeight) || 0;
  if (h <= 0) return 0;
  const top = Number.isFinite(keyboardTop) && keyboardTop > 0 ? keyboardTop : (Number(screenHeight) || 0) - h;
  const bottom = Number.isFinite(viewBottom) && viewBottom > 0 ? viewBottom : Number(screenHeight) || 0;
  return Math.max(0, Math.min(h, Math.round(bottom - top)));
}

