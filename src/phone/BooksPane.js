// Your books: import EPUB or TXT, read Kiwix ZIM files, delete any import.
// Imports are labelled with the book title, rank below Yehsa's checked notes,
// and never replace an emergency or care note.

import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { onImportedChange, currentImported } from "../../symbolic/imported_registry.js";
import { openZim } from "../../symbolic/zim_reader.js";
import { formatBytes } from "../../symbolic/map_packs.js";
import { bootImportedBooks, importBookBytes, importParsed, onIndexProgress, removeBook } from "./imported_books.js";
import { pickFile, readerForUri } from "./book_files";
import { Action, Field, Quiet, ScreenHeader } from "./ui.js";
import { colors, radius, space, type } from "./tokens.js";

export default function BooksPane({ onClose }) {
  const [store, setStore] = useState(currentImported());
  const [progress, setProgress] = useState({ done: 0, total: 0, running: false });
  const [note, setNote] = useState("Books stay on this phone. Nothing is uploaded.");
  const [busy, setBusy] = useState(false);
  const [zim, setZim] = useState(null);
  const [zimQuery, setZimQuery] = useState("");
  const [zimHits, setZimHits] = useState([]);
  const [article, setArticle] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const zimRef = useRef(null);

  useEffect(() => {
    bootImportedBooks().then(() => setStore(currentImported()));
    const off = onImportedChange(setStore);
    const offProgress = onIndexProgress(setProgress);
    return () => {
      off();
      offProgress();
    };
  }, []);

  async function importBook() {
    const file = await pickFile({ accept: ".epub,.txt,.text,.md" });
    if (!file.ok) {
      setNote(file.reason);
      return;
    }
    if (/\.zim$/i.test(file.name)) {
      setNote("That is a Kiwix ZIM file. Use Open ZIM below.");
      return;
    }
    setBusy(true);
    setNote(`Reading ${file.name} on this phone…`);
    try {
      const bytes = await file.readAll();
      const result = await importBookBytes(file.name, bytes);
      setNote(result.reason);
    } catch {
      setNote("That file could not be read. Nothing was added.");
    } finally {
      setBusy(false);
    }
  }

  async function openZimFile() {
    const file = await pickFile({ accept: ".zim", types: ["application/octet-stream", "*/*"] });
    if (!file.ok) {
      setNote(file.reason);
      return;
    }
    setBusy(true);
    try {
      let readAt = file.readAt;
      if (file.keep) {
        const kept = await file.keep();
        readAt = readerForUri(kept) || readAt;
      }
      const reader = await openZim(readAt, { size: file.size });
      const title = (await reader.metadata("Title")) || file.name;
      zimRef.current = reader;
      setZim({ name: file.name, title, size: file.size, entries: reader.header.entryCount });
      setNote(`${title} is open. Search by article title.`);
    } catch (err) {
      setNote(err?.message || "That ZIM file could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function searchZim() {
    if (!zimRef.current) return;
    try {
      const hits = await zimRef.current.findTitles(zimQuery, 10);
      setZimHits(hits);
      if (!hits.length) setNote("No article title starts with that. ZIM full-text search is not in this build.");
    } catch (err) {
      setNote(err?.message || "Search failed.");
    }
  }

  async function readArticle(entry) {
    try {
      setArticle(await zimRef.current.articleText(entry, 12000));
    } catch (err) {
      setNote(err?.message || "That article could not be read.");
    }
  }

  async function saveArticle() {
    if (!article) return;
    const result = await importParsed({ ok: true, format: "zim", title: `${article.title} (${zim?.title || "Kiwix"})`, text: article.text, bytes: article.text.length });
    setNote(result.reason);
  }

  const books = store?.books || [];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Your books" lead="Import EPUB or TXT books to ask about offline. They are marked as yours and rank below Yehsa's checked notes." />
      <Action label={busy ? "Working…" : "Import a book (EPUB or TXT)"} disabled={busy} onPress={importBook} />
      <Quiet live>{note}</Quiet>
      {progress.running ? <Quiet live>Indexing in the background: {progress.done} of {progress.total} passages.</Quiet> : null}
      {books.length ? <Text style={styles.sub}>Imported</Text> : <Quiet>No books imported yet.</Quiet>}
      {books.map((book) => (
        <View key={book.id} style={styles.book}>
          <Ionicons name="book-outline" size={22} color={colors.brass} />
          <View style={styles.bookBody}>
            <Text style={styles.bookTitle}>{book.title}</Text>
            <Text style={styles.meta}>
              {book.author ? `${book.author} · ` : ""}{book.format.toUpperCase()} · {book.notes} passages · {formatBytes(book.bytes)} · Your import, lower trust
            </Text>
            {confirmDelete === book.id ? (
              <View style={styles.row}>
                <Action label="Delete book" tone="clay" onPress={async () => {
                  await removeBook(book.id);
                  setConfirmDelete(null);
                  setNote(`${book.title} was deleted from this phone.`);
                }} />
                <Action label="Keep" tone="quiet" onPress={() => setConfirmDelete(null)} />
              </View>
            ) : <Action label="Delete" tone="clay" onPress={() => setConfirmDelete(book.id)} />}
          </View>
        </View>
      ))}
      <Text style={styles.sub}>Kiwix library (ZIM)</Text>
      <Quiet>Open a Kiwix .zim file you already have, such as an offline Wikipedia or WikiMed. Search is by article title.</Quiet>
      <Action label="Open ZIM" tone="quiet" disabled={busy} onPress={openZimFile} />
      {zim ? (
        <View style={styles.card}>
          <Text style={styles.bookTitle}>{zim.title}</Text>
          <Text style={styles.meta}>{zim.entries} entries{zim.size ? ` · ${formatBytes(zim.size)}` : ""}</Text>
          <Field label="Article title" value={zimQuery} onChangeText={setZimQuery} placeholder="e.g. Hypothermia" />
          <Action label="Search titles" onPress={searchZim} />
          {zimHits.map((hit) => (
            <Action key={hit.index} label={hit.title} tone="quiet" onPress={() => readArticle(hit)} />
          ))}
          {article ? (
            <View>
              <Text style={styles.bookTitle}>{article.title}</Text>
              <Text selectable style={styles.article}>{article.text.slice(0, 4000).replace(/^# /gm, "")}</Text>
              <Action label="Save to my books" tone="quiet" onPress={saveArticle} />
            </View>
          ) : null}
        </View>
      ) : null}
      {onClose ? <Action label="Back" tone="quiet" onPress={onClose} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxxl },
  sub: { ...type.label, color: colors.muted, marginTop: space.xl, marginBottom: space.sm, textTransform: "uppercase", letterSpacing: 1 },
  book: { flexDirection: "row", paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  bookBody: { flex: 1, marginLeft: space.md },
  bookTitle: { ...type.action, color: colors.ink },
  meta: { ...type.label, color: colors.muted, marginVertical: space.xs },
  row: { flexDirection: "row", gap: space.sm },
  card: { backgroundColor: colors.surface, borderColor: colors.lineStrong, borderWidth: 1, borderRadius: radius.lg, padding: space.lg, marginTop: space.md },
  article: { ...type.quiet, color: colors.ink, marginVertical: space.sm }
});
