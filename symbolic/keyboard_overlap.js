// R10/R11: pure layout math for the keyboard inset (src/phone/keyboard_inset.js). All values in dp.

/**
 * R11: how far to lift the app so its bottom edge sits on the keyboard's top edge, from the window's
 * IME inset (native, src/phone/keyboard_inset.js). imeBottom is the keyboard's height from the bottom
 * of the window, including its toolbar, suggestion strip, number row and the navigation bar under it.
 * viewBottom is where the app's root view ends in window coordinates. If the system already resized
 * the window, the root ends at the keyboard and the lift is 0, so nothing is counted twice.
 */
export function imeLift({ imeBottom, windowHeight, viewBottom, visible = true }) {
  const ime = Number(imeBottom) || 0;
  if (!visible || ime <= 0) return 0;
  const win = Number(windowHeight) || 0;
  const bottom = Number.isFinite(viewBottom) && viewBottom > 0 ? viewBottom : win;
  const gap = win > 0 ? Math.max(0, win - bottom) : 0; // window space below the app already
  return Math.max(0, Math.round(ime - gap));
}

/**
 * Fallback with only React Native's keyboard event: keyboardTop is endCoordinates.screenY. On Android
 * endCoordinates.height leaves out the navigation bar (it is the IME inset minus the system bars), so
 * it is not a cap: R10 capped the lift at it, and the input sat one navigation bar too low.
 */
export function keyboardOverlap({ viewBottom, keyboardTop, keyboardHeight, screenHeight, navBottom = 0 }) {
  const h = Number(keyboardHeight) || 0;
  if (h <= 0) return 0;
  const screen = Number(screenHeight) || 0;
  const nav = Math.max(0, Number(navBottom) || 0);
  const top = Number.isFinite(keyboardTop) && keyboardTop > 0 ? keyboardTop : screen - h - nav;
  const bottom = Number.isFinite(viewBottom) && viewBottom > 0 ? viewBottom : screen;
  const most = screen > 0 ? screen : h + nav;
  return Math.max(0, Math.min(most, Math.round(bottom - top)));
}
