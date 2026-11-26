// R12: every text box sits right on top of the system keyboard, through react-native-keyboard-controller.
//
// Why R10 and R11 missed (same spot both times): both lifted the app by
//   keyboard top - (root view bottom from measureInWindow).
// On Android, React Native's measureInWindow is relative to the *visible display frame*, not the window:
// RootViewUtil.getViewportOffset subtracts getWindowVisibleDisplayFrame().top, which under edge-to-edge is
// the status bar height. The keyboard numbers (RN keyboardDidShow screenY, or the IME inset) are window
// coordinates. So the root bottom read one status bar too high and every lift came up a status bar short,
// leaving the input row behind the keyboard's toolbar.
//
// keyboard-controller's KeyboardAvoidingView measures with onLayout (parent coordinates), its own native
// window size and the native IME inset, so nothing mixes coordinate frames. Its KeyboardProvider sits at
// the app root (App.js). This file keeps the small shared store the shell uses (tabs and chip hidden while
// typing, Ask scrolls to the end) and the developer keyboard overlay.
import React, { useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView, KeyboardEvents, useWindowDimensions } from "react-native-keyboard-controller";
import { keyboardDebugLines } from "../../symbolic/keyboard_overlap.js";

export const KEYBOARD_SOURCE = "react-native-keyboard-controller";
export const KEYBOARD_DEBUG_KEY = "yehsa.dev.keyboardDebug.v1";

const state = { open: false, pad: 0, source: "none" };
const listeners = new Set();
// What the developer overlay prints. Plain numbers, dp.
const debug = { kbc: null, rn: null, frame: null, rootInWindow: null, kbcEvents: 0, rnEvents: 0 };
const debugListeners = new Set();
let started = 0;
let subs = [];
let kbcSeen = false;

function tellDebug() {
  for (const fn of debugListeners) fn({ ...debug });
}

function publish(next) {
  if (next.open === state.open && Math.abs(next.pad - state.pad) < 1) return;
  state.open = next.open;
  state.pad = next.pad;
  state.source = next.source;
  for (const fn of listeners) fn({ ...state });
}

function fromKbc(type, e) {
  kbcSeen = true;
  debug.kbcEvents += 1;
  const height = Number(e?.height) || 0;
  debug.kbc = { type, height, duration: e?.duration ?? null };
  tellDebug();
  if (type === "keyboardWillShow" || type === "keyboardDidShow") publish({ open: true, pad: height, source: KEYBOARD_SOURCE });
  else publish({ open: false, pad: 0, source: KEYBOARD_SOURCE });
}

function fromRn(type, e) {
  debug.rnEvents += 1;
  const end = e?.endCoordinates || {};
  debug.rn = { type, height: end.height ?? null, screenY: end.screenY ?? null };
  tellDebug();
  // keyboard-controller drives the state when its native side is there; React Native's events are the
  // fallback (web, or a build without it).
  if (kbcSeen) return;
  if (type.endsWith("Hide")) publish({ open: false, pad: 0, source: "rn" });
  else publish({ open: true, pad: Number(end.height) || 0, source: "rn" });
}

function start() {
  started += 1;
  if (started > 1) return;
  const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
  const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
  subs = [
    KeyboardEvents.addListener("keyboardWillShow", (e) => fromKbc("keyboardWillShow", e)),
    KeyboardEvents.addListener("keyboardDidShow", (e) => fromKbc("keyboardDidShow", e)),
    KeyboardEvents.addListener("keyboardDidHide", (e) => fromKbc("keyboardDidHide", e)),
    Keyboard.addListener(show, (e) => fromRn(show, e)),
    Keyboard.addListener(hide, (e) => fromRn(hide, e))
  ];
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

/** Called with { open, pad, source } whenever the keyboard opens, closes or changes height. */
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

/** R10 name, kept for callers. */
export function useKeyboardInset() {
  return useKeyboard();
}

/**
 * The app frame. keyboard-controller pads its bottom by exactly the part of it the keyboard covers, so
 * the last row inside (the Ask input, the search boxes, the chat box) sits on the keyboard's top edge.
 * Every screen with a text box is inside this frame.
 */
export function KeyboardFrame({ root, style, children }) {
  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={frameStyles.outer}
      onLayout={(e) => {
        const l = e?.nativeEvent?.layout;
        if (l) {
          debug.frame = { y: l.y, height: l.height };
          tellDebug();
        }
        const node = root?.current;
        if (node?.measureInWindow) {
          node.measureInWindow((x, y, w, h) => {
            debug.rootInWindow = { y, bottom: y + h };
            tellDebug();
          });
        }
      }}
    >
      {/* An in-flow inner view, so the padding shrinks it and the overlays inside (the search sheet,
          the reader's find box, SOS) move up with it; absolute children would ignore the padding. */}
      <View style={style}>{children}</View>
    </KeyboardAvoidingView>
  );
}

/** Hidden while the keyboard is open (the tab bar and the Ask chip), so the input gets the room. */
export function KeyboardHidden({ children, style }) {
  const { open } = useKeyboard();
  if (open) return null;
  return style ? <View style={style}>{children}</View> : children;
}

// ---- Developer overlay (More > About > Developer > Show keyboard debug). Off by default. ----

let debugOn = false;
const debugOnListeners = new Set();

export function setKeyboardDebug(on) {
  debugOn = Boolean(on);
  for (const fn of debugOnListeners) fn(debugOn);
}

export function useKeyboardDebugOn() {
  const [on, setOn] = useState(debugOn);
  useEffect(() => {
    debugOnListeners.add(setOn);
    setOn(debugOn);
    return () => debugOnListeners.delete(setOn);
  }, []);
  return on;
}

export function KeyboardDebugOverlay() {
  const on = useKeyboardDebugOn();
  if (!on) return null;
  return <KeyboardDebugBox />;
}

function KeyboardDebugBox() {
  const kbd = useKeyboard();
  const win = useWindowDimensions();
  const [dbg, setDbg] = useState(() => ({ ...debug }));
  useEffect(() => {
    debugListeners.add(setDbg);
    setDbg({ ...debug });
    return () => debugListeners.delete(setDbg);
  }, []);
  const lines = keyboardDebugLines({ win, screen: Dimensions.get("screen"), kbd, dbg });
  return (
    <View pointerEvents="none" style={debugStyles.box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {lines.map((line) => <Text key={line} style={debugStyles.text}>{line}</Text>)}
    </View>
  );
}

const frameStyles = StyleSheet.create({
  outer: { flex: 1, width: "100%", alignSelf: "stretch" }
});

const debugStyles = StyleSheet.create({
  box: {
    position: "absolute",
    top: 44,
    left: 6,
    right: 6,
    padding: 6,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.78)",
    zIndex: 9999,
    elevation: 9999
  },
  text: { color: "#9f9", fontSize: 11, fontFamily: Platform.OS === "android" ? "monospace" : undefined }
});

export function _debugKeyboard() {
  return { state: { ...state }, debug: { ...debug }, kbcSeen };
}
