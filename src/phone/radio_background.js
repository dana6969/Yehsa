// Web and test build: no native foreground service here.
export function radioBackgroundAvailable() {
  return false;
}

export function startRadioService() {}

export function stopRadioService() {}

export function setRadioPaused() {}

export function addRadioCommandListener() {
  return () => {};
}
