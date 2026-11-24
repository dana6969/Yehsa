// Hunt party: paired contacts with a checked safety number, and a timed location session you start.
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Action, Field, Quiet, ScreenHeader, themedStyles } from "./ui.js";
import { Card, Chips, Line, screenStyles } from "./hunt_ui.js";
import { getHunt, setHunt, useHunt } from "./hunt_state.js";
import { explain, getOrCreateIdentity, replaceIdentity } from "./identity.js";
import { transmitNote } from "./ble_provider.js";
import { chunkEnvelope, meshChunkText, qrPayload } from "../../symbolic/peer_chat.js";
import { queueServiceText } from "../../symbolic/phone_mesh.js";
import { DEFAULT_MINUTES, PARTY_RULES, VERIFY_FAIL_TEXT, addMember, extendSession, partyNotices, buildUpdates, cardFromText, dueForUpdate, emptyRoster, isSharing, noteSent, removeMember, shareLine, startSession, stopSession, tickSession, timeLeftText, verifiedMembers, verifyMember } from "../../symbolic/hunt/party.js";

const LENGTHS = [
  { id: "60", label: "1 hour" },
  { id: "120", label: "2 hours" },
  { id: "240", label: "4 hours" },
  { id: "480", label: "8 hours" }
];

// Runs while the app is open: stops the session at its end time, and sends a sealed update every minute while it lasts.
export function usePartyTicker({ position, mesh, setMesh }) {
  const hunt = useHunt();
  const meRef = useRef(null);
  const meshRef = useRef(mesh);
  meshRef.current = mesh;
  useEffect(() => {
    getOrCreateIdentity().then((result) => { meRef.current = result.identity || null; });
  }, []);
  useEffect(() => {
    const timer = setInterval(async () => {
      const roster = getHunt().roster;
      if (!roster?.session || roster.session.stopped) return;
      const ticked = tickSession(roster, Date.now());
      if (ticked !== roster) { setHunt("roster", ticked); return; }
      if (!dueForUpdate(roster) || !meRef.current) return;
      const fix = position?.consent === true && position.status === "locked" ? position.fix : null;
      const updates = buildUpdates(roster, meRef.current, { fix, consent: position?.consent === true });
      if (updates.length === 0) return;
      setHunt("roster", (current) => noteSent(current));
      let session = meshRef.current;
      for (const update of updates) {
        for (const part of chunkEnvelope(update.envelope)) {
          const queued = queueServiceText(session, meshChunkText(part));
          if (!queued.ok) continue;
          session = queued.session;
          if (session.link?.primary?.radio === true) transmitNote(queued.item.text, session.link.primary).catch(() => {});
        }
      }
      if (session !== meshRef.current) setMesh?.(session);
    }, 15000);
    return () => clearInterval(timer);
  }, [position?.status, position?.consent]);
  return hunt.roster;
}

export default function PartyScreen({ position, mesh, onBack, onPair }) {
  const hunt = useHunt();
  const roster = hunt.roster || emptyRoster();
  const [me, setMe] = useState(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState({});
  const [pick, setPick] = useState([]);
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES));
  const [problem, setProblem] = useState("");
  const [keyResult, setKeyResult] = useState({ state: "loading" });
  const [badNumber, setBadNumber] = useState({});
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    openKey();
    const timer = setInterval(() => tick((n) => n + 1), 20000);
    return () => clearInterval(timer);
  }, []);
  function openKey() {
    setKeyResult({ state: "loading" });
    getOrCreateIdentity().then((result) => { setKeyResult(result); setMe(result.identity || null); });
  }
  async function newKey() {
    const done = await replaceIdentity({ approved: true });
    if (done.ok) openKey();
    else setKeyResult({ state: "error", detail: done.detail || "", message: "I couldn't open your key." });
  }
  const save = (next) => setHunt("roster", next);
  const sharing = isSharing(roster);
  const fix = position?.consent === true && position.status === "locked";
  const verified = verifiedMembers(roster);
  const notices = partyNotices({ roster, keyState: keyResult.state, linkUp: Boolean(mesh?.link?.primary), peersNearby: Array.isArray(mesh?.peers) ? mesh.peers.length : null });
  const noPeers = sharing && Array.isArray(mesh?.peers) && mesh.peers.length === 0;

  function add() {
    const result = addMember(roster, { name, card: cardFromText(code), me });
    if (!result.ok) { setProblem(result.reason); return; }
    setProblem("");
    save(result.roster);
    setName("");
    setCode("");
    setAdding(false);
  }

  function verify(member) {
    const result = verifyMember(roster, member.id, typed[member.id]);
    if (!result.ok) { setBadNumber((current) => ({ ...current, [member.id]: true })); return; }
    setBadNumber((current) => ({ ...current, [member.id]: false }));
    setProblem("");
    save(result.roster);
  }

  function start() {
    setBusy(true);
    const result = startSession(roster, { memberIds: pick, minutes: Number(minutes) });
    setBusy(false);
    if (!result.ok) { setProblem(result.reason); return; }
    setProblem("");
    save(result.roster);
  }

  return (
    <ScrollView contentContainerStyle={screenStyles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Hunt party" lead="Only paired contacts with a verified safety number. Location is opt-in, and the session ends on its own." onBack={onBack} backLabel="People" />
      {notices.map((notice) => (
        <Card key={notice.id} title={notice.title}>
          <Quiet live={notice.tone === "problem"}>{notice.body}</Quiet>
          {notice.id === "key-error" && keyResult.detail ? <Quiet>{`Code: ${keyResult.detail}`}</Quiet> : null}
          {notice.action === "retry" ? <Action label="Try again" onPress={openKey} /> : null}
          {notice.action === "replace" ? <Action label="Start a new key here" tone="clay" onPress={newKey} /> : null}
          {notice.action === "extend" ? <Action label="Add 30 minutes" tone="quiet" onPress={() => { const r = extendSession(roster); if (r.ok) save(r.roster); else setProblem(r.reason); }} /> : null}
        </Card>
      ))}
      {sharing ? (
        <Card title="Sharing now">
          <Text style={styles.big}>{timeLeftText(roster)}</Text>
          <Quiet live>{shareLine(roster)}</Quiet>
          {!fix ? <Quiet>Your location is not held, so nothing is going out. Turn it on in Map.</Quiet> : null}
          <Quiet>Updates go out sealed, once a minute, only while Yehsa is open. If no link is up, they are held on this phone and not sent.</Quiet>
          <Action label="Stop sharing" tone="clay" onPress={() => save(stopSession(roster))} />
        </Card>
      ) : (
        <Card title="No session right now.">
          {roster.session?.stopped ? <Quiet>{roster.session.stoppedBecause === "ended" ? "The last session ended on its own. Nothing is being shared." : "You stopped the last session. Nothing is being shared."}</Quiet> : null}
          {verified.length === 0 ? (
            <>
              <Quiet>Add someone and check their safety number first. Then you can start a session.</Quiet>
              {!adding && roster.members.length === 0 ? <Action label="Add someone" onPress={() => setAdding(true)} /> : null}
            </>
          ) : (
            <>
              <Text style={styles.group}>WHO SEES YOUR SPOT</Text>
              <Chips label="Who sees your spot" value="" onChange={(id) => setPick((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))} options={verified.map((member) => ({ id: member.id, label: pick.includes(member.id) ? `${member.name} ✓` : member.name }))} />
              <Text style={styles.group}>FOR HOW LONG</Text>
              <Chips label="How long" value={minutes} onChange={setMinutes} options={LENGTHS} />
              {pick.length ? <Quiet>Shares your spot with {verified.filter((m) => pick.includes(m.id)).map((m) => m.name).join(", ")} for {LENGTHS.find((item) => item.id === minutes)?.label || `${minutes} min`}. Stop anytime.</Quiet> : null}
              <Action label={busy ? "Starting the session…" : "Start a session"} disabled={busy || pick.length === 0} onPress={start} />
            </>
          )}
        </Card>
      )}
      {problem ? <Quiet live>{problem}</Quiet> : null}
      <Text style={styles.group}>PEOPLE</Text>
      {roster.members.length === 0 ? <Quiet>No one added yet.</Quiet> : null}
      {roster.members.map((member) => (
        <Card key={member.id} title={member.name}>
          <Text style={styles.number}>{member.safety}</Text>
          {member.verified ? <Quiet>{noPeers ? "Safety number · verified · no peers nearby" : "Safety number · verified"}</Quiet> : (
            <>
              <Quiet>Safety number · unverified · cannot join until verified</Quiet>
              <Quiet>Read the number above to them, and type the number their phone shows.</Quiet>
              <Field label="Their number" value={typed[member.id] || ""} onChangeText={(value) => setTyped((current) => ({ ...current, [member.id]: value }))} placeholder="0000 0000 0000 0000 0000 0000 0000 0000" />
              {badNumber[member.id] ? <Quiet live>{VERIFY_FAIL_TEXT}</Quiet> : null}
              <Action label="Check the number" onPress={() => verify(member)} />
            </>
          )}
          <Action label="Remove" tone="clay" onPress={() => save(removeMember(roster, member.id))} />
        </Card>
      ))}
      {adding ? (
        <Card title="Add someone">
          <Quiet>Ask them to open People, Pair, and show their pairing code. Paste it here.</Quiet>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Sam" />
          <Field label="Their pairing code" value={code} onChangeText={setCode} multiline />
          <Action label="Add" onPress={add} disabled={!me} />
          {!me && keyResult.state !== "loading" ? <Quiet>Your key is not ready, so adding is paused. See the notice at the top.</Quiet> : null}
          <Action label="Cancel" tone="quiet" onPress={() => { setAdding(false); setProblem(""); }} />
          {me ? <Quiet>Your own pairing code, to give them:</Quiet> : null}
          {me ? <Text selectable style={styles.code}>{qrPayload(me)}</Text> : null}
        </Card>
      ) : roster.members.length ? <Action label="Add someone" tone="quiet" onPress={() => setAdding(true)} /> : null}
      {PARTY_RULES.map((rule) => <Quiet key={rule}>{rule}</Quiet>)}
      <Quiet>Your sightings log is never part of this. You can share one pin by hand.</Quiet>
    </ScrollView>
  );
}

const styles = themedStyles((c) => ({
  big: { color: c.ink, fontSize: 24, fontWeight: "700" },
  group: { color: c.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 8 },
  number: { color: c.brassText, fontSize: 18, letterSpacing: 1, lineHeight: 26, fontVariant: ["tabular-nums"] },
  code: { color: c.muted, fontSize: 11 }
}));
