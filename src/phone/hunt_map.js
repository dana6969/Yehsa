// Everything the Hunt map adds on top of the plain map: the scent cone, marks you place by tap
// or long-press, the Marks sheet, the mark editor, Undo, Clear all, and the Wind sheet.
// LandPane calls useHuntMap() and drops the pieces in; the rules live in symbolic/hunt/.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Action, Field, Quiet, colors, themedStyles, useDisplay } from "./ui.js";
import { Chips } from "./hunt_ui.js";
import { MarkGlyph } from "./hunt_map_ui.js";
import WindSheet from "./WindScreen.js";
import { setHunt, useHunt } from "./hunt_state.js";
import { useBackLayer } from "./back_layers.js";
import { coneView, labelPoint } from "../../symbolic/hunt/cone_view.js";
import {
  KINDS, TEXT, UNDO_MS, addMark, boxAround, clearMarks, kindInfo, marksOf, moveMark, removeMark, undoMove,
  LOG_SIGHTING, loggedFromMark, restoreAll, restoreMark, sightingMarks, sightingPrefill, toSpots, updateMark, whereText
} from "../../symbolic/hunt/marks.js";
import { windLabel } from "../../symbolic/hunt/conditions.js";

const MAX_PINS = 150;

function when(t) {
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function coordText(point) {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}

export function useHuntMap({ on, held, cameraCenter, onFocusBox, onLogSighting }) {
  const hunt = useHunt();
  const [clock, setClock] = useState(() => Date.now());
  const [sheet, setSheet] = useState(null); // null | "wind" | "marks" | "pick" | "edit" | "clear"
  const [pickAt, setPickAt] = useState(null);
  const [editId, setEditId] = useState(null);
  const [moveId, setMoveId] = useState(null);
  const [coneStandId, setConeStandId] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const lastLong = useRef(0);

  // The wind, the forecast hour and the "x min ago" words move on, so the cone is recomputed each minute.
  useEffect(() => {
    if (!on) return undefined;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [on]);

  const myMarks = useMemo(() => marksOf(hunt.spots), [hunt.spots]);
  const logMarks = useMemo(() => sightingMarks(hunt.sightings, myMarks.map((mark) => mark.id)), [hunt.sightings, myMarks]);
  const allMarks = useMemo(() => [...myMarks, ...logMarks], [myMarks, logMarks]);
  const fix = held && Number.isFinite(held.latitude) && Number.isFinite(held.longitude) ? { latitude: held.latitude, longitude: held.longitude } : null;
  const view = useMemo(
    () => coneView({ hunt, fix, marks: allMarks, coneStandId, now: clock }),
    [hunt.wind, hunt.manual, hunt.saved, fix?.latitude, fix?.longitude, allMarks, coneStandId, clock]
  );
  const assessedById = useMemo(() => new Map(view.assessed.map((item) => [item.mark.id, item])), [view]);

  useEffect(() => {
    if (coneStandId && !myMarks.some((mark) => mark.id === coneStandId && mark.kind === "stand")) setConeStandId(null);
  }, [myMarks, coneStandId]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const close = useCallback(() => { setSheet(null); setPickAt(null); setEditId(null); }, []);
  useBackLayer(on && (sheet != null || moveId != null), () => { if (moveId != null) setMoveId(null); else close(); });
  useEffect(() => { if (!on) { close(); setMoveId(null); } }, [on]);

  const say = useCallback((text, actions = []) => {
    clearTimeout(toastTimer.current);
    setToast({ text, actions });
    toastTimer.current = setTimeout(() => setToast(null), UNDO_MS);
  }, []);
  const dismissToast = useCallback(() => { clearTimeout(toastTimer.current); setToast(null); }, []);

  function writeMarks(update) {
    setHunt("spots", (current) => toSpots(update(marksOf(current))));
  }

  function place(kind) {
    if (!pickAt) return;
    const result = addMark(myMarks, { kind, latitude: pickAt.latitude, longitude: pickAt.longitude });
    if (!result.ok) { close(); say(result.reason); return; }
    const mark = result.mark;
    writeMarks(() => result.marks);
    close();
    const actions = [
      { label: "Undo", run: () => writeMarks((list) => removeMark(list, mark.id).marks) },
      { label: "Edit", run: () => { setEditId(mark.id); setSheet("edit"); } }
    ];
    // A new sighting mark offers the Sightings log, filled in with this spot and time.
    if (mark.kind === "sighting" && onLogSighting) actions.unshift({ label: LOG_SIGHTING, run: () => logSighting(mark) });
    say(`${mark.name} added.`, actions);
  }

  function logSighting(mark) {
    const prefill = sightingPrefill(mark);
    if (!prefill || !onLogSighting) return;
    close();
    onLogSighting(prefill);
  }

  function change(id, patch) {
    const result = updateMark(myMarks, id, patch);
    if (result.ok) writeMarks(() => result.marks);
    return result;
  }

  function remove(id) {
    const result = removeMark(myMarks, id);
    if (!result.ok) return;
    writeMarks(() => result.marks);
    if (coneStandId === id) setConeStandId(null);
    close();
    say(`${result.removed.name} removed.`, [
      { label: "Undo", run: () => writeMarks((list) => restoreMark(list, result.removed, result.index)) }
    ]);
  }

  function clearAll() {
    const result = clearMarks(myMarks);
    writeMarks(() => result.marks);
    setConeStandId(null);
    close();
    say(TEXT.allRemoved, [{ label: "Undo", run: () => writeMarks((list) => restoreAll(list, result.removed)) }]);
  }

  // One path for every move: a finger drag (onDragEnd), a tap on the new spot, or Move here.
  // Undo puts the mark back where it was.
  function relocate(point, id = moveId) {
    const mark = myMarks.find((item) => item.id === id);
    setMoveId(null);
    if (!mark) return;
    const result = moveMark(myMarks, mark.id, point);
    if (!result.ok) { say(result.reason); return; }
    writeMarks(() => result.marks);
    say(`${mark.name} moved.`, [
      { label: "Undo", run: () => writeMarks((list) => undoMove(list, mark.id, result.from)) }
    ]);
  }

  function pickAtPoint(point) {
    setEditId(null);
    setPickAt(point);
    setSheet("pick");
  }

  // Map touches. A tap or a long-press drops a mark at that spot. While moving a mark, either one is the new spot.
  function onMapPress(point) {
    if (!on) return;
    if (Date.now() - lastLong.current < 700) return;
    if (moveId != null) { relocate(point); return; }
    if (sheet != null) { close(); return; }
    pickAtPoint(point);
  }
  function onMapLongPress(point) {
    if (!on) return;
    lastLong.current = Date.now();
    // While moving, press-and-hold belongs to dragging the pin, so it never drops the mark.
    if (moveId != null) return;
    pickAtPoint(point);
  }
  function onMarkDragEnd(id, point) {
    if (!on || !point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return;
    relocate(point, id);
  }
  function onMarkPress(id) {
    if (moveId != null) return;
    const mark = allMarks.find((item) => item.id === id);
    if (!mark) return;
    if (mark.fromLog) {
      say("This sighting was logged in Field → Sightings. Edit or delete it there.");
      return;
    }
    setEditId(id);
    setPickAt(null);
    setSheet("edit");
  }

  function addHere() {
    const at = fix || cameraCenter?.() || null;
    if (!at) { close(); say("Tap the map where you want it."); return; }
    pickAtPoint(at);
  }

  function showMark(mark) {
    onFocusBox?.(boxAround(mark));
    setEditId(mark.id);
    setSheet(null);
    setTimeout(() => setEditId((current) => (current === mark.id ? null : current)), 4000);
  }

  const overlay = useMemo(() => {
    const pins = view.assessed.slice(0, MAX_PINS).map(({ mark, state, word }) => ({
      ...mark, state, word, selected: mark.id === editId || mark.id === moveId
    }));
    const at = labelPoint(view);
    return {
      color: colors.brass,
      polygon: on && view.ok ? view.polygon : null,
      label: view.label,
      labelAt: on ? at : null,
      markers: on ? pins : [],
      // The mark being moved is drawn as a draggable pin; the others stay tappable.
      dragId: on ? moveId : null
    };
  }, [view, editId, moveId, on]);

  const editing = editId ? allMarks.find((mark) => mark.id === editId && !mark.fromLog) : null;

  const sheets = on ? (
    <>
      {sheet === "wind" ? (
        <SheetFrame title="Wind" onClose={close}><WindSheet hunt={hunt} view={view} now={clock} /></SheetFrame>
      ) : null}
      {sheet === "marks" ? (
        <SheetFrame title="Marks" onClose={close}>
          <Quiet>{TEXT.intro}</Quiet>
          <View style={styles.row}>
            <Action label="Add a mark" style={styles.grow} onPress={addHere} />
            <Action label="Clear all" tone="clay" style={styles.grow} disabled={myMarks.length === 0} onPress={() => setSheet("clear")} />
          </View>
          {!view.ok && view.message ? <Quiet>{view.message}</Quiet> : <Quiet>{TEXT.riskNote}</Quiet>}
          {allMarks.length === 0 ? <Quiet>Nothing marked yet. Mark a stand, a trail you want to keep your scent off, or bedding, and this list shows which ones the wind puts at risk.</Quiet> : null}
          {view.assessed.map(({ mark, word, state }) => (
            <View key={mark.id} style={styles.card}>
              <View style={styles.cardHead}>
                <MarkGlyph kind={mark.kind} size={26} />
                <Text style={styles.cardName} numberOfLines={1}>{mark.name}</Text>
                {word ? <Text style={[styles.badge, state === "risk" && styles.badgeRisk]}>{state === "risk" ? `! ${word}` : word}</Text> : null}
              </View>
              <Quiet>{kindInfo(mark.kind).label} · {mark.fromLog ? `from Sightings, ${when(mark.createdAt)}` : (view.apex ? whereText(view.apex, mark) || when(mark.createdAt) : when(mark.createdAt))}</Quiet>
              <View style={styles.row}>
                <Action label="Show on map" tone="quiet" onPress={() => showMark(mark)} />
                {!mark.fromLog ? <Action label="Edit" tone="quiet" onPress={() => { setEditId(mark.id); setSheet("edit"); }} /> : null}
              </View>
            </View>
          ))}
        </SheetFrame>
      ) : null}
      {sheet === "pick" && pickAt ? (
        <SheetFrame title="Add a mark" onClose={close}>
          <Quiet>{coordText(pickAt)}</Quiet>
          <View style={styles.row}>
            {KINDS.map((kind) => (
              <Pressable key={kind.id} accessibilityRole="button" accessibilityLabel={`Add ${kind.label}`} onPress={() => place(kind.id)} style={styles.kind}>
                <MarkGlyph kind={kind.id} size={30} />
                <Text style={styles.kindText}>{kind.label}</Text>
              </Pressable>
            ))}
          </View>
          <Action label="Cancel" tone="quiet" onPress={close} />
        </SheetFrame>
      ) : null}
      {sheet === "edit" && editing ? (
        <EditSheet
          key={editing.id}
          mark={editing}
          assessed={assessedById.get(editing.id)}
          apex={view.apex}
          coneFromThis={coneStandId === editing.id}
          hasFix={Boolean(fix)}
          onChange={(patch) => change(editing.id, patch)}
          onClose={close}
          onMove={() => { setMoveId(editing.id); close(); onFocusBox?.(boxAround(editing)); setEditId(editing.id); }}
          onDelete={() => remove(editing.id)}
          onConeFrom={(yes) => setConeStandId(yes ? editing.id : null)}
          logged={Boolean(loggedFromMark(hunt.sightings, editing.id))}
          onLog={onLogSighting ? () => logSighting(editing) : null}
        />
      ) : null}
      {sheet === "clear" ? (
        <SheetFrame title={TEXT.clearTitle} onClose={() => setSheet("marks")} closeLabel="Back">
          <Text style={styles.body}>{TEXT.clearBody}</Text>
          <Action label={TEXT.clearAll} tone="clay" onPress={clearAll} />
          <Action label="Cancel" tone="quiet" onPress={() => setSheet("marks")} />
        </SheetFrame>
      ) : null}
    </>
  ) : null;

  const moving = moveId != null ? myMarks.find((mark) => mark.id === moveId) : null;
  const overlays = on ? (
    <>
      {moving ? (
        <>
          <View pointerEvents="none" style={styles.crosshair} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.crossV} /><View style={styles.crossH} />
          </View>
          <View style={styles.bar} accessibilityLiveRegion="polite">
            <Text style={styles.barText}>Moving {moving.name}. Press and hold the pin, then drag it to the new spot. Or tap the new spot, or pan so the cross sits on it and tap Move here.</Text>
            <View style={styles.row}>
              <Action label="Move here" style={styles.grow} onPress={() => { const c = cameraCenter?.(); if (c) relocate(c); else say("Pan the map first, or tap the new spot."); }} />
              <Action label="Cancel" tone="quiet" onPress={() => setMoveId(null)} />
            </View>
          </View>
        </>
      ) : toast ? (
        <View style={styles.bar} accessibilityLiveRegion="polite">
          <Text style={styles.barText}>{toast.text}</Text>
          <View style={styles.row}>
            {toast.actions.map((action) => (
              <Action key={action.label} label={action.label} tone="quiet" onPress={() => { dismissToast(); action.run(); }} />
            ))}
            <Action label="OK" tone="quiet" onPress={dismissToast} />
          </View>
        </View>
      ) : null}
    </>
  ) : null;

  return {
    view,
    overlay,
    sheets,
    overlays,
    marks: myMarks,
    moving: moveId != null,
    windText: view.wind?.ok ? windLabel(view.wind) : "",
    onMapPress,
    onMapLongPress,
    onMarkPress,
    onMarkDragEnd,
    openWind: () => { setPickAt(null); setEditId(null); setSheet("wind"); },
    openMarks: () => { setPickAt(null); setEditId(null); setSheet("marks"); },
    closeSheets: close,
    anySheet: sheet != null
  };
}

function SheetFrame({ title, onClose, closeLabel = "Close", children }) {
  return (
    <View style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.sheetHead}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
        <Action label={closeLabel} tone="quiet" style={styles.sheetClose} onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </View>
  );
}

function EditSheet({ mark, assessed, apex, coneFromThis, hasFix, onChange, onClose, onMove, onDelete, onConeFrom, logged, onLog }) {
  const display = useDisplay();
  const [name, setName] = useState(mark.name);
  const commit = () => { if (name.trim() && name.trim() !== mark.name) onChange({ name }); else if (!name.trim()) setName(mark.name); };
  const status = assessed?.word ? `${assessed.word} · ${assessed.reason}` : "";
  return (
    <SheetFrame title={mark.name} onClose={() => { commit(); onClose(); }}>
      {status ? <Quiet>{status}</Quiet> : null}
      {apex ? <Quiet>{kindInfo(mark.kind).label} · {whereText(apex, mark)}</Quiet> : <Quiet>{kindInfo(mark.kind).label} · {coordText(mark)}</Quiet>}
      <View style={[styles.card, { borderColor: display.line }]}>
        <Field label="Name" value={name} onChangeText={setName} placeholder={kindInfo(mark.kind).label} />
        <Text style={styles.group}>TYPE</Text>
        <Chips label="Type" value={mark.kind} onChange={(id) => { commit(); onChange({ kind: id }); }} options={KINDS.map((kind) => ({ id: kind.id, label: kind.label }))} />
      </View>
      {mark.kind === "stand" ? (
        coneFromThis
          ? (hasFix ? <Action label="Show the cone from me" tone="quiet" onPress={() => onConeFrom(false)} accessibilityHint="The scent cone starts from you again." /> : null)
          : <Action label="Show the cone from this stand" tone="quiet" onPress={() => onConeFrom(true)} accessibilityHint="Draws the scent cone from this stand instead of from you." />
      ) : null}
      {mark.kind === "sighting" && onLog ? (
        <>
          <Action label={LOG_SIGHTING} tone="quiet" onPress={() => { commit(); onLog(); }} accessibilityHint="Opens the Sightings log with this spot and the time you marked it." />
          {logged ? <Quiet>Already in your Sightings log. Logging again adds another entry.</Quiet> : null}
        </>
      ) : null}
      <Action label="Move on the map" tone="quiet" onPress={() => { commit(); onMove(); }} />
      <Action label="Delete" tone="clay" onPress={onDelete} />
    </SheetFrame>
  );
}

const styles = themedStyles((c) => ({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "78%", backgroundColor: c.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: c.lineStrong, zIndex: 20, elevation: 20 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.line },
  sheetTitle: { color: c.ink, fontSize: 18, fontWeight: "600", flexShrink: 1 },
  sheetClose: { marginBottom: 0 },
  sheetScroll: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  grow: { flexGrow: 1 },
  body: { color: c.ink, fontSize: 16, lineHeight: 23 },
  card: { borderWidth: 1, borderColor: c.lineStrong, borderRadius: 14, backgroundColor: c.surface, padding: 12, gap: 6 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardName: { color: c.ink, fontSize: 17, fontWeight: "700", flex: 1 },
  badge: { color: c.ink, fontSize: 12, fontWeight: "700", borderWidth: 1, borderColor: c.lineStrong, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeRisk: { borderColor: c.clay, borderWidth: 2 },
  group: { color: c.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 6 },
  kind: { flexGrow: 1, minWidth: 72, minHeight: 72, alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: c.lineStrong, borderRadius: 14, backgroundColor: c.surface, padding: 8 },
  kindText: { color: c.ink, fontWeight: "700", fontSize: 14 },
  bar: { position: "absolute", left: 8, right: 8, bottom: 8, zIndex: 15, backgroundColor: c.bg, borderWidth: 1, borderColor: c.brass, borderRadius: 14, padding: 10, gap: 8 },
  barText: { color: c.ink, fontSize: 15, lineHeight: 21 },
  crosshair: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", zIndex: 12 },
  crossV: { position: "absolute", width: 3, height: 34, backgroundColor: c.brass },
  crossH: { position: "absolute", width: 34, height: 3, backgroundColor: c.brass }
}));
