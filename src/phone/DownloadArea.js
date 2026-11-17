// "Download this area": one tap for terrain and elevation around you or the visible map.
// Shows the size first, resumes after a dropped signal, keeps everything on the phone.
// No road or street layer is offered.

import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  RADIUS_CHOICES_KM,
  checkRoom,
  areaBytes,
  areasTotalBytes,
  jobProgress,
  pauseJob,
  planArea,
  resumeJob,
  runJob,
  startJob
} from "../../symbolic/area_download.js";
import { formatBytes } from "../../symbolic/map_packs.js";
import { freeBytes, saveAreas, saveTile, storageNote } from "./area_store";
import { Action, Quiet, colors, themedStyles } from "./ui.js";
import { hit, radius, space, type } from "./tokens.js";

function planFor(choice, center, box) {
  if (choice === "visible" && box) return planArea({ box, name: "Visible map area" });
  const km = Number(choice) || 10;
  return planArea({ around: { ...(center || {}), radiusKm: km }, name: `${km} km around ${center ? `${center.latitude.toFixed(3)}, ${center.longitude.toFixed(3)}` : "here"}` });
}

export default function DownloadArea({ center, visibleBox, areas, listRef, onCommit, drawing, pending, onRemove, onUndo, fetchImpl, onShow }) {
  const [choice, setChoice] = useState(visibleBox ? "visible" : 10);
  const [active, setActive] = useState(null);
  const [note, setNote] = useState(null);
  const abort = useRef(null);
  const live = useRef(true);
  const plan = planFor(choice, center, visibleBox);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // Downloads keep going if the sheet closes, because the Map screen owns the job.
  async function run(job, forPlan) {
    const controller = new AbortController();
    abort.current = controller;
    setActive(job);
    const upsert = (next) => [...listRef.current.filter((area) => area.id !== next.id), next];
    await onCommit(upsert(job));
    let last = 0;
    const result = await runJob({
      plan: forPlan,
      job,
      fetchImpl: fetchImpl || globalThis.fetch,
      saveTile,
      signal: controller.signal,
      onProgress: (next) => {
        if (live.current) setActive(next);
        if (Date.now() - last > 1500) {
          last = Date.now();
          saveAreas(upsert(next)).catch(() => {});
        }
      }
    });
    if (live.current) setActive(result.job);
    // A fresh set of tiles needs drawing again.
    await onCommit(upsert({ ...result.job, rendered: false }));
    if (live.current) setNote(jobProgress(result.job).text);
  }

  async function download() {
    const free = await freeBytes();
    const used = areasTotalBytes(listRef.current);
    const room = checkRoom(plan, { usedBytes: used, freeBytes: free });
    if (!room.ok) {
      setNote(room.reason);
      return;
    }
    const started = startJob(plan, { approved: true });
    if (!started.ok) {
      setNote(started.reason);
      return;
    }
    const existing = listRef.current.find((area) => area.id === started.job.id);
    await run(existing ? { ...existing, status: "downloading", failed: [], rendered: false } : started.job, plan);
  }

  function pause() {
    abort.current?.abort();
    if (active) setActive(pauseJob(active));
  }

  async function resume(area) {
    const resumed = resumeJob(area);
    if (!resumed.ok) {
      setNote(resumed.reason);
      return;
    }
    const again = planArea({ box: area.box, zooms: area.zooms, layers: area.layers, name: area.name });
    await run({ ...resumed.job, id: area.id }, { ...again, id: area.id, tiles: again.tiles });
  }

  async function remove(area) {
    if (active?.id === area.id) abort.current?.abort();
    setNote(null);
    await onRemove(area, shortName(area));
  }

  const busy = active?.status === "downloading";
  const choices = [...(visibleBox ? ["visible"] : []), ...RADIUS_CHOICES_KM];

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="download-outline" size={22} color={colors.brass} />
        <Text accessibilityRole="header" style={styles.title}>Download this area</Text>
      </View>
      <Text style={styles.lead}>Terrain, hills and contour lines for offline use. No roads or streets.</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {choices.map((item) => {
          const selected = item === choice;
          const label = item === "visible" ? "Visible map" : `${item} km`;
          return (
            <Pressable
              key={String(item)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              onPress={() => setChoice(item)}
              style={[styles.chip, selected && styles.chipOn]}
            >
              {selected ? <Ionicons name="checkmark" size={16} color={colors.brassInk} /> : null}
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Quiet>{plan.ok ? plan.sizeText : plan.reason}</Quiet>
      {busy ? (
        <>
          <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: active.total, now: active.done.length }}>
            <View style={[styles.barFill, { width: `${Math.round(jobProgress(active).fraction * 100)}%` }]} />
          </View>
          <Quiet live>{jobProgress(active).text}</Quiet>
          <Action label="Pause" tone="quiet" onPress={pause} />
        </>
      ) : (
        <Action
          label={plan.ok ? `Download (${formatBytes(plan.bytes)})` : "Download"}
          disabled={!plan.ok}
          onPress={download}
          accessibilityHint="Downloads terrain tiles for this area and keeps them on this phone"
        />
      )}
      {note ? <Quiet live>{note}</Quiet> : null}
      <Quiet>{storageNote}</Quiet>
      {areas.length ? <Text style={styles.sub}>Saved areas</Text> : null}
      {areas.map((area) => {
        const isActive = active?.id === area.id && busy;
        const drawn = drawing?.id === area.id;
        const progress = drawn
          ? jobProgress({ ...area, status: "rendering", renderDone: drawing.done, renderTotal: drawing.total })
          : jobProgress(isActive ? active : area);
        const done = area.status === "complete" && area.rendered === true;
        return (
          <View key={area.id} style={styles.area}>
            <Ionicons name={done ? "checkmark-circle" : "time-outline"} size={20} color={done ? colors.success : colors.warning} />
            <View style={styles.areaBody}>
              <Text style={styles.areaName}>{area.name}</Text>
              <Text style={styles.areaMeta}>{done ? `Ready. ${formatBytes(areaBytes(area))}. ` : ""}{done ? "" : `${progress.text} `}{area.attribution}</Text>
              <View style={styles.areaActions}>
                {done && onShow ? <Action label="Show on map" tone="quiet" onPress={() => onShow(area.box)} /> : null}
                {area.status !== "complete" && !isActive && !drawn ? <Action label="Resume" tone="quiet" onPress={() => resume(area)} disabled={busy} /> : null}
                <Action label="Delete" tone="clay" onPress={() => remove(area)} />
              </View>
            </View>
          </View>
        );
      })}
      {pending ? (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <Text style={styles.toastText}>{pending.text}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Undo remove" onPress={onUndo} style={styles.toastUndo}>
            <Text style={styles.toastUndoText}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// "50 km area" from "50 km around 44.514, -69.807", so the toast stays short.
export function shortName(area) {
  const m = String(area?.name || "").match(/^(\d+ km)/);
  return m ? `${m[1]} area` : (area?.name || "Area");
}

const styles = themedStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    marginVertical: space.md
  },
  titleRow: { flexDirection: "row", alignItems: "center" },
  title: { ...type.action, color: colors.ink, marginLeft: space.sm, fontSize: 18 },
  lead: { ...type.quiet, color: colors.muted, marginTop: space.xs, marginBottom: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: space.sm },
  chip: {
    minHeight: hit.min,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    marginRight: space.sm,
    marginBottom: space.sm,
    flexDirection: "row",
    alignItems: "center"
  },
  chipOn: { backgroundColor: colors.brass, borderColor: colors.brass },
  chipText: { ...type.label, color: colors.ink, marginLeft: 2 },
  chipTextOn: { color: colors.brassInk },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: colors.line, overflow: "hidden", marginVertical: space.sm },
  barFill: { height: 8, backgroundColor: colors.brass },
  sub: { ...type.label, color: colors.muted, marginTop: space.lg, textTransform: "uppercase", letterSpacing: 1 },
  area: { flexDirection: "row", paddingVertical: space.md, borderBottomColor: colors.line, borderBottomWidth: 1 },
  areaBody: { flex: 1, marginLeft: space.sm },
  areaName: { ...type.action, color: colors.ink },
  areaMeta: { ...type.label, color: colors.muted, marginTop: 2 },
  areaActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  toast: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceRaised || colors.line, borderColor: colors.lineStrong, borderWidth: 1, borderRadius: radius.lg, paddingLeft: space.lg, marginTop: space.md },
  toastText: { ...type.label, color: colors.ink, flex: 1, paddingVertical: space.md },
  toastUndo: { minHeight: hit.min, minWidth: hit.min, paddingHorizontal: space.lg, alignItems: "center", justifyContent: "center" },
  toastUndoText: { ...type.action, color: colors.brassText }
}));
