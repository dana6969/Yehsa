// Web and test build: no on-device model, so the phone keeps the lexical path.
export function meaningSupported() {
  return false;
}

export async function prepareMeaning() {
  return null;
}
