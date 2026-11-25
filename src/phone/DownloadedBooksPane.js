// R13: More > Downloaded books (also from More > Library). Each downloaded or imported book with
// its size on disk and a total; remove one, or all, after a confirm. Built-in books are listed as
// Built-in and can't be removed. A removed document can be downloaded again from Ask as before.
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Platform, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatBytes } from "../../symbolic/map_packs.js";
import { loadDownloadedBooks, removeEveryDownloadedBook, removeOneBook } from "./downloaded_books.js";
import { Action, Quiet, ScreenHeader, colors, themedStyles } from "./ui.js";
import { space, type } from "./tokens.js";

function confirm(title, message, yes, onYes) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (typeof window !== "undefined" && window.confirm?.(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: yes, style: "destructive", onPress: onYes }
  ], { cancelable: true });
}

const KIND_LABEL = { document: "Downloaded document", imported: "Imported book", zim: "Kiwix ZIM file" };

export default function DownloadedBooksPane({ onBack, backLabel }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refresh = useCallback(() => loadDownloadedBooks().then(setList).catch(() => setList({ builtIn: [], downloaded: [], totalBytes: 0 })), []);
  useEffect(() => { refresh(); }, [refresh]);

  function removeOne(item) {
    confirm(
      `Remove ${item.title}?`,
      `This deletes it from this phone (${formatBytes(item.bytes)}) and from Ask's search. You can download it again later.`,
      "Remove",
      async () => {
        setBusy(true);
        const got = await removeOneBook(item.id).catch(() => ({ ok: false }));
        setNote(got.ok ? `${item.title} was removed. ${formatBytes(item.bytes)} freed.` : (got.reason || `${item.title} could not be removed.`));
        await refresh();
        setBusy(false);
      }
    );
  }

  function removeAll() {
    const items = list?.downloaded || [];
    if (!items.length) return;
    confirm(
      "Remove all downloaded books?",
      `This deletes ${items.length} ${items.length === 1 ? "book" : "books"} (${formatBytes(list.totalBytes)}) from this phone and from Ask's search. Built-in books stay.`,
      "Remove all",
      async () => {
        setBusy(true);
        const freed = list.totalBytes;
        const got = await removeEveryDownloadedBook(items).catch(() => ({ ok: false, removed: 0, failed: items.map((i) => i.id) }));
        setNote(got.ok ? `Removed ${got.removed}. ${formatBytes(freed)} freed.` : `Removed ${got.removed}; ${got.failed.length} could not be removed.`);
        await refresh();
        setBusy(false);
      }
    );
  }

  const downloaded = list?.downloaded || [];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Downloaded books" lead="Books and documents you downloaded or imported, and the space they take. Remove one to free the space; Ask stops using it." onBack={onBack} backLabel={backLabel} />
      {note ? <Quiet live>{note}</Quiet> : null}
      {!list ? <Quiet>Measuring what is on this phone…</Quiet> : (
        <>
          <Text style={styles.sub}>Downloaded</Text>
          {downloaded.length ? (
            <Text style={styles.total} accessibilityLabel={`Total ${formatBytes(list.totalBytes)} in ${downloaded.length} items`}>
              {`Total: ${formatBytes(list.totalBytes)} · ${downloaded.length} ${downloaded.length === 1 ? "item" : "items"}`}
            </Text>
          ) : <Quiet>Nothing downloaded yet. Documents you save from Ask and books you import show up here.</Quiet>}
          {downloaded.map((item) => (
            <View key={item.id} style={styles.row}>
              <Ionicons name={item.kind === "document" ? "document-text-outline" : "book-outline"} size={22} color={colors.brass} />
              <View style={styles.body}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>{[KIND_LABEL[item.kind], item.detail, formatBytes(item.bytes)].filter(Boolean).join(" · ")}</Text>
                <Action label="Remove" tone="clay" disabled={busy} onPress={() => removeOne(item)} accessibilityHint={`Deletes ${item.title} from this phone after you confirm.`} />
              </View>
            </View>
          ))}
          {downloaded.length ? <Action label="Remove all downloaded books" tone="clay" disabled={busy} onPress={removeAll} accessibilityHint="Asks first. Built-in books stay." /> : null}
          <Text style={styles.sub}>Built-in</Text>
          <Quiet>These ship with Yehsa and can't be removed.</Quiet>
          {(list.builtIn || []).map((item) => (
            <View key={item.id} style={styles.row} accessibilityLabel={`${item.title}, built-in`}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.muted} />
              <View style={styles.body}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>Built-in</Text>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 180 },
  sub: { ...type.label, color: colors.muted, marginTop: space.xl, marginBottom: space.sm, textTransform: "uppercase", letterSpacing: 1 },
  total: { ...type.action, color: colors.ink, marginBottom: space.sm },
  row: { flexDirection: "row", paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  body: { flex: 1, marginLeft: space.md },
  title: { ...type.action, color: colors.ink },
  meta: { ...type.label, color: colors.muted, marginVertical: space.xs }
}));
