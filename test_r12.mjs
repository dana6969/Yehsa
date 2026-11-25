// R12: the keyboard. R10 and R11 lifted the app one status bar short because React Native's
// measureInWindow on Android is relative to the visible display frame (RootViewUtil.getViewportOffset
// subtracts its top, the status bar under edge-to-edge), while the keyboard's top is in window
// coordinates. R12 hands the layout to react-native-keyboard-controller's KeyboardAvoidingView.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { frameLift, imeLift, keyboardDebugLines, keyboardOverlap } from "./symbolic/keyboard_overlap.js";

const src = (f) => fs.readFileSync(f, "utf8");

test("root cause: mixing measureInWindow with window coordinates comes up one status bar short", () => {
  // Dana's phone (dp): window 915, status bar 40, Gboard with number row and toolbar 288 + 48 navigation bar.
  const win = 915, status = 40, ime = 336, rnHeight = 288, keyboardTop = win - ime;
  // measureInWindow on the full-screen root: y = -status, so its bottom reads 875, not 915.
  const rootBottomInWindow = win - status;
  assert.equal(keyboardOverlap({ viewBottom: rootBottomInWindow, keyboardTop, keyboardHeight: rnHeight, screenHeight: win }), ime - status);
  assert.equal(imeLift({ imeBottom: ime, windowHeight: win, viewBottom: rootBottomInWindow }), ime - status);
  // The R12 math (keyboard-controller's): onLayout frame (y 0 in the root) and its own window size.
  assert.equal(frameLift({ frameBottom: 0 + win, windowHeight: win, keyboardHeight: ime }), ime);
});

test("the R12 lift is the covered part of the frame for any keyboard height", () => {
  for (const h of [250, 288, 336, 402]) assert.equal(frameLift({ frameBottom: 915, windowHeight: 915, keyboardHeight: h }), h);
  // Floating keyboard, closed keyboard.
  assert.equal(frameLift({ frameBottom: 915, windowHeight: 915, keyboardHeight: 0 }), 0);
  // A frame that stops above the navigation bar: only the rest.
  assert.equal(frameLift({ frameBottom: 867, windowHeight: 915, keyboardHeight: 336 }), 288);
  // The window was resized for the keyboard: nothing is covered, nothing twice.
  assert.equal(frameLift({ frameBottom: 579, windowHeight: 915, keyboardHeight: 336 }), 0);
});

test("keyboard-controller is the one keyboard path: provider at the root, avoiding view as the frame", () => {
  const pkg = JSON.parse(src("package.json"));
  assert.equal(pkg.dependencies["react-native-keyboard-controller"], "1.17.5");
  assert.ok(pkg.dependencies["react-native-reanimated"], "keyboard-controller needs reanimated");
  const ki = src("src/phone/keyboard_inset.js");
  assert.match(ki, /from "react-native-keyboard-controller"/);
  assert.match(ki, /<KeyboardAvoidingView\s+behavior="padding"/);
  assert.doesNotMatch(ki, /YehsaIme|requireOptionalNativeModule|marginBottom/);
  // The overlays inside move with the padding because they sit in an in-flow inner view.
  assert.match(ki, /<View style=\{style\}>\{children\}<\/View>\s*<\/KeyboardAvoidingView>/);
  const app = src("src/phone/YehsaApp.js");
  assert.match(app, /<KeyboardProvider statusBarTranslucent navigationBarTranslucent>/);
  assert.ok(app.indexOf("<KeyboardProvider") < app.indexOf("<KeyboardFrame"));
  assert.ok(app.lastIndexOf("</KeyboardFrame>") < app.lastIndexOf("</KeyboardProvider>"));
  assert.ok(!fs.existsSync("modules/yehsa-ime"), "the R11 custom module is gone");
});

test("every text box is inside the keyboard frame (no Modal holds a TextInput)", () => {
  const dir = "src/phone";
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const s = src(path.join(dir, f));
    if (/<Modal\b/.test(s)) assert.doesNotMatch(s, /<TextInput\b/, `${f} has a Modal and a TextInput`);
    if (f !== "keyboard_inset.js") assert.doesNotMatch(s, /KeyboardAvoidingView|Keyboard\.addListener/, `${f} has its own keyboard handling`);
  }
});

test("the keyboard debug overlay is off by default, saved, and prints source, sizes and lift", () => {
  const ki = src("src/phone/keyboard_inset.js");
  assert.match(ki, /let debugOn = false;/);
  assert.match(ki, /KEYBOARD_DEBUG_KEY = "yehsa\.dev\.keyboardDebug\.v1"/);
  const app = src("src/phone/YehsaApp.js");
  assert.match(app, /accessibilityLabel="Show keyboard debug"/);
  assert.match(app, /<KeyboardDebugSwitch \/>/);
  assert.match(app, /<KeyboardDebugOverlay \/>/);
  assert.match(app, /getItem\(KEYBOARD_DEBUG_KEY\)/);
  const lines = keyboardDebugLines({
    win: { width: 411, height: 915 },
    screen: { height: 915 },
    kbd: { open: true, pad: 336, source: "react-native-keyboard-controller" },
    dbg: { kbc: { type: "keyboardDidShow", height: 336 }, rn: { type: "keyboardDidShow", height: 288, screenY: 579 }, frame: { y: 0, height: 915 }, rootInWindow: { y: -40, bottom: 875 }, kbcEvents: 2, rnEvents: 1 }
  });
  assert.equal(lines[0], "source react-native-keyboard-controller");
  assert.match(lines[1], /lift 336/);
  assert.match(lines.join("\n"), /r11 math would lift 296/);
  const none = keyboardDebugLines({ win: { height: 915 }, screen: {}, kbd: { open: false, pad: 0, source: "none" }, dbg: { kbcEvents: 0, rnEvents: 0 } });
  assert.match(none[0], /no keyboard-controller events yet/);
});
