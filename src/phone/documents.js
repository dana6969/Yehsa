// Downloaded documents, phone side: the shared service over sealed files, the on-device meaning
// model, and a small React hook. See symbolic/docs/doc_service.js for what is stored and how.
import { useEffect, useState } from "react";
import nacl from "tweetnacl";
import { createDocService } from "../../symbolic/docs/doc_service.js";
import { documentIntent } from "../../symbolic/docs/doc_find.js";
import { getVector } from "../../symbolic/meaning/vector_cache.js";
import { docFiles } from "./doc_files";
import { embedNotes } from "./meaning_provider";
import { createAdapter } from "./secure_adapter";

const secrets = createAdapter("yehsa.docs");

export const documents = createDocService({
  getSecret: (name) => secrets.getSecret(name),
  setSecret: (name, value) => secrets.setSecret(name, value),
  deleteSecret: (name) => secrets.deleteSecret(name),
  readFile: docFiles.readFile,
  writeFile: docFiles.writeFile,
  deleteFile: docFiles.deleteFile,
  get fetchImpl() {
    return globalThis.fetch ? globalThis.fetch.bind(globalThis) : null;
  },
  embed: (texts) => embedNotes(texts),
  randomBytes: (n) => nacl.randomBytes(n)
});

export { documentIntent };

/** The question vector the meaning matcher already made for this question, if it ran. */
export function questionVector(question) {
  return getVector(`q:${question}`) || null;
}

export function useDocuments() {
  const [snap, setSnap] = useState(documents.snapshot());
  useEffect(() => {
    const off = documents.subscribe(setSnap);
    documents.load().then(() => setSnap(documents.snapshot()));
    return off;
  }, []);
  return snap;
}
