// "Roads and property lines" in Layers and packs: two switches, road search, and the plain
// notes on where the lines come from. Shown on the Map and the Hunt map.

import React, { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Action, Field, Quiet, themedStyles } from "./ui.js";
import { hit, space, type } from "./tokens.js";
import { ROADS_MANIFEST, roadHitBox, roadHitText, roadsCoverageText } from "../../symbolic/roads.js";
import { PARCEL_REFRESH_DAYS, parcelCoverageList } from "../../symbolic/parcels.js";

function Row({ label, value, onChange, hint }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch accessibilityLabel={label} accessibilityHint={hint} value={value} onValueChange={onChange} />
    </View>
  );
}

export default function MapLayersSection({ extras, near, onShowBox }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState(null);
  const [searching, setSearching] = useState(false);
  const [sources, setSources] = useState(false);

  async function search() {
    setSearching(true);
    try {
      setHits(await extras.search(query, near || null));
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <View>
      <Text style={styles.section}>Roads and property lines</Text>
      {extras.roadsAvailable ? (
        <>
          <Row label="Roads and streets" value={extras.roadsOn} onChange={extras.setRoadsOn} hint="Shows built-in road and street names on the Map and Hunt map. Works offline." />
          <Quiet>{roadsCoverageText(ROADS_MANIFEST)}</Quiet>
          {extras.roadsNote ? <Quiet live>{extras.roadsNote}</Quiet> : null}
          {extras.roadsOn ? (
            <>
              <Field label="Find a road by name" value={query} onChangeText={setQuery} placeholder="e.g. Ridge Road" />
              <Action label={searching ? "Searching…" : "Find road"} tone="quiet" disabled={searching || query.trim().length < 2} onPress={search} />
              {hits && !hits.length ? <Quiet live>No road by that name in the built-in road layer.</Quiet> : null}
              {(hits || []).map((item) => (
                <Pressable
                  key={`${item.name}-${item.latitude}-${item.longitude}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${roadHitText(item)} on the map`}
                  style={styles.hit}
                  onPress={() => onShowBox?.(roadHitBox(item))}
                >
                  <Text style={styles.hitText}>{roadHitText(item)}</Text>
                </Pressable>
              ))}
            </>
          ) : null}
        </>
      ) : (
        <Quiet>The road layer is in the Android app.</Quiet>
      )}
      <Row
        label="Property lines (Hunt map)"
        value={extras.parcelsOn}
        onChange={extras.setParcelsOn}
        hint="Asks the state's free parcel service for lines around where you look, and saves them on this phone for offline use."
      />
      <Quiet>
        {`Lines only: no owner names or addresses are asked for or shown. Approximate, not a legal survey. When on, Yehsa asks the state's public parcel service for the lines around the map area you look at (that service sees the area, nothing else), saves them on this phone with the date for offline use, and refreshes saved lines older than ${PARCEL_REFRESH_DAYS} days when you are online. Zoom in close to load them.`}
      </Quiet>
      {extras.parcelsOn && extras.parcelText ? <Quiet live>{extras.parcelBusy ? `Loading property lines… ${extras.parcelText}` : extras.parcelText}</Quiet> : null}
      {extras.parcelsOn && extras.parcelBusy && !extras.parcelText ? <Quiet live>Loading property lines…</Quiet> : null}
      <Pressable accessibilityRole="button" onPress={() => setSources((v) => !v)}>
        <Text style={styles.link}>{sources ? "Hide where the lines come from" : "Where the lines come from, by state"}</Text>
      </Pressable>
      {sources ? parcelCoverageList().map((item) => <Text key={item.state} style={item.covered ? styles.meta : styles.gap}>{item.text}</Text>) : null}
      {extras.parcelsOn ? <Action label="Remove saved property lines" tone="clay" onPress={extras.clearParcels} /> : null}
    </View>
  );
}

const styles = themedStyles((c) => ({
  section: { ...type.label, color: c.muted, marginTop: space.lg, textTransform: "uppercase", letterSpacing: 1 },
  row: { minHeight: hit.min, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm },
  rowLabel: { ...type.action, color: c.ink, flex: 1 },
  hit: { minHeight: hit.min, justifyContent: "center", borderBottomColor: c.line, borderBottomWidth: 1 },
  hitText: { color: c.ink, fontSize: 15 },
  meta: { color: c.muted, fontSize: 13, marginTop: 6 },
  gap: { color: c.ink, fontSize: 13, marginTop: 6 },
  link: { color: c.brassText, fontSize: 14, minHeight: 32, paddingTop: 6 }
}));
