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

`plugins/withPeerKeyBackup.js` runs during `expo prebuild` and sets `android:allowBackup="false"`. The backup rules exclude the whole app directory from cloud backup and from device-to-device transfer. A test runs prebuild and checks those files.

## Retention

The same identity is loaded on the next launch and after an app update, because SecureStore and app data survive those. Uninstalling the app deletes them. There is no silent copy.

Settings shows your key fingerprint (the safety number of your own public key with itself).

"Reset identity" does nothing until Approve. Approve deletes the identity, the history key, and the sealed history, then creates a new identity. The screen says contacts must re-verify you.

## A copied app directory

Copying `/data/data/<package>` (SharedPreferences, SQLite/AsyncStorage, and files) onto another phone does not move the identity.

expo-secure-store generates an AES key inside `AndroidKeyStore` and writes only ciphertext into the `SecureStore` shared preferences (`SecureStoreModule.kt`, `AESEncryptor.kt`). The key is not returned to JavaScript. `setUserAuthenticationRequired` is used when the PIN/biometric switch is on. Keystore key material stays in the original phone's TEE or StrongBox, so the copied ciphertext cannot be unwrapped.

The private identity, the history key, and a random device-binding token are written only through `setSecret` (SecureStore). Chat history in AsyncStorage is the secretbox ciphertext, not the key. A storage audit fails the build tests if a private key, history key, or seed is placed on the same lines as `AsyncStorage.setItem` or a file write. Learned notes and the public owner record are not key material. The binding token that sits beside the owner check is the Keystore item. A matching owner record is not enough: `cloneDecision` stays foreign when unwrap fails, even if the owner check would have passed. The check does not use `ANDROID_ID`.

On launch, if unwrap fails, or if a sealed history is present without a readable key, Yehsa does not crash and does not try to recover the copy. People shows "This copy can't open the original owner's chats". The old identity is not used and the history is not decrypted. A new identity is created only after Approve, which deletes the unreadable blobs. Contacts then see the safety-number warning.

Key attestation, where a phone offers it, is a certificate that the key was created in the TEE or StrongBox and is not exportable. It does not name the person holding the unlocked phone. This build does not require attestation; unwrap failure is enough to fail closed. `attestationStatus()` reports that attestation was not checked.

`android:allowBackup="false"` blocks adb backup and Google cloud backup. `fullBackupContent` and `dataExtractionRules` exclude the root, file, database, shared preferences, and external domains for both cloud backup and device-to-device transfer on Android 12+. Prebuild output is checked for those rules.

The passphrase backup is the only sanctioned way to move an identity. A copied directory cannot export the old key. Import still requires the passphrase and Approve.

## Recovery

The default is no recovery. A lost phone is a new identity. Contacts see "Safety number changed. Re-verify this person before you trust the new key." whenever a stored peer key is replaced. That warning is `notePeerKey` and it is shown in the People screen.

An optional backup exists. Export wraps the identity with scrypt (N=32768, r=8, p=1) and XSalsa20-Poly1305. The file is given to the share sheet, or downloaded in a browser. Yehsa does not upload it. Import does nothing until Approve. A wrong passphrase does not open the file. After a successful import the history key is deleted, because it belonged to the previous identity, and the screen says contacts must re-verify.

## Web preview

The web build says "This web preview is a demo identity only." The private key is not written to a secure store. Export and import of a backup are refused there. Refreshing the page starts a new demo identity.

## Limits

These are out of scope. The design does not claim to stop them:

- A rooted original phone while it is unlocked, so the Keystore will still unwrap for the app.
- Malware already running on the original phone.
- Someone who has the original phone and its PIN or biometric.

Learned notes and the public owner record are readable in a copied directory. They are not the chat keys, and they do not open the history.

## What a phone still has to confirm

Verified in tests on this computer:

- A mock second device that cannot unwrap SecureStore gets no identity and no history plaintext.
- The clone screen string and the Approve gate are in the People screen.
- The storage audit finds no private key or history key next to an AsyncStorage or file write.
- expo-secure-store's Android sources reference `AndroidKeyStore` and `setUserAuthenticationRequired`.
- Prebuild writes `allowBackup="false"` and backup rules that exclude every storage domain, including device transfer.

Not verified on hardware:

- An `adb root` copy of `/data/data/<package>` from one phone onto another.
- `KeyInfo.isInsideSecureHardware` (TEE or StrongBox) on a real device.
- The biometric prompt, survival across a real process death, and deletion after uninstall.
- The debug APK was not rebuilt after this clone check.
