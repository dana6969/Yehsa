// Flags plaintext key material sitting next to a normal disk write.
// SecureStore and sealAtRest are the allowed homes for secrets.

const WRITE = /AsyncStorage\.(setItem|multiSet)|FileSystem\.writeAsStringAsync|FileSystem\.write\b|fs\.writeFileSync/;
const SECRET = /\bboxSecret\b|\bsignSecret\b|\bhistoryKey\b|\bseedBytes\b/;

export function auditStorageText(filename, text) {
  const lines = String(text || "").split(/\n/);
  const problems = [];
  lines.forEach((line, index) => {
    if (!WRITE.test(line) || line.trim().startsWith("//") || line.trim().startsWith("*")) return;
    const span = lines.slice(Math.max(0, index - 1), index + 2).join("\n");
    if (SECRET.test(span)) {
      problems.push({ file: filename, line: index + 1, text: line.trim() });
    }
  });
  return problems;
}

export const KEYSTORE_FACTS = {
  provider: "AndroidKeyStore",
  prefs: "SecureStore",
  proves: "expo-secure-store generates an AES key inside AndroidKeyStore and stores only ciphertext in the SecureStore shared preferences. The key is not exported to JavaScript. A copied directory does not include that key."
};
