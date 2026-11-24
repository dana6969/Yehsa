// Rotating per-conversation tags. A relay sees a 32-byte value that changes every 12 hours and is
// different for each direction of each conversation. It cannot link two tags without the shared key.
// The key comes from the static X25519 pair, so only the two people can compute the tags.

import nacl from "tweetnacl";
import { hkdf } from "@noble/hashes/hkdf";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { concat, hex, u32, unb64, utf8 } from "./codec.js";

export const EPOCH_SECONDS = 12 * 60 * 60;
export const MAX_CATCH_UP_DAYS = 7;

function ordered(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? concat(a, b) : concat(b, a);
  }
  return concat(a, b);
}

export function conversationKey(me, peerBoxPublic) {
  const mine = unb64(me.boxPublic);
  const theirs = unb64(peerBoxPublic);
  const shared = nacl.scalarMult(unb64(me.boxSecret), theirs);
  return hkdf(sha256, shared, utf8("yehsa-tag-v1"), ordered(mine, theirs), 32);
}

export function epochOf(seconds) {
  return Math.floor(seconds / EPOCH_SECONDS);
}

export function tagFor(key, recipientBoxPublic, epoch) {
  return hex(hmac(sha256, key, concat(utf8("tag"), unb64(recipientBoxPublic), u32(epoch))));
}

/** Tags this phone listens on for one contact: every epoch since `sinceSeconds`, plus the next one. */
export function tagsToWatch(key, myBoxPublic, nowSeconds, sinceSeconds = nowSeconds) {
  const floor = nowSeconds - MAX_CATCH_UP_DAYS * 86400;
  const first = epochOf(Math.max(sinceSeconds - 3600, floor));
  const last = epochOf(nowSeconds) + 1;
  const tags = [];
  for (let epoch = first; epoch <= last; epoch += 1) tags.push(tagFor(key, myBoxPublic, epoch));
  return tags;
}
