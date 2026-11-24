// Safety number for two people. It covers BOTH keys of each person (X25519 and Ed25519), so a
// swapped signing key shows up as a different number. The same number appears on both phones.

import { sha512 } from "@noble/hashes/sha2";
import { concat, unb64, utf8 } from "./codec.js";

const DOMAIN = utf8("yehsa-safety-v2");

function order(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? [a, b] : [b, a];
  }
  return [a, b];
}

function cardBytes(card) {
  return concat(unb64(card.boxPublic), unb64(card.signPublic));
}

export function safetyNumber(first, second) {
  const [low, high] = order(cardBytes(first), cardBytes(second));
  const hash = sha512(concat(DOMAIN, low, high));
  const groups = [];
  for (let i = 0; i < 8; i += 1) {
    const value = (hash[i * 2] << 8) + hash[i * 2 + 1];
    groups.push(String(value % 10000).padStart(4, "0"));
  }
  return groups.join(" ");
}

export function sameNumber(a, b) {
  const x = String(a || "").replace(/\D+/g, "");
  const y = String(b || "").replace(/\D+/g, "");
  return x.length >= 32 && x === y;
}
