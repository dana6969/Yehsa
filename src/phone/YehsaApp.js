import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import books from "../../symbolic_memory/books_index.json";
import { askField } from "../../symbolic/phone_field.js";
import {
  addSessionTrack,
  courseText,
  declinationText,
  gotoSessionWaypoint,
  lockedFill,
  saveSessionWaypoint,
  sunText,
  trackText
} from "../../symbolic/phone_land.js";
import { meshScreenStatus } from "../../symbolic/phone_mesh.js";
import {
  holdTypedFix,
  initialPosition,
  noteSatelliteUnavailable,
  setConsent,
  shareAttempt,
  statusLabel,
  unlockPosition
} from "../../symbolic/phone_position.js";
import { Action, Field, Panel, Prose, colors } from "./ui.js";

const TABS = [
  { id: "ask", label: "Ask" },
  { id: "land", label: "Land" },
  { id: "position", label: "Position" },
  { id: "mesh", label: "Mesh" }
];

const LANDS = [
  { id: "course", label: "Course" },
  { id: "points", label: "Points" },
  { id: "track", label: "Track" },
  { id: "sun", label: "Sun" }
];

function todayUtc() {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}-${day}`;
}

export default function YehsaApp() {
  const [tab, setTab] = useState("ask");
  const [position, setPosition] = useState(initialPosition);
  const [waypoints, setWaypoints] = useState([]);
  const [track, setTrack] = useState([]);

  const session = useMemo(() => ({
    consent: position.consent === true,
    fix: position.status === "locked" ? position.fix : null,
    waypoints
  }), [position, waypoints]);

  function changeConsent(value) {
    const next = setConsent(position, value);
    setPosition(next);
    if (!next.consent) {
      setWaypoints([]);
      setTrack([]);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.body}>
        <View
          style={[styles.pane, tab !== "ask" && styles.hidden]}
          pointerEvents={tab === "ask" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "ask"}
        >
          <AskPane session={session} />
        </View>
        <View
          style={[styles.pane, tab !== "land" && styles.hidden]}
          pointerEvents={tab === "land" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "land"}
        >
          <LandPane
            position={position}
            waypoints={waypoints}
            setWaypoints={setWaypoints}
            track={track}
            setTrack={setTrack}
          />
        </View>
        <View
          style={[styles.pane, tab !== "position" && styles.hidden]}
          pointerEvents={tab === "position" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "position"}
        >
          <PositionPane position={position} setPosition={setPosition} onConsent={changeConsent} />
        </View>
        <View
          style={[styles.pane, tab !== "mesh" && styles.hidden]}
          pointerEvents={tab === "mesh" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "mesh"}
        >
          <MeshPane />
        </View>
      </View>
      <View style={styles.tabs}>
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
              onPress={() => setTab(item.id)}
              style={[styles.tab, selected && styles.tabOn]}
            >
              <Text style={[styles.tabText, selected && styles.tabTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AskPane({ session }) {
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState("idle");
  const [answer, setAnswer] = useState(null);
  const [cue, setCue] = useState(null);
  const [notice, setNotice] = useState(null);

  function ask() {
    const text = question.trim();
    if (!text) {
      setPhase("empty");
      setAnswer(null);
      setCue(null);
      setNotice("Type a question first.");
      return;
    }
    setPhase("loading");
    setNotice(null);
    setTimeout(() => {
      try {
        const result = askField(text, books.passages, { session });
        if (result.empty) {
          setPhase("empty");
          setAnswer(null);
          setCue(null);
          setNotice("Type a question first.");
          return;
        }
        if (!result.answered) {
          setPhase("miss");
          setAnswer(null);
          setCue(null);
          setNotice(result.miss || "No offline note answered that.");
          return;
        }
        setPhase("ready");
        setAnswer(result.text);
        setCue(result.cue);
        setNotice(null);
      } catch (err) {
        setPhase("error");
        setAnswer(null);
        setCue(null);
        setNotice(err?.message || "That question could not be read offline.");
      }
    }, 40);
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>Yehsa</Text>
      <Text style={styles.lead}>
        A field companion for one phone. Notes, courses, and a position you choose to hold. Offline. No city map.
      </Text>
      <Field
        label="Question"
        value={question}
        onChangeText={setQuestion}
        placeholder="How do I carry drinking water?"
        multiline
      />
      <Action label={phase === "loading" ? "Reading notes…" : "Ask"} onPress={ask} disabled={phase === "loading"} />
      {phase === "idle" ? (
        <Panel>
          <Prose>
            Ask in plain language. Yehsa answers from the field notes on this device. A feeling in the wording is a small cue beside the answer, not a replacement for it.
          </Prose>
        </Panel>
      ) : null}
      {phase === "loading" ? (
        <Panel>
          <Prose>Reading field notes…</Prose>
        </Panel>
      ) : null}
      {answer ? (
        <Panel>
          <Prose>{answer}</Prose>
          {cue ? <Text style={styles.cue}>{cue}</Text> : null}
        </Panel>
      ) : null}
      {notice ? (
        <Panel>
          <Prose tone={phase === "error" ? "warn" : undefined}>{notice}</Prose>
        </Panel>
      ) : null}
      <Text style={styles.foot}>
        The large dictionary is not loaded on this screen. Nothing you ask is saved as a profile.
      </Text>
    </ScrollView>
  );
}

function LandPane({ position, waypoints, setWaypoints, track, setTrack }) {
  const [section, setSection] = useState("course");
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [magnetic, setMagnetic] = useState("");
  const [declination, setDeclination] = useState("");
  const [name, setName] = useState("");
  const [pointText, setPointText] = useState("");
  const [altitude, setAltitude] = useState("");
  const [gotoName, setGotoName] = useState("");
  const [gotoFrom, setGotoFrom] = useState("");
  const [trackPoint, setTrackPoint] = useState("");
  const [trackAlt, setTrackAlt] = useState("");
  const [trackTime, setTrackTime] = useState("");
  const [sunPoint, setSunPoint] = useState("");
  const [sunDate, setSunDate] = useState(todayUtc);
  const [result, setResult] = useState("Type coordinates. There is no city search and no downloaded map.");

  function useLocked(setter) {
    const filled = lockedFill(position);
    if (!filled.ok) {
      setResult(filled.text);
      return;
    }
    setter(filled.text);
    setResult("Filled from the position you chose to hold. It is not a city lookup.");
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>Yehsa</Text>
      <Text style={styles.screenTitle}>Landscape</Text>
      <Text style={styles.lead}>
        Distance, bearing, waypoints, a track, and a rough sunrise. A sphere of 6371 km. No streets and no places of interest.
      </Text>
      <View style={styles.chips}>
        {LANDS.map((item) => {
          const selected = section === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setSection(item.id)}
              style={[styles.chip, selected && styles.chipOn]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {section === "course" ? (
        <View>
          <Field label="From (latitude, longitude)" value={fromText} onChangeText={setFromText} placeholder="0, 0" />
          <Action label="Use locked position as From" tone="quiet" onPress={() => useLocked(setFromText)} />
          <Field label="To (latitude, longitude)" value={toText} onChangeText={setToText} placeholder="0, 1" />
          <Action
            label="Distance and bearing"
            onPress={() => setResult(courseText(fromText, toText).text)}
          />
          <Panel>
            <Prose>{result}</Prose>
          </Panel>
          <Field label="Magnetic bearing (degrees)" value={magnetic} onChangeText={setMagnetic} placeholder="90" />
          <Field label="Declination from your map (east positive)" value={declination} onChangeText={setDeclination} placeholder="12" />
          <Action
            label="Apply declination"
            tone="quiet"
            onPress={() => setResult(declinationText(magnetic, declination).text)}
          />
        </View>
      ) : null}

      {section === "points" ? (
        <View>
          <Field label="Name" value={name} onChangeText={setName} placeholder="camp" />
          <Field label="At (latitude, longitude)" value={pointText} onChangeText={setPointText} placeholder="45.1, -69.2" />
          <Action label="Use locked position" tone="quiet" onPress={() => useLocked(setPointText)} />
          <Field label="Altitude in meters (optional)" value={altitude} onChangeText={setAltitude} placeholder="" />
          <Action
            label="Save waypoint"
            onPress={() => {
              const saved = saveSessionWaypoint(waypoints, {
                consent: position.consent,
                name,
                pointText,
                altitudeText: altitude
              });
              setWaypoints(saved.list);
              setResult(saved.text);
            }}
          />
          <Field label="Go to name" value={gotoName} onChangeText={setGotoName} placeholder="camp" />
          <Field label="Start from (latitude, longitude)" value={gotoFrom} onChangeText={setGotoFrom} placeholder="leave blank to use the lock" />
          <Action label="Use locked position as start" tone="quiet" onPress={() => useLocked(setGotoFrom)} />
          <Action
            label="Go to waypoint"
            onPress={() => setResult(gotoSessionWaypoint(waypoints, {
              consent: position.consent,
              name: gotoName,
              fromText: gotoFrom,
              locked: position.status === "locked" ? position.fix : null
            }).text)}
          />
          <Panel>
            <Text style={styles.label}>Waypoints on this screen</Text>
            {waypoints.length === 0 ? (
              <Prose>None yet. Saving needs consent on the Position screen. Turning consent off clears this list.</Prose>
            ) : waypoints.map((item) => (
              <Text key={item.name} style={styles.row}>
                {item.name} — {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                {item.altitude != null ? `, ${item.altitude} m` : ""}
              </Text>
            ))}
          </Panel>
        </View>
      ) : null}

      {section === "track" ? (
        <View>
          <Field label="Point (latitude, longitude)" value={trackPoint} onChangeText={setTrackPoint} placeholder="0, 0" />
          <Action label="Use locked position" tone="quiet" onPress={() => useLocked(setTrackPoint)} />
          <Field label="Altitude in meters (optional)" value={trackAlt} onChangeText={setTrackAlt} placeholder="" />
          <Field label="Time (optional, ISO)" value={trackTime} onChangeText={setTrackTime} placeholder="2026-01-01T00:00:00Z" />
          <Action
            label="Add track point"
            onPress={() => {
              const added = addSessionTrack(track, {
                consent: position.consent,
                pointText: trackPoint,
                altitudeText: trackAlt,
                timeText: trackTime
              });
              setTrack(added.points);
              setResult(added.ok ? trackText(added.points).text : added.text);
            }}
          />
          <Action label="Track summary" tone="quiet" onPress={() => setResult(trackText(track).text)} />
        </View>
      ) : null}

      {section === "sun" ? (
        <View>
          <Field label="At (latitude, longitude)" value={sunPoint} onChangeText={setSunPoint} placeholder="45.1, -69.2" />
          <Action label="Use locked position" tone="quiet" onPress={() => useLocked(setSunPoint)} />
          <Field label="Date (YYYY-MM-DD)" value={sunDate} onChangeText={setSunDate} placeholder="2026-06-21" />
          <Action label="Rough sunrise and sunset" onPress={() => setResult(sunText(sunPoint, sunDate).text)} />
        </View>
      ) : null}

      {section !== "course" ? (
        <Panel>
          <Prose>{result}</Prose>
        </Panel>
      ) : null}
    </ScrollView>
  );
}

function PositionPane({ position, setPosition, onConsent }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [altitude, setAltitude] = useState("");
  const [shareNote, setShareNote] = useState("Share is a separate action. Nothing is sent when you lock.");

  const label = statusLabel(position);
  const tone = position.status === "locked" ? "good" : position.status === "degraded" ? "warn" : undefined;

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>Yehsa</Text>
      <Text style={styles.screenTitle}>Position</Text>
      <Text style={styles.lead}>
        Off until you consent. Yehsa does not lock a position by itself, and it does not share one unless you use the separate share action.
      </Text>
      <Panel>
        <Text style={styles.kicker}>Status</Text>
        <Prose tone={tone}>{label}</Prose>
        <Text style={styles.note}>{position.note}</Text>
        {position.status === "locked" && position.fix ? (
          <Text style={styles.note}>
            Held {position.source === "typed" ? "typed coordinates" : "a fix"}: {position.fix.latitude.toFixed(5)}, {position.fix.longitude.toFixed(5)}
            {position.fix.altitude != null ? `, ${position.fix.altitude} m` : ""}. Not shared.
          </Text>
        ) : null}
      </Panel>
      <View style={styles.consentRow}>
        <View style={styles.consentCopy}>
          <Text style={styles.consentTitle}>I consent to hold a position on this device</Text>
          <Text style={styles.hint}>
            Turning this off clears the lock, the waypoints, and the track on this screen.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Consent to hold a position"
          value={position.consent === true}
          onValueChange={onConsent}
          trackColor={{ false: "#3d4a40", true: "#8eaa74" }}
          thumbColor={position.consent ? "#f4f0e6" : "#c5cbbd"}
        />
      </View>
      <Action
        label="Try satellite lock"
        onPress={() => setPosition(noteSatelliteUnavailable(position))}
        accessibilityHint="Does not run unless you tap. Needs termux-location, which this screen does not have."
      />
      <Field label="Latitude" value={lat} onChangeText={setLat} placeholder="45.1" />
      <Field label="Longitude" value={lon} onChangeText={setLon} placeholder="-69.2" />
      <Field label="Altitude in meters (optional)" value={altitude} onChangeText={setAltitude} placeholder="" />
      <Action
        label="Hold these coordinates"
        tone="quiet"
        onPress={() => {
          const raw = { latitude: lat, longitude: lon };
          if (String(altitude).trim()) raw.altitude = altitude;
          setPosition(holdTypedFix(position, raw));
        }}
      />
      <Action label="Unlock" tone="quiet" onPress={() => setPosition(unlockPosition(position))} />
      <Panel>
        <Text style={styles.kicker}>Share, separately</Text>
        <Prose>{shareNote}</Prose>
        <View style={{ height: 12 }} />
        <Action
          label="Share position"
          tone="clay"
          onPress={() => {
            const attempt = shareAttempt(position);
            setPosition(attempt.state);
            setShareNote(attempt.message);
          }}
        />
      </Panel>
      <Text style={styles.foot}>
        Expo cannot read the Android id or run termux-location. The owner file and the satellite fix stay on the Termux command. This screen will not pretend either succeeded.
      </Text>
    </ScrollView>
  );
}

function MeshPane() {
  const status = meshScreenStatus();
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.brand}>Yehsa</Text>
      <Text style={styles.screenTitle}>Mesh</Text>
      <Text style={styles.lead}>Read only. This screen does not start a scan.</Text>
      <Panel>
        <Text style={styles.kicker}>{status.title}</Text>
        <Prose tone="warn">{status.headline}</Prose>
        <Text style={styles.note}>{status.detail}</Text>
      </Panel>
      {status.rows.map((row) => (
        <Panel key={row.label}>
          <Text style={styles.kicker}>{row.label}</Text>
          <Prose>{row.value}</Prose>
        </Panel>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg
  },
  body: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center"
  },
  pane: {
    flex: 1
  },
  hidden: {
    display: "none"
  },
  scroll: {
    paddingTop: 28,
    paddingHorizontal: 18,
    paddingBottom: 28
  },
  brand: {
    color: colors.brass,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: 6
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6
  },
  lead: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 16
  },
  cue: {
    color: colors.moss,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 12
  },
  foot: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4
  },
  label: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 8
  },
  row: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 26
  },
  kicker: {
    color: colors.brass,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6
  },
  note: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 14
  },
  consentCopy: { flex: 1 },
  consentTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card
  },
  chipOn: {
    backgroundColor: colors.brass,
    borderColor: colors.brass
  },
  chipText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700"
  },
  chipTextOn: { color: colors.brassInk },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: "#161c18",
    paddingBottom: 10,
    paddingTop: 6
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center"
  },
  tabOn: {},
  tabText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "600"
  },
  tabTextOn: {
    color: colors.brass
  }
});
