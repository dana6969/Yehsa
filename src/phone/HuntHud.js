// The Hunt view's three cards: Legal light, Wind, Deer. Each one is real and tappable.
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Action, Quiet, themedStyles, useDisplay, colors } from "./ui.js";
import { Chips, Line, SourceTag } from "./hunt_ui.js";
import { setHunt, useHunt } from "./hunt_state.js";
import { conditionsFor, hudCards } from "../../symbolic/hunt/conditions.js";
import { SPECIES, STATES } from "../../symbolic/hunt/legal_light.js";
import { DISCLAIMER } from "../../symbolic/hunt/deer_estimate.js";

export default function HuntHud({ position, onOpenTool }) {
  const hunt = useHunt();
  const display = useDisplay();
  const [open, setOpen] = useState("");
  const cond = conditionsFor(hunt, { position, now: Date.now(), offsetMinutes: -new Date().getTimezoneOffset() });
  const cards = hudCards(cond);
  const light = cond.light;
  const est = cond.estimate;
  const toggle = (id) => setOpen((current) => (current === id ? "" : id));
  return (
    <View style={styles.hud} accessibilityLabel="Hunt view">
      <View style={styles.row}>
        <HudCard label="Legal light" value={cards.legal.value} sub={cards.legal.sub} onPress={() => toggle("legal")} active={open === "legal"} />
        <HudCard label="Wind" value={cards.wind.value} sub={cards.wind.sub} onPress={() => onOpenTool?.("wind")} />
        <HudCard label="Deer" value={cards.deer.value} sub={cards.deer.sub} onPress={() => toggle("deer")} active={open === "deer"} />
      </View>
      {open === "legal" ? (
        <ScrollView style={[styles.sheet, { borderColor: display.line }]} nestedScrollEnabled>
          {light?.ok ? (
            <>
              <Line label="Sunrise" value={light.sunriseText} />
              <Line label="Sunset" value={light.sunsetText} />
              <Line label="Legal light" value={light.summary} strong />
              <Quiet>{light.label} {light.basis}</Quiet>
            </>
          ) : <Quiet>{light?.text || "Need a location to estimate legal light."}</Quiet>}
          <Text style={styles.group}>STATE</Text>
          <Chips label="State" value={hunt.legal.state} onChange={(id) => setHunt("legal", (current) => ({ ...current, state: current.state === id ? "" : id }))} options={STATES.map((state) => ({ id: state.code, label: state.code }))} />
          <Text style={styles.group}>WHAT YOU HUNT</Text>
          <Chips label="Species" value={hunt.legal.species} onChange={(id) => setHunt("legal", (current) => ({ ...current, species: id }))} options={SPECIES.map((item) => ({ id: item.id, label: item.name }))} />
          {light?.warning ? <Quiet>{light.warning}</Quiet> : null}
          {(light?.notes || []).map((note) => <Quiet key={note}>{note}</Quiet>)}
          {light?.source ? <Quiet>Source: {light.source.title}. Season {light.season}. Read {light.source.read}.</Quiet> : null}
          <Quiet>Check state regulations. This is worked out on this phone, not a legal opinion.</Quiet>
        </ScrollView>
      ) : null}
      {open === "deer" ? (
        <ScrollView style={[styles.sheet, { borderColor: display.line }]} nestedScrollEnabled>
          {est ? (
            <>
              <Text style={styles.level}>{est.level === "Medium" ? "Med" : est.level}. {DISCLAIMER}</Text>
              <Quiet>Based on {est.used} of {est.of} inputs. It works with what is already on this phone, with no signal.</Quiet>
              {est.factors.map((factor) => (
                <View key={factor.id} style={styles.factor}>
                  <Text style={styles.factorTitle}>{factor.label}: {factor.weight > 0 ? "pushes up" : factor.weight < 0 ? "pushes down" : "no effect"}</Text>
                  <Quiet>{factor.reason}</Quiet>
                  <SourceTag source={factor.source} />
                </View>
              ))}
              <View style={styles.factor}>
                <Text style={styles.factorTitle}>Moon: context only, never counted</Text>
                <Quiet>{est.moon.name}, {est.moon.lit}% lit.</Quiet>
                <Quiet>{est.moon.note}</Quiet>
              </View>
            </>
          ) : (
            <Quiet>Not enough to estimate. Turn on your location in Map and add a temperature or wind, or save a forecast in Weather.</Quiet>
          )}
          <Action label="Weather and wind inputs" tone="quiet" onPress={() => onOpenTool?.("weather")} />
        </ScrollView>
      ) : null}
    </View>
  );
}

function HudCard({ label, value, sub, onPress, active }) {
  const display = useDisplay();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}. ${sub}`} onPress={onPress} style={[styles.card, { borderColor: active ? colors.brass : display.line }]}>
      <Text style={[styles.cardLabel, { color: display.muted }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.cardValue, { fontSize: display.size(16) }]}>{value}</Text>
      <Text style={[styles.cardSub, { color: display.muted, fontSize: display.size(12) }]}>{sub}</Text>
    </Pressable>
  );
}

const styles = themedStyles((c) => ({
  hud: { gap: 8, marginBottom: 8 },
  row: { flexDirection: "row", gap: 8 },
  card: { flex: 1, minHeight: 84, borderWidth: 1, borderRadius: 14, backgroundColor: c.surface, padding: 10, gap: 2 },
  cardLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  cardValue: { color: c.ink, fontWeight: "700" },
  cardSub: { lineHeight: 16 },
  sheet: { maxHeight: 280, borderWidth: 1, borderRadius: 14, backgroundColor: c.surface, padding: 12 },
  group: { color: c.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 6, marginBottom: 6 },
  level: { color: c.ink, fontSize: 20, fontWeight: "700" },
  factor: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 6, marginTop: 6 },
  factorTitle: { color: c.ink, fontWeight: "600", fontSize: 15 }
}));
