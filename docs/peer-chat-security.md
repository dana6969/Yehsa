# Peer chat keys

This is how Yehsa creates, keeps, and recovers a peer-chat identity. It is not a claim that the radio link is encrypted, and it does not replace a held mesh link.

## Generation

Identity keys are an X25519 box pair and an Ed25519 signing pair from tweetnacl.

The bytes come from a CSPRNG:

1. `index.js` imports `src/phone/install_prng.js` before the app loads.
2. That file imports `react-native-get-random-values`, which installs `crypto.getRandomValues` on Hermes.
3. It then calls `nacl.setPRNG` with `expo-crypto` `getRandomBytes`. On Android and iOS that reads the platform CSPRNG.

`Math.random` is refused. `installSecurePrng` throws if it is passed `Math.random` or anything that does not return 32 bytes. `symbolic/peer_chat.js`, `symbolic/secure_prng.js`, and `src/phone/install_prng.js` do not call `Math.random`. A test fails if that stops being true, and it fails if `generateIdentity` does not draw from the installed generator.

## Storage

On Android and iOS the private keys and a separate history key are stored with `expo-secure-store`:

- iOS accessibility is `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so the item is not migrated in a backup to another device.
- Android stores the wrapping key in the Android Keystore (`AndroidKeyStore`). The ciphertext sits in the `SecureStore` shared preferences. The Keystore key is not exported by the app.
- The Settings switch "Unlock chat with PIN or biometrics" saves those items with `requireAuthentication: true`. expo-secure-store maps that to `setUserAuthenticationRequired(true)` and uses a distinct keystore alias (`yehsa.peer.auth`).
- Chat history is sealed with NaCl secretbox (XSalsa20-Poly1305). The secretbox key is the SecureStore history key. The ciphertext is in app storage (`AsyncStorage`), not in the secret slot.

`plugins/withPeerKeyBackup.js` runs during `expo prebuild` and sets `android:allowBackup="false"`. It also writes `peer_key_backup_rules.xml` and `peer_key_data_extraction_rules.xml`, which exclude `SecureStore`, the `RKStorage` database, and `yehsa-peer-history` from cloud backup and device transfer. A test runs prebuild and checks those files.

## Retention

The same identity is loaded on the next launch and after an app update, because SecureStore and app data survive those. Uninstalling the app deletes them. There is no silent copy.

Settings shows your key fingerprint (the safety number of your own public key with itself).

"Reset identity" does nothing until Approve. Approve deletes the identity, the history key, and the sealed history, then creates a new identity. The screen says contacts must re-verify you.

## Recovery

The default is no recovery. A lost phone is a new identity. Contacts see "Safety number changed. Re-verify this person before you trust the new key." whenever a stored peer key is replaced. That warning is `notePeerKey` and it is shown in the People screen.

An optional backup exists. Export wraps the identity with scrypt (N=32768, r=8, p=1) and XSalsa20-Poly1305. The file is given to the share sheet, or downloaded in a browser. Yehsa does not upload it. Import does nothing until Approve. A wrong passphrase does not open the file. After a successful import the history key is deleted, because it belonged to the previous identity, and the screen says contacts must re-verify.

## Web preview

The web build says "This web preview is a demo identity only." The private key is not written to a secure store. Export and import of a backup are refused there. Refreshing the page starts a new demo identity.

## What a phone still has to confirm

These checks were run on a computer, not on a handset:

- `expo prebuild` wrote `allowBackup="false"` and the backup rules. `./gradlew :app:assembleDebug` was run for the map work, not again after this key change, and the APK was not installed.
- SecureStore round trip, restart, reset, backup, wrong passphrase, and the key-change warning were simulated in Node with an in-memory adapter.
- Whether the Android Keystore key is hardware-backed (TEE or StrongBox) depends on the phone. `KeyInfo.isInsideSecureHardware` was not read.
- Persistence after a real process death, biometric prompt, and deletion on uninstall were not exercised on a device.
