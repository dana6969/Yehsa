// Documents on screen: the search results card in Ask (title, site, size, date, link, Download),
// and the Documents section under Me, Learned (read, rename, delete, re-index). Reading opens the
// full reader (ReaderScreen.js).
// Document text is shown as plain text only. Nothing in a document is run, rendered as HTML, or
// followed; links open only when the person taps them.

import React, { useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import { Action, Quiet, colors, themedStyles } from "./ui.js";
import { documents, useDocuments } from "./documents.js";
import { openReader } from "./reader_store.js";

function stepText(step, title) {
  if (!step) return null;
  if (step.phase === "download") return `Downloading "${title}"...`;
  if (step.phase === "read") return step.total ? `Reading page ${step.done} of ${step.total}...` : "Reading it on this phone...";
  if (step.phase === "saved") return "Saved. Building the meaning index in the background...";
  return null;
}

function sizeWord(bytes) {
  if (!bytes) return "";
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function candidates(found) {
  return found?.candidates?.length || 0;
}

/** Under "find the ... PDF": the candidates, each with its link and a Download button. */
export function DocumentResults({ found, onSaved }) {
  const [busy, setBusy] = useState(null);
  const [step, setStep] = useState(null);
  const [done, setDone] = useState({});
  const [msg, setMsg] = useState(null);
  if (!found?.candidates?.length) return null;

  async function get(candidate) {
    setBusy(candidate.id);
    setMsg(null);
    const result = await documents.download(candidate, { onStep: setStep }).catch(() => ({ ok: false, reason: "Something went wrong reading that file. Nothing was kept." }));
    setBusy(null);
    setStep(null);
    if (!result.ok) {
      setMsg(candidates(found) > 1 ? `${result.reason} You can try another link above.` : result.reason);
      return;
    }
    const meta = result.meta;
    const line = result.already
      ? `"${meta.title}" is already on this phone.`
      : `Saved "${meta.title}" on this phone: ${meta.pageCount} ${meta.pageKind === "page" ? "pages" : "parts"}, sealed. Ask me about it any time, even offline. It's under Me, Learned, Documents.`;
    setDone((prev) => ({ ...prev, [candidate.id]: { line, id: meta.id } }));
    onSaved?.(line, meta);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Documents I found. Nothing downloads until you tap one.</Text>
      {found.candidates.map((c) => (
        <View key={c.id} style={styles.item}>
          <Text style={styles.title}>{c.title}</Text>
          <Text style={styles.meta}>{c.line}</Text>
          {c.pageUrl ? <Quiet>File from the catalog page {c.pageUrl}</Quiet> : null}
          <Pressable accessibilityRole="link" accessibilityLabel={`Open link to ${c.site}`} onPress={() => Linking.openURL(c.url).catch(() => {})}>
            <Text style={styles.link} numberOfLines={2}>{c.url}</Text>
          </Pressable>
          {done[c.id] ? (
            <View style={styles.row}>
              <Quiet live>{done[c.id].line}</Quiet>
              <Action label="Read it" tone="quiet" onPress={() => openReader(`doc:${done[c.id].id}`)} />
            </View>
          ) : c.downloadable === false ? (
            <View style={styles.row}>
              <Action label="Open in browser" tone="quiet" onPress={() => Linking.openURL(c.url).catch(() => {})} accessibilityHint="This is a library web page, not a file. It opens in your browser; nothing is saved." />
            </View>
          ) : c.tooBig ? (
            <Quiet>Over 50 MB, so I won't download it.</Quiet>
          ) : (
            <View style={styles.row}>
              <Action label={busy === c.id ? "Working..." : "Download"} disabled={busy != null} onPress={() => get(c)} accessibilityHint="Downloads this document, reads it on the phone, and keeps its text sealed so Ask can answer from it offline." />
            </View>
          )}
          {busy === c.id && step ? <Quiet live>{stepText(step, c.title)}</Quiet> : null}
        </View>
      ))}
      {msg ? <Quiet live>{msg}</Quiet> : null}
      {found.disclosure ? <Text style={styles.meta}>{found.disclosure}</Text> : null}
    </View>
  );
}

/** Me, Learned, Documents: everything downloaded, with view, rename, delete and re-index. */
export function DocumentsSection() {
  const snap = useDocuments();
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [msg, setMsg] = useState(null);
  const docs = snap.catalog?.docs || [];

  if (snap.foreign) {
    return (
      <View style={styles.section}>
        <Text style={styles.heading}>Documents</Text>
        <Quiet>These documents were sealed on another phone and can't be opened here.</Quiet>
        <Action label="Start fresh" tone="clay" onPress={() => documents.clearForeign()} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{`Documents (${docs.length})`}</Text>
      <Text style={styles.meta}>Files you asked me to download, like "download FM 21-76" or "find the Maine hunting regulations PDF". Their text is sealed on this phone, and Ask quotes them with the page, offline.</Text>
      {docs.length === 0 ? <Quiet>None yet. In Ask, try "find the USDA canning guide".</Quiet> : null}
      {docs.map((doc) => {
        const job = snap.indexing?.[doc.id];
        return (
          <View key={doc.id} style={styles.card}>
            {renaming === doc.id ? (
              <TextInput accessibilityLabel="New name" value={draft} onChangeText={setDraft} style={styles.input} autoFocus />
            ) : (
              <Text style={styles.title}>{doc.title}</Text>
            )}
            <Text style={styles.meta}>{[
              `${doc.format === "pdf" ? "PDF" : doc.format === "epub" ? "EPUB" : doc.format === "html" ? "Web page" : "Text"}`,
              doc.site,
              `${doc.pageCount} ${doc.pageKind === "page" ? "pages" : "parts"}`,
              sizeWord(doc.bytes),
              doc.fetchedAt ? `downloaded ${new Date(doc.fetchedAt).toLocaleDateString()}` : null,
              job ? (job.phase === "meaning" ? `indexing meaning ${job.done}/${job.total}` : "re-indexing") : doc.indexedModel ? "meaning index ready" : "words index"
            ].filter(Boolean).join(" · ")}</Text>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(doc.url).catch(() => {})}>
              <Text style={styles.link} numberOfLines={1}>{doc.url}</Text>
            </Pressable>
            {renaming === doc.id ? (
              <View style={styles.row}>
                <Action label="Save" onPress={async () => { const r = await documents.rename(doc.id, draft); setMsg(r.ok ? "Renamed." : r.reason); setRenaming(null); }} />
                <Action label="Cancel" tone="quiet" onPress={() => setRenaming(null)} />
              </View>
            ) : confirm === doc.id ? (
              <View style={styles.row}>
                <Text style={styles.body}>Delete it from this phone?</Text>
                <Action label="Delete" tone="clay" onPress={async () => { await documents.remove(doc.id); setConfirm(null); setMsg("Deleted from this phone."); }} />
                <Action label="Cancel" tone="quiet" onPress={() => setConfirm(null)} />
              </View>
            ) : (
              <View style={styles.row}>
                <Action label="Read" onPress={() => openReader(`doc:${doc.id}`)} accessibilityHint="Opens it in the reader, at the page you left off." />
                <Action label="Rename" tone="quiet" onPress={() => { setRenaming(doc.id); setDraft(doc.title); }} />
                <Action label="Re-index" tone="quiet" disabled={!!job} onPress={async () => { const r = await documents.reindex(doc.id); setMsg(r.ok ? `Re-indexed: ${r.sections} sections.` : r.reason); }} />
                <Action label="Delete" tone="clay" onPress={() => setConfirm(doc.id)} />
              </View>
            )}
          </View>
        );
      })}
      {msg ? <Quiet live>{msg}</Quiet> : null}
    </View>
  );
}

const styles = themedStyles((c) => ({
  section: { gap: 10, marginTop: 8 },
  heading: { color: c.ink, fontSize: 18, fontWeight: "700" },
  card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 2, borderColor: c.lineStrong, padding: 14, gap: 8 },
  item: { gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.lineStrong },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  kicker: { color: c.brassText, fontSize: 13, fontWeight: "700" },
  title: { color: c.ink, fontSize: 16, fontWeight: "600" },
  body: { color: c.ink, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  meta: { color: c.muted, fontSize: 13, lineHeight: 18 },
  link: { color: c.brassText, fontSize: 13, lineHeight: 18, minHeight: 32 },
  page: { maxHeight: 420 },
  input: { minHeight: 48, color: c.ink, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.lineStrong, paddingHorizontal: 12 }
}));
