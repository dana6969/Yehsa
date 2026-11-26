// R10-R12: pure layout math for the keyboard inset (src/phone/keyboard_inset.js). All values in dp.

/**
 * R12: what keyboard-controller's KeyboardAvoidingView pads (behavior "padding"): the part of the frame
 * below the keyboard's top edge. frameBottom comes from onLayout (parent coordinates; the frame is the
 * root's first child at y 0) and windowHeight from keyboard-controller's own native window size, so both
 * are in the same frame. (R10/R11 used measureInWindow, which on Android subtracts the visible display
 * frame's top, the status bar under edge-to-edge, and so came up one status bar short.)
 */
export function frameLift({ frameBottom, windowHeight, keyboardHeight }) {
  const h = Number(keyboardHeight) || 0;
  const win = Number(windowHeight) || 0;
  if (h <= 0 || win <= 0) return 0;
  const bottom = Number.isFinite(frameBottom) && frameBottom > 0 ? frameBottom : win;
  return Math.max(0, Math.round(bottom - (win - h)));
}

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

/** R12: the developer keyboard overlay text (More > About > Developer > Show keyboard debug). */
export function keyboardDebugLines({ win, screen, kbd, dbg }) {
  const kbcHeight = dbg.kbc?.height ?? 0;
  const frameBottom = dbg.frame ? dbg.frame.y + dbg.frame.height : null;
  const lift = frameLift({ frameBottom, windowHeight: win?.height, keyboardHeight: kbd.open ? kbcHeight : 0 });
  const r = (v) => (v == null || !Number.isFinite(Number(v)) ? "-" : String(Math.round(Number(v) * 10) / 10));
  return [
    `source ${kbd.source}${dbg.kbcEvents ? "" : " (no keyboard-controller events yet)"}`,
    `open ${kbd.open ? "yes" : "no"}  lift ${r(lift)}  pad ${r(kbd.pad)}`,
    `kbc ${dbg.kbc?.type || "-"} height ${r(dbg.kbc?.height)}  events ${dbg.kbcEvents}`,
    `rn ${dbg.rn?.type || "-"} height ${r(dbg.rn?.height)} screenY ${r(dbg.rn?.screenY)}  events ${dbg.rnEvents}`,
    `window ${r(win?.width)}x${r(win?.height)}  screen ${r(screen?.height)}`,
    `r11 math would lift ${r(dbg.rn && dbg.rootInWindow ? keyboardOverlap({ viewBottom: dbg.rootInWindow.bottom, keyboardTop: dbg.rn.screenY, keyboardHeight: dbg.rn.height, screenHeight: screen?.height }) : null)} (root measureInWindow vs keyboard top)`,
    `frame y ${r(dbg.frame?.y)} h ${r(dbg.frame?.height)}  root inWindow y ${r(dbg.rootInWindow?.y)} bottom ${r(dbg.rootInWindow?.bottom)}`
  ];
}
