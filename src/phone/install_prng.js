// Install the device CSPRNG before tweetnacl creates any peer key.
// react-native-get-random-values fills crypto.getRandomValues on Hermes.
// expo-crypto getRandomBytes reads the platform CSPRNG and is what setPRNG uses.

import "react-native-get-random-values";
import * as Crypto from "expo-crypto";
import { installSecurePrng } from "../../symbolic/secure_prng.js";

installSecurePrng((length) => {
  const bytes = Crypto.getRandomBytes(length);
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}, "expo-crypto");
