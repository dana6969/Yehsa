// Web and test build: there is no flashlight here.
export function torchModule() { return null; }
export function torchAvailable() { return false; }
export function playTorch() { return false; }
export function stopTorch() {}
export function keepTorchInBackground() {}
export function onTorchState() { return () => {}; }
