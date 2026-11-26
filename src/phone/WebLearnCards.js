// Look it up, on screen: the offer under a miss, the review card (Keep or Toss), and the Learned
// screen's web section (saved questions, answers waiting for review, kept notes to edit or delete).
// Nothing a card shows is used as an answer until the person taps Keep.

import React, { useState } from "react";
import { Linking, Pressable, Switch, Text, TextInput, View } from "react-native";
import { citationLines } from "../../symbolic/web/answer_builder.js";
import { MISS_OFFER } from "../../symbolic/web/lookup_queue.js";
import { adviceWarning, approved, dateWord, keptUnverified, labelFor, learnedTag, waiting } from "../../symbolic/web/web_notes.js";
import { Action, Quiet, themedStyles } from "./ui.js";
import { useWebLearn, webLearn } from "./web_learn.js";

export { MISS_OFFER };

function Citations({ note }) {
  const items = [...(note.citations || []), ...(note.links || [])];
  if (!items.length) return null;
  const lines = citationLines(note);
  return (
    <View style={styles.cites}>
      {items.map((item, i) => (
        <Pressable key={`${item.n}-${item.url}`} accessibilityRole="link" accessibilityLabel={`Source ${item.n}: ${item.sourceName}`} onPress={() => Linking.openURL(item.url).catch(() => {})}>
          <Text style={styles.cite}>{lines[i]}</Text>
        </Pressable>
      ))}
      {note.citations?.some((c) => c.sourceId === "wikipedia") ? (
        <Text style={styles.meta}>Wikipedia text is CC BY-SA 4.0, excerpted word for word. Authors are in each page's history.</Text>
      ) : null}
    </View>
  );
}

/** Under a miss in Ask: "I don't have that yet. Save it to look up next time you're online?" */
export function LookupOffer({ question, done, onSaved, onLookUpNow, live }) {
  const [busy, setBusy] = useState(false);
  if (done) return <Quiet>{done}</Quiet>;
  return (
    <View style={styles.row}>
      <Action label="Save it" onPress={() => {
        setBusy(true);
        webLearn.saveForLater(question).then((result) => onSaved?.(result.ok
          ? (result.already ? "It's already in Look it up later." : "Saved to Look it up later, on this phone only. Tap Fetch under Me, Learned when you're online.")
          : result.reason)).finally(() => setBusy(false));
      }} disabled={busy} />
      {live ? <Action label="Look it up now" tone="quiet" onPress={() => onLookUpNow?.(question)} disabled={busy} /> : null}
      <Action label="No thanks" tone="quiet" onPress={() => onSaved?.("Okay. Nothing was saved.")} />
    </View>
  );
}

/** The chat line above a live answer: where it came from and when. The quote and links follow in the card. */
export function liveAnswerText(note) {
  const when = dateWord(note?.fetchedAt, { year: true });
  const advice = note?.locked === "legal" || note?.locked === "medical" ? ` ${adviceWarning(note.locked)}` : "";
  return `Here is what I found online${when ? `, ${when}` : ""}. These are quotes, word for word, with links to each source. Tap a source to read the whole page.${advice}`;
}

function disclosureText(sent) {
  if (!sent) return null;
  // A full sentence from look_up.js disclosureLine(), or the bare words from an older saved review.
  return /left this phone|Nothing left/.test(sent)
    ? sent
    : `Only the words "${sent}" left this phone, to a web search and Wikipedia's search. Result pages were read by their own address.`;
}

/** A fetched answer waiting for review. */
export function AnswerReview({ note, sent, onDone }) {
  const [busy, setBusy] = useState(false);
  if (!note) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{`From the internet${note.fetchedAt ? `, ${dateWord(note.fetchedAt, { year: true })}` : ""}. Keep it to use it offline later.`}</Text>
      {note.question ? <Text style={styles.title}>{note.question}</Text> : null}
      <Text style={styles.body}>{note.text}</Text>
      {note.locked ? (
        <Text style={styles.warn}>{note.locked === "dosing"
          ? "This mentions a dose. If you keep it, it stays marked unverified. Do not use it for a dose."
          : note.locked === "legal" || note.locked === "medical"
            ? `${adviceWarning(note.locked)} If you keep it, it stays marked unverified.`
            : "This makes a claim about eating or poison. If you keep it, it stays marked unverified."}</Text>
      ) : null}
      <Citations note={note} />
      {sent ? <Text style={styles.meta}>{disclosureText(sent)}</Text> : null}
      <View style={styles.row}>
        <Action label="Keep" disabled={busy} onPress={() => {
          setBusy(true);
          webLearn.keepAnswer(note.id).then((result) => onDone?.(result.ok
            ? `Kept. ${learnedTag(result.note || note)}. I'll answer this offline from now on.`
            : result.reason)).finally(() => setBusy(false));
        }} />
        <Action label="Toss" tone="clay" disabled={busy} onPress={() => {
          setBusy(true);
          webLearn.tossAnswer(note.id).then(() => onDone?.("Tossed. Nothing was kept.")).finally(() => setBusy(false));
        }} />
      </View>
    </View>
  );
}

function KeptNote({ note }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{note.question || note.title}</Text>
      <Text style={styles.meta}>{labelFor(note)}</Text>
      {editing ? (
        <TextInput accessibilityLabel="Edit learned note" value={draft} onChangeText={setDraft} multiline style={styles.input} />
      ) : (
        <Text numberOfLines={8} style={styles.body}>{note.text}</Text>
      )}
      <Citations note={note} />
      {editing ? (
        <View style={styles.row}>
          <Action label="Save" onPress={() => webLearn.edit(note.id, { text: draft }).then((r) => { setMsg(r.ok ? "Saved. The source tag stays, marked edited by you." : r.reason); setEditing(false); })} />
          <Action label="Cancel" tone="quiet" onPress={() => { setDraft(note.text); setEditing(false); }} />
        </View>
      ) : confirm ? (
        <View style={styles.row}>
          <Text style={styles.body}>Delete this learned note?</Text>
          <Action label="Delete" tone="clay" onPress={() => webLearn.remove(note.id)} />
          <Action label="Cancel" tone="quiet" onPress={() => setConfirm(false)} />
        </View>
      ) : (
        <View style={styles.row}>
          <Action label="Edit" tone="quiet" onPress={() => { setDraft(note.text); setEditing(true); }} />
          <Action label="Delete" tone="clay" onPress={() => setConfirm(true)} />
        </View>
      )}
      {msg ? <Quiet>{msg}</Quiet> : null}
    </View>
  );
}

/** The web part of the Learned screen. Separate from the field notes and from notes you wrote. */
export function WebLearnedSection({ homeState = null }) {
  const snap = useWebLearn();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState("");
  const [lastSent, setLastSent] = useState({});
  const store = snap.store;
  const queue = store.queue || [];
  const review = waiting(store).filter((note) => note.origin === "lookup");
  const kept = [...approved(store), ...keptUnverified(store)];

  async function fetchOne(item) {
    setBusy(item.id);
    const result = await webLearn.fetchQueued(item, { homeState });
    setBusy(null);
    if (result.ok) {
      setLastSent((prev) => ({ ...prev, [result.note.id]: result.disclosure || result.sent }));
      setMsg(result.offline ? "No internet, so this comes from the Army manuals on this phone only. Review it below." : "Answer ready. Review it below.");
    } else {
      setMsg(result.reason);
    }
  }

  async function fetchAll() {
    for (const item of queue) {
      // One at a time, so a lost connection stops quietly and the rest stay saved.
      // eslint-disable-next-line no-await-in-loop
      await fetchOne(item);
    }
  }

  if (snap.foreign) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Learned from the web</Text>
        <Quiet>These notes were sealed on another phone and can't be opened here.</Quiet>
        <Action label="Start fresh" tone="clay" onPress={() => webLearn.clearForeign()} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Learned from the web</Text>
      <Text style={styles.meta}>Kept apart from Yehsa's field notes. Each one was looked up when you asked, and kept only after you reviewed it.</Text>
      <View style={styles.switchRow}>
        <Text style={styles.body}>Look up live questions when I'm online</Text>
        <Switch accessibilityLabel="Look up live questions when I'm online" value={store.enabled === true} onValueChange={(on) => webLearn.setEnabled(on)} />
      </View>
      <Text style={styles.meta}>Reads only: ATP 3-50.21 and ATP 4-02.11 (on this phone), CDC, NWS, USDA, USFWS, NPS, USFS, and Wikipedia. State wildlife pages are links only.</Text>

      <Text style={styles.subheading}>{`Look it up later (${queue.length})`}</Text>
      {queue.length === 0 ? <Quiet>When I don't know something, tap Save it and it waits here.</Quiet> : null}
      {queue.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.title}>{item.question}</Text>
          <Text style={styles.meta}>{`Would send only: "${item.query}"`}{item.lastResult ? `\nLast try: ${item.lastResult}` : ""}</Text>
          <View style={styles.row}>
            <Action label={busy === item.id ? "Looking..." : "Fetch"} disabled={busy != null} onPress={() => fetchOne(item)} />
            <Action label="Remove" tone="quiet" disabled={busy != null} onPress={() => webLearn.removeQueued(item.id)} />
          </View>
        </View>
      ))}
      {queue.length > 1 ? <Action label="Fetch all" tone="quiet" disabled={busy != null} onPress={fetchAll} /> : null}
      {msg ? <Quiet live>{msg}</Quiet> : null}

      {review.length ? <Text style={styles.subheading}>{`Waiting for your review (${review.length})`}</Text> : null}
      {review.map((note) => <AnswerReview key={note.id} note={note} sent={lastSent[note.id]} onDone={setMsg} />)}

      <Text style={styles.subheading}>{`Kept (${kept.length})`}</Text>
      {kept.length === 0 ? <Quiet>Nothing kept yet.</Quiet> : null}
      {kept.map((note) => <KeptNote key={note.id} note={note} />)}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  section: { gap: 10, marginTop: 8 },
  heading: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  subheading: { color: colors.ink, fontSize: 15, fontWeight: "700", marginTop: 6 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 2, borderColor: colors.lineStrong, padding: 14, gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 48 },
  kicker: { color: colors.brassText, fontSize: 13, fontWeight: "700" },
  title: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  warn: { color: colors.clay || colors.ink, fontSize: 14, fontWeight: "600" },
  cites: { gap: 4 },
  cite: { color: colors.brassText, fontSize: 13, lineHeight: 18, minHeight: 32 },
  input: { minHeight: 110, color: colors.ink, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong, padding: 10 }
}));
