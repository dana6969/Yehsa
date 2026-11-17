// Web has no device secure store. A key typed here is not kept.

export async function saveModelKey() {
  return { ok: false, reason: "This browser has no secure store. The key was not saved and will not be sent." };
}

export async function readModelKey() {
  return null;
}

export async function deleteModelKey() {
  return { ok: true };
}
