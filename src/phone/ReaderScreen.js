// R7 (Dana, Nov 24: "I also want access to read these books"): the full-screen reader.
// Library list, chapter list, full text with page turns, go to page, find in book, text size, and
// your place in every book, kept on this phone. Works offline: every book is already on the phone.
// Text is shown as plain text only; nothing in a book is run or followed.

import VoiceSearchButton from "./VoiceSearchButton.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Action, Quiet, colors, themedStyles } from "./ui.js";
import { useBackLayer } from "./back_layers.js";
import { closeReader, openLibrary, openReader, useReaderState } from "./reader_store.js";
import { libraryEntries, loadBook } from "./library_source.js";
import { chapterAt, emptyReaderPrefs, findPages, loadReaderPrefs, saveReaderPrefs, withPlace, withSize, withoutPlace } from "../../symbolic/library/reader_prefs.js";

let prefsCache = null;

/** R13: forget the saved page of a book removed from the phone. */
export async function forgetReaderPlace(bookId) {
  const prefs = prefsCache || (await loadReaderPrefs(AsyncStorage));
  const next = withoutPlace(prefs, bookId);
  prefsCache = next;
  if (next !== prefs) await saveReaderPrefs(AsyncStorage, next);
}

function usePrefs() {
  const [prefs, setPrefs] = useState(prefsCache || emptyReaderPrefs());
  useEffect(() => {
    let live = true;
    if (!prefsCache) loadReaderPrefs(AsyncStorage).then((p) => { prefsCache = p; if (live) setPrefs(p); });
    return () => { live = false; };
  }, []);
  const update = (fn) => setPrefs((prev) => {
    const next = fn(prev);
    prefsCache = next;
    saveReaderPrefs(AsyncStorage, next);
    return next;
  });
  return [prefs, update];
}

function Highlighted({ text, query, style }) {
  const q = String(query || "").trim();
  if (q.length < 2) return <Text selectable style={style}>{text}</Text>;
  const lower = text.toLowerCase();
  const want = q.toLowerCase();
  const parts = [];
  let at = 0;
  let k = 0;
  for (let i = lower.indexOf(want); i >= 0 && k < 200; i = lower.indexOf(want, i + want.length), k += 1) {
    if (i > at) parts.push(text.slice(at, i));
    parts.push(<Text key={`h${i}`} style={styles.hit}>{text.slice(i, i + want.length)}</Text>);
    at = i + want.length;
  }
  parts.push(text.slice(at));
  return <Text selectable style={style}>{parts}</Text>;
}

function LibraryList({ prefs, onOpen }) {
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    let live = true;
    libraryEntries().then((e) => live && setEntries(e)).catch(() => live && setEntries([]));
    return () => { live = false; };
  }, []);
  if (!entries) return <Quiet>Opening the library...</Quiet>;
  const groups = [];
  for (const e of entries) {
    let g = groups.find((x) => x.name === e.group);
    if (!g) groups.push((g = { name: e.group, items: [] }));
    g.items.push(e);
  }
  return (
    <ScrollView contentContainerStyle={styles.listPad}>
      <Text style={styles.lead}>Everything here is on this phone and opens offline.</Text>
      {groups.map((g) => (
        <View key={g.name} style={styles.group}>
          <Text style={styles.groupTitle}>{`${g.name} (${g.items.length})`}</Text>
          {g.items.map((e) => {
            const place = prefs.places[e.id];
            return (
              <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`Read ${e.title}`} onPress={() => onOpen(e.id)} style={({ pressed }) => [styles.bookRow, pressed && styles.pressed]}>
                <Text style={styles.bookTitle}>{e.title}</Text>
                <Text style={styles.meta}>{[e.author, place ? `Continue at page ${place.page}` : null].filter(Boolean).join(" · ") || "Tap to read"}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      {!groups.some((g) => g.name === "Downloaded documents") ? <Quiet>Documents you download in Ask ("find the USDA canning guide") show up here too.</Quiet> : null}
    </ScrollView>
  );
}

function Contents({ book, page, onPick }) {
  const at = chapterAt(book.chapters, page);
  return (
    <FlatList
      data={book.chapters}
      keyExtractor={(c, i) => `${i}-${c.page}`}
      initialScrollIndex={at > 3 ? at - 2 : 0}
      getItemLayout={(_, i) => ({ length: 56, offset: 56 * i, index: i })}
      renderItem={({ item, index }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, page ${item.page}`} onPress={() => onPick(item.page)} style={({ pressed }) => [styles.tocRow, index === at && styles.tocOn, pressed && styles.pressed]}>
          <Text style={styles.tocTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.meta}>{item.page}</Text>
        </Pressable>
      )}
    />
  );
}

function BookView({ bookId, startPage, prefs, setPrefs, onLibrary }) {
  const [book, setBook] = useState(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState(null); // "contents" | "find" | "goto"
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState(null);
  const [gotoText, setGotoText] = useState("");
  const scroll = useRef(null);

  useEffect(() => {
    let live = true;
    setBook(null);
    setFailed(false);
    loadBook(bookId).then((b) => {
      if (!live) return;
      if (!b) { setFailed(true); return; }
      const saved = prefsCache?.places?.[bookId]?.page;
      const want = startPage || saved || 1;
      setBook(b);
      setPage(Math.max(1, Math.min(b.pages.length, want)));
    });
    return () => { live = false; };
  }, [bookId, startPage]);

  useEffect(() => {
    if (!book) return;
    setPrefs((p) => withPlace(p, bookId, page));
    scroll.current?.scrollTo?.({ y: 0, animated: false });
  }, [book, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useBackLayer(panel != null, () => setPanel(null));

  if (failed) return <View style={styles.listPad}><Quiet live>That book isn't on this phone any more.</Quiet><Action label="Library" onPress={onLibrary} /></View>;
  if (!book) return <View style={styles.listPad}><Quiet live>Opening...</Quiet></View>;

  const total = book.pages.length;
  const chapter = book.chapters[chapterAt(book.chapters, page)];
  const go = (p) => setPage(Math.max(1, Math.min(total, p)));
  const runFind = (spoken) => {
    const words = typeof spoken === "string" ? spoken : query;
    const found = findPages(book.pages, words, page);
    setHits(found);
    if (found.length) go(found[0] === page && found.length > 1 ? found[1] : found[0]);
  };
  const nextHit = () => {
    if (!hits?.length) return;
    const after = hits.find((p) => p > page) || hits[0];
    go(after);
  };
  const size = prefs.size;

  return (
    <View style={styles.flex}>
      <View style={styles.bar}>
        <Text style={styles.bookHead} numberOfLines={1}>{book.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>{chapter ? chapter.title : " "}</Text>
        <View style={styles.row}>
          <Action label="Contents" tone={panel === "contents" ? "brass" : "quiet"} onPress={() => setPanel(panel === "contents" ? null : "contents")} />
          <Action label="Find" tone={panel === "find" ? "brass" : "quiet"} onPress={() => setPanel(panel === "find" ? null : "find")} />
          <Action label="A−" tone="quiet" accessibilityHint="Smaller text" disabled={size <= 14} onPress={() => setPrefs((p) => withSize(p, -1))} />
          <Action label="A+" tone="quiet" accessibilityHint="Larger text" disabled={size >= 28} onPress={() => setPrefs((p) => withSize(p, 1))} />
        </View>
        {panel === "find" ? (
          <View style={styles.findRow}>
            <TextInput accessibilityLabel="Find in this book" value={query} onChangeText={(t) => { setQuery(t); setHits(null); }} onSubmitEditing={() => runFind()} placeholder="Find a word or phrase" placeholderTextColor={colors.muted} style={styles.input} returnKeyType="search" autoFocus />
            <View style={styles.row}>
              <Action label="Search" onPress={() => runFind()} disabled={query.trim().length < 2} />
              <VoiceSearchButton label="Find by voice" onText={(t) => { setQuery(t); setHits(null); }} onDone={(t) => { setQuery(t); runFind(t); }} />
              {hits?.length > 1 ? <Action label="Next match" tone="quiet" onPress={nextHit} /> : null}
              {hits ? <Text style={styles.meta}>{hits.length ? `Found on ${hits.length} ${hits.length === 1 ? "page" : "pages"}` : "Not in this book"}</Text> : null}
            </View>
          </View>
        ) : null}
        {panel === "goto" ? (
          <View style={styles.row}>
            <TextInput accessibilityLabel="Go to page" value={gotoText} onChangeText={setGotoText} keyboardType="number-pad" placeholder={`1 to ${total}`} placeholderTextColor={colors.muted} style={[styles.input, styles.gotoInput]} returnKeyType="go" autoFocus onSubmitEditing={() => { const n = parseInt(gotoText, 10); if (n) go(n); setPanel(null); }} />
            <Action label="Go" onPress={() => { const n = parseInt(gotoText, 10); if (n) go(n); setPanel(null); }} />
          </View>
        ) : null}
      </View>
      {panel === "contents" ? (
        <View style={styles.flex}><Contents book={book} page={page} onPick={(p) => { go(p); setPanel(null); }} /></View>
      ) : (
        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.pagePad}>
          <Highlighted text={book.pages[page - 1] || "(No text on this page. It may be a picture.)"} query={hits?.length ? query : ""} style={[styles.text, { fontSize: size, lineHeight: Math.round(size * 1.5) }]} />
          {page === total && book.source ? <Text style={styles.meta}>{`Source: ${book.source}`}</Text> : null}
        </ScrollView>
      )}
      <View style={styles.footer}>
        <Action label="Previous" tone="quiet" disabled={page <= 1} onPress={() => go(page - 1)} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Page ${page} of ${total}. Tap to go to a page.`} onPress={() => { setGotoText(""); setPanel(panel === "goto" ? null : "goto"); }} style={styles.pageNum}>
          <Text style={styles.pageText}>{`${page} / ${total}`}</Text>
        </Pressable>
        <Action label="Next" tone="quiet" disabled={page >= total} onPress={() => go(page + 1)} />
      </View>
    </View>
  );
}

/** Mounted once at the app root; shows itself when something opens the reader. */
export default function ReaderScreen() {
  const state = useReaderState();
  const [prefs, setPrefs] = usePrefs();
  const fromLibrary = useRef(false);
  useEffect(() => {
    if (state?.library) fromLibrary.current = true;
    if (!state) fromLibrary.current = false;
  }, [state]);
  const back = () => {
    if (state?.bookId && fromLibrary.current) openLibrary();
    else closeReader();
  };
  useBackLayer(state != null, back);
  const key = useMemo(() => (state ? `${state.bookId || "lib"}-${state.at}` : "none"), [state]);
  if (!state) return null;
  return (
    <View style={styles.root} key={key}>
      <View style={styles.top}>
        <Action label={state.bookId && fromLibrary.current ? "Library" : "Close"} tone="quiet" onPress={back} />
        {state.bookId && !fromLibrary.current ? <Action label="Library" tone="quiet" onPress={() => { fromLibrary.current = true; openLibrary(); }} /> : null}
        {state.library ? <Text style={styles.heading}>Library</Text> : null}
        {state.bookId && fromLibrary.current ? <Action label="Close" tone="quiet" onPress={closeReader} /> : null}
      </View>
      {state.library ? (
        <LibraryList prefs={prefs} onOpen={(id) => openReader(id)} />
      ) : (
        <BookView bookId={state.bookId} startPage={state.page} prefs={prefs} setPrefs={setPrefs} onLibrary={() => { fromLibrary.current = true; openLibrary(); }} />
      )}
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.bg, zIndex: 40, elevation: 40, paddingTop: 30 },
  flex: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.line },
  heading: { color: c.ink, fontSize: 20, fontWeight: "700", marginLeft: 6 },
  lead: { color: c.muted, fontSize: 14, lineHeight: 20 },
  listPad: { padding: 16, gap: 12, paddingBottom: 40 },
  group: { gap: 6 },
  groupTitle: { color: c.brassText, fontSize: 14, fontWeight: "700", marginTop: 8 },
  bookRow: { backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.lineStrong, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56, gap: 2 },
  bookTitle: { color: c.ink, fontSize: 16, fontWeight: "600" },
  bookHead: { color: c.ink, fontSize: 16, fontWeight: "700" },
  meta: { color: c.muted, fontSize: 13, lineHeight: 18 },
  bar: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: c.line },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  findRow: { gap: 6 },
  input: { minHeight: 48, color: c.ink, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.lineStrong, paddingHorizontal: 12 },
  gotoInput: { minWidth: 120 },
  pagePad: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 40, gap: 12 },
  text: { color: c.ink },
  hit: { backgroundColor: c.brass, color: c.brassInk },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.line },
  pageNum: { minHeight: 48, minWidth: 96, alignItems: "center", justifyContent: "center" },
  pageText: { color: c.ink, fontSize: 16, fontWeight: "600" },
  tocRow: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.line, gap: 12 },
  tocOn: { backgroundColor: c.surface },
  tocTitle: { color: c.ink, fontSize: 15, flex: 1 },
  pressed: { opacity: 0.7 }
}));
