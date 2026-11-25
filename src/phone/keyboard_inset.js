// R11: keep every text box right on top of the system keyboard, whatever its height.
// Android edge-to-edge (Expo SDK 53) does not resize the window for the keyboard, and React Native's
// keyboardDidShow height leaves out the navigation bar, so R10's lift came up one navigation bar short.
// The real keyboard size comes from the window's IME inset (modules/yehsa-ime); React Native's
// keyboard events are the fallback (web, iOS, an older build). One store feeds everything, and only the
// small KeyboardFrame / KeyboardHidden components re-render when the keyboard moves, not the whole app.
import React, { useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform, View } from "react-native";
import { imeLift, keyboardOverlap } from "../../symbolic/keyboard_overlap.js";

export { imeLift, keyboardOverlap };

let ime = null;
try {
  // eslint-disable-next-line global-require
  const core = require("expo-modules-core");
  ime = Platform.OS === "android" ? core.requireOptionalNativeModule?.("YehsaIme") || null : null;
} catch {
  ime = null;
}

const state = { open: false, pad: 0, source: "none" };
const listeners = new Set();
let rootRef = null;
let started = 0;
let subs = [];
let lastNative = null;
let lastRn = null;

function publish(next) {
  if (next.open === state.open && Math.abs(next.pad - state.pad) < 1) return;
  state.open = next.open;
  state.pad = next.pad;
  state.source = next.source;
  for (const fn of listeners) fn({ ...state });
}

function measureRoot(done) {
  const node = rootRef?.current;
  if (node?.measureInWindow) {
    node.measureInWindow((x, y, w, h) => done(Number.isFinite(y + h) && h > 0 ? y + h : undefined));
  } else {
    done(undefined);
  }
}

function fromNative(snap) {
  if (!snap || snap.ok !== true) return false;
  lastNative = snap;
  if (!snap.visible) {
    publish({ open: false, pad: 0, source: "ime" });
    return true;
  }
  measureRoot((viewBottom) => {
    publish({ open: true, pad: imeLift({ imeBottom: snap.imeBottom, windowHeight: snap.windowHeight, viewBottom, visible: true }), source: "ime" });
  });
  return true;
}

function fromRn(event) {
  lastRn = event;
  // The native inset is the truth when it is there; read it now (the event may beat the inset callback).
  if (ime?.current) {
    try {
      if (fromNative(ime.current())) return;
    } catch {
      // fall back to the event
    }
  }
  const end = event?.endCoordinates || {};
  const screenHeight = Dimensions.get("screen").height;
  measureRoot((viewBottom) => {
    publish({ open: true, pad: keyboardOverlap({ viewBottom, keyboardTop: end.screenY, keyboardHeight: end.height, screenHeight }), source: "rn" });
  });
}

function start() {
  started += 1;
  if (started > 1) return;
  const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
  const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
  subs = [
    Keyboard.addListener(showEvent, fromRn),
    Keyboard.addListener("keyboardDidChangeFrame", (e) => { if (state.open) fromRn(e); }),
    Keyboard.addListener(hideEvent, () => {
      lastRn = null;
      if (ime?.current) {
        try {
          if (fromNative(ime.current())) return;
        } catch {
          // fall through
        }
      }
      publish({ open: false, pad: 0, source: "rn" });
    })
  ];
  if (ime?.addListener) {
    try {
      subs.push(ime.addListener("onIme", fromNative));
    } catch {
      // events not available: React Native's keyboard events still work
    }
  }
}

function stop() {
  started = Math.max(0, started - 1);
  if (started > 0) return;
  for (const s of subs) s?.remove?.();
  subs = [];
}

/** The keyboard right now: { open, pad, source }. */
export function keyboardState() {
  return { ...state };
}

/** Called with { open, pad } whenever the keyboard opens, closes or changes height. */
export function onKeyboardChange(fn) {
  listeners.add(fn);
  start();
  return () => {
    listeners.delete(fn);
    stop();
  };
}

export function useKeyboard() {
  const [snap, setSnap] = useState(keyboardState);
  useEffect(() => onKeyboardChange(setSnap), []);
  return snap;
}

/** R10 name, kept for callers: the keyboard state, measuring against viewRef. */
export function useKeyboardInset(viewRef) {
  if (viewRef) rootRef = viewRef;
  return useKeyboard();
}

/**
 * The app frame: lifted by exactly the keyboard's overlap. Its children are created by the parent, so
 * a keyboard change re-renders only this view, not the screens inside it.
 */
export function KeyboardFrame({ root, style, children }) {
  if (root) rootRef = root;
  const { pad } = useKeyboard();
  return <View style={[style, pad ? { marginBottom: pad } : null]}>{children}</View>;
}

/** Hidden while the keyboard is open (the tab bar and the Ask chip), so the input gets the room. */
export function KeyboardHidden({ children, style }) {
  const { open } = useKeyboard();
  if (open) return null;
  return style ? <View style={style}>{children}</View> : children;
}

export function _debugKeyboard() {
  return { state: { ...state }, lastNative, lastRn, native: Boolean(ime) };
}
