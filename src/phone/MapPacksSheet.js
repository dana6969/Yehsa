// The "Map packs" part of Layers and packs: storage, cards, download progress, import, style.
// One storage number counts packs, saved areas and imports together.

import React, { useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { packCards, storageLine, formatBytes } from "../../symbolic/map_packs.js";
import { MAP_STYLES } from "../../symbolic/map_layers.js";
import { areasTotalBytes } from "../../symbolic/area_download.js";
import { Action, Quiet, colors, themedStyles } from "./ui.js";
import { hit, radius, space, type } from "./tokens.js";
import { addPickedFile, describeFile, pickMapFile } from "./map_import";
import { removeInstalled } from "./map_pack_manager";

const GROUP_ORDER = ["On this phone", "Maine", "New England", "Northeast", "More states", "World", "More"];

function Card({ card, onDownload, onCancel, onDiscard, onShow, onRemove, onUpdate }) {
  const [about, setAbout] = useState(false);
  const job = card.job;
  const downloading = job?.state === "downloading" || job?.state === "verifying";
  const paused = job?.state === "paused";
  const fraction = job?.total ? Math.min(1, (job.received || 0) / job.total) : 0;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.name}>{card.name}</Text>
        <Text style={styles.state}>{card.state}</Text>
      </View>
      <Text style={styles.text}>{card.description}</Text>
      {downloading || paused ? (
        <>
          <View
            style={styles.bar}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
          >
            <View style={[styles.barFill, { width: `${Math.round(fraction * 100)}%` }]} />
          </View>
          <Text style={styles.meta}>{job.state === "verifying" ? "Checking the file…" : card.progress}</Text>
        </>
      ) : null}
      <Text style={styles.meta}>{card.meta}</Text>
      {card.updateAvailable ? <Text style={styles.text}>A newer version is ready. Tap Update.</Text> : null}
      {job?.state === "error" ? <Text style={styles.text}>{job.reason || "Couldn't finish this download."}</Text> : null}
      {card.waitingForSignal ? <Text style={styles.meta}>Waiting for a signal. Download when you are back online.</Text> : null}
      <View style={styles.actions}>
        {downloading ? <Action label="Cancel" tone="quiet" style={styles.grow} onPress={onCancel} /> : null}
        {paused ? <Action label="Resume" style={styles.grow} onPress={onDownload} /> : null}
        {paused ? <Action label="Discard" tone="clay" onPress={onDiscard} /> : null}
        {!downloading && !paused && card.canDownload ? <Action label={job?.state === "error" ? "Try again" : "Download"} style={styles.grow} onPress={onDownload} /> : null}
        {card.packId && !downloading && !paused ? <Action label="Show on map" style={styles.grow} onPress={onShow} /> : null}
        {card.packId && card.canUpdate && !downloading && !paused ? <Action label="Update" tone="quiet" onPress={onUpdate} /> : null}
        {card.packId && !downloading && !paused ? <Action label="Remove" tone="clay" onPress={onRemove} /> : null}
      </View>
      <Pressable accessibilityRole="button" onPress={() => setAbout((v) => !v)} accessibilityLabel={`About this data, ${card.name}`}>
        <Text style={styles.link}>About this data</Text>
      </Pressable>
      {about ? <Text style={styles.meta}>{card.about}</Text> : null}
    </View>
  );
}

function Group({ title, cards, open, onToggle, children }) {
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.groupHead}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.groupCount}>{cards.length} · {open ? "Hide" : "Show"}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

export default function MapPacksSheet({
  store,
  setStore,
  areas,
  downloads,
  style,
  onStyle,
  onShowPack,
  onClose
}) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState({ "On this phone": true, Maine: true });
  const importing = useRef(false);
  const cards = useMemo(
    () => packCards(store, downloads.jobs, { native: Platform.OS !== "web" }),
    [store, downloads.jobs]
  );
  const groups = GROUP_ORDER.map((title) => ({ title, cards: cards.filter((card) => card.group === title) })).filter((group) => group.cards.length);
  const total = storageLine(store, areasTotalBytes(areas));

  async function pick() {
    if (importing.current) return;
    setNote("");
    const picked = await pickMapFile();
    if (!picked.ok) {
      // Cancelling the picker is quiet, no alarm.
      setNote(picked.canceled ? "" : picked.reason);
      return;
    }
    const described = await describeFile(picked.file, store);
    if (!described.ok) {
      setNote(described.reason);
      return;
    }
    setPending({ file: picked.file, described });
  }

  async function add() {
    if (!pending || importing.current) return;
    importing.current = true;
    const { file } = pending;
    setBusy("Adding to this phone…");
    try {
      const result = await addPickedFile(file, store, {
        onProgress: (p) => {
          if (p.phase === "read" && p.total) setBusy(`Reading ${Math.round((p.done / p.total) * 100)}%…`);
          else if (p.phase === "copy") setBusy("Copying to this phone…");
        }
      });
      if (result.ok) {
        setStore(result.store);
        setNote(`Added ${result.pack.name} (${formatBytes(result.pack.bytes)}).${result.truncated ? " It was thinned so the map stays smooth." : ""}`);
        setPending({ done: true, pack: result.pack });
        setBusy(null);
        importing.current = false;
        return;
      }
      setNote(result.reason);
    } finally {
      setBusy(null);
      importing.current = false;
    }
    setPending(null);
  }

  return (
    <>
      <Text style={styles.section}>Map packs</Text>
      <Quiet>Offline maps on this phone.</Quiet>
      <Quiet>{total}</Quiet>
      <Text style={styles.label}>Map style</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {MAP_STYLES.map((item) => {
          const selected = item.id === style;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onStyle(item.id)}
              style={[styles.chip, selected && styles.chipOn]}
            >
              {selected ? <Ionicons name="checkmark" size={16} color={colors.brassInk} /> : null}
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Quiet>Night also turns on by itself when your display is in Night mode.</Quiet>
      {groups.map((group) => (
        <Group key={group.title} title={group.title} cards={group.cards} open={Boolean(open[group.title])} onToggle={() => setOpen((cur) => ({ ...cur, [group.title]: !cur[group.title] }))}>
          {group.cards.map((card) => (
            <Card
              key={card.key}
              card={card}
              onDownload={() => downloads.download(card.catalogId)}
              onCancel={() => downloads.cancel(card.catalogId)}
              onDiscard={() => downloads.discard(card.catalogId)}
              onShow={() => {
                const pack = store.packs.find((item) => item.id === card.packId);
                onShowPack(pack?.bounds || card.focus);
              }}
              onUpdate={() => downloads.download(card.catalogId)}
              onRemove={async () => setStore(await removeInstalled(store, card.packId))}
            />
          ))}
        </Group>
      ))}
      {pending && !pending.done ? (
        <View style={styles.card}>
          <Text style={styles.name}>{pending.described.title}</Text>
          <Text style={styles.text}>{pending.described.words} · {pending.described.sizeText}</Text>
          {pending.described.roomText ? <Text style={styles.meta}>{pending.described.roomText} on this phone</Text> : null}
          {busy ? <Text style={styles.meta} accessibilityLiveRegion="polite">{busy}</Text> : null}
          <View style={styles.actions}>
            <Action label="Add to this phone" style={styles.grow} disabled={Boolean(busy)} onPress={add} />
            <Action label="Cancel" tone="quiet" disabled={Boolean(busy)} onPress={() => setPending(null)} />
          </View>
        </View>
      ) : null}
      {pending?.done ? (
        <View style={styles.actions}>
          <Action label="Show on map" style={styles.grow} onPress={() => { onShowPack(pending.pack.bounds); setPending(null); onClose?.(); }} />
          <Action label="Done" tone="quiet" onPress={() => setPending(null)} />
        </View>
      ) : null}
      {note ? <Quiet live>{note}</Quiet> : null}
      <Action label="Import a map file" tone="quiet" disabled={Boolean(busy)} onPress={pick} accessibilityHint="Pick a GeoJSON, GPX, KML or MBTiles file from this phone" />
    </>
  );
}

const styles = themedStyles((c) => ({
  section: { ...type.label, color: c.muted, marginTop: space.lg, textTransform: "uppercase", letterSpacing: 1 },
  label: { ...type.label, color: c.muted, marginTop: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", marginVertical: space.sm },
  chip: { minHeight: hit.min, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: c.lineStrong, marginRight: space.sm, flexDirection: "row", alignItems: "center" },
  chipOn: { backgroundColor: c.brass, borderColor: c.brass },
  chipText: { ...type.label, color: c.ink, marginLeft: 2 },
  chipTextOn: { color: c.brassInk },
  groupHead: { minHeight: hit.min, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.md, borderBottomColor: c.line, borderBottomWidth: 1 },
  groupTitle: { ...type.action, color: c.ink },
  groupCount: { ...type.label, color: c.muted },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 2, borderColor: c.lineStrong, padding: 14, gap: 8, marginTop: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { color: c.ink, fontSize: 16, fontWeight: "600", flex: 1 },
  state: { color: c.ink, fontSize: 12, borderWidth: 1, borderColor: c.lineStrong, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  text: { color: c.ink, fontSize: 15, lineHeight: 21 },
  meta: { color: c.muted, fontSize: 13 },
  bar: { height: 8, borderRadius: 4, backgroundColor: c.line, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: c.brass },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  grow: { flexGrow: 1 },
  link: { color: c.brassText, fontSize: 14, minHeight: 32, paddingTop: 6 }
}));
