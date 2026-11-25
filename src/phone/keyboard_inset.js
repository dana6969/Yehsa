// R10: keep every text box above the system keyboard.
// With Android edge-to-edge (Expo SDK 53, app.json android.edgeToEdgeEnabled) the window is no longer
// resized for the keyboard, so "adjustResize" alone leaves the Ask bar under it. This hook measures
// where the keyboard's top edge is against the bottom of the app's own view and returns the overlap,
// which the shell uses as bottom margin. If the system did resize the window, the overlap is 0, so the
// space is never added twice.
import { useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform } from "react-native";
import { keyboardOverlap } from "../../symbolic/keyboard_overlap.js";

export { keyboardOverlap };

export function useKeyboardInset(viewRef) {
  const [inset, setInset] = useState({ open: false, pad: 0 });
  const last = useRef(null);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const measure = (event) => {
      last.current = event;
      const end = event?.endCoordinates || {};
      const screenHeight = Dimensions.get("screen").height;
      const finish = (viewBottom) => setInset({
        open: true,
        pad: keyboardOverlap({ viewBottom, keyboardTop: end.screenY, keyboardHeight: end.height, screenHeight })
      });
      const node = viewRef?.current;
      if (node?.measureInWindow) {
        // Measure with no margin applied yet, so a window that did resize reads as 0 overlap.
        node.measureInWindow((x, y, w, h) => finish(Number.isFinite(y + h) && h > 0 ? y + h : undefined));
      } else {
        finish(undefined);
      }
    };
    const show = Keyboard.addListener(showEvent, measure);
    const hide = Keyboard.addListener(hideEvent, () => { last.current = null; setInset({ open: false, pad: 0 }); });
    return () => { show.remove(); hide.remove(); };
  }, [viewRef]);
  return inset;
}
