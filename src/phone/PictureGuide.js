import React, { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import manifest from "../../assets/pictures/manifest.json";
import { pictureSource } from "../../symbolic/picture_assets.js";
import { guideView, imageHref, packDecision, pictureHealth, PICTURE_BUDGET_BYTES } from "../../symbolic/picture_guide.js";
import { Quiet, ScreenHeader, colors, themedStyles } from "./ui.js";

// A picture that is not in the app shows a labeled box, never a silent empty one.
function GuideImage({ image, style, fit = "cover" }) {
  const [failed, setFailed] = useState(false);
  const source = pictureSource(image.file);
  if (!source || failed) {
    return (
      <View accessibilityLabel="Picture not included" style={[style, missingStyles.box]}>
        <Text style={missingStyles.text}>Picture not included</Text>
      </View>
    );
  }
  return <Image accessibilityLabel={image.attribution} source={source} onError={() => setFailed(true)} resizeMode={fit} style={style} />;
}

const missingStyles = themedStyles((colors) => ({
  box: { alignItems: "center", justifyContent: "center", padding: 4, borderWidth: 1, borderStyle: "dashed", borderColor: colors.lineStrong },
  text: { color: colors.muted, fontSize: 12, textAlign: "center" }
}));

const DOMAINS = ["", "herbology", "first-aid", "knots", "fire", "shelter", "water", "sky", "landscape", "signaling"];

export default function PictureGuide({ onBack, backLabel, initialDomain = "", initialSymbol = "" }) {
  // initialSymbol opens one entry, for example from Identify's "Picture guide" button.
  const [query, setQuery] = useState(initialSymbol);
  const [domain, setDomain] = useState(initialDomain);
  const [open, setOpen] = useState(initialSymbol || null);
  const entries = guideView(manifest, { query, domain });
  const bytes = (manifest.images || []).reduce((sum, image) => sum + (Number(image.bytes) || 0), 0);
  const decision = packDecision(bytes || 391744);
  const flags = pictureHealth(manifest, (manifest.images || []).map((image) => image.file));

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        onBack={onBack}
        backLabel={backLabel}
        title="Picture guide"
        lead="Real pictures, with credits when you ask."
      />
      <Quiet>{decision.text} Budget {Math.round(PICTURE_BUDGET_BYTES / (1024 * 1024))} MB.</Quiet>
      <TextInput accessibilityLabel="Search pictures" value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={styles.row}>
        {DOMAINS.map((item) => (
          <Pressable key={item || "all"} accessibilityRole="button" accessibilityLabel={item || "All pictures"} onPress={() => setDomain(item)} style={[styles.chip, domain === item && styles.chipOn]}>
            <Text style={[styles.chipText, domain === item && styles.chipTextOn]}>{item || "All"}</Text>
          </Pressable>
        ))}
      </View>
      {entries.map((entry) => (
        <Pressable key={entry.symbol} accessibilityRole="button" accessibilityLabel={entry.title} onPress={() => setOpen(open === entry.symbol ? null : entry.symbol)} style={styles.card}>
          <Text style={styles.title}>{entry.title}</Text>
          <Quiet>{entry.domain}</Quiet>
          {entry.placeholder ? <Text style={styles.placeholder}>No picture yet.</Text> : null}
          {entry.caution ? <Text style={styles.warn}>{entry.caution}</Text> : null}
          <View style={styles.row}>
            {entry.images.map((image) => (
              <GuideImage key={image.id} image={image} style={styles.thumb} />
            ))}
          </View>
          {open === entry.symbol ? entry.images.map((image) => (
            <View key={`${image.id}-full`}>
              {image.warning ? <Text style={styles.warn}>{image.warning}</Text> : null}
              {image.role === "lookalike" ? <Text style={styles.warn}>Look-alike warning. This is not the plant in the note.</Text> : null}
              <GuideImage image={image} style={styles.zoom} fit="contain" />
              <Quiet>{`${image.author}. ${image.license}. ${image.attribution}`}</Quiet>
              <Quiet>{image.sourceUrl}</Quiet>
            </View>
          )) : null}
        </Pressable>
      ))}
      <Text style={styles.title}>Corpus health</Text>
      {flags.length === 0 ? <Quiet>No missing or unlicensed pictures in this check.</Quiet> : flags.map((flag) => (
        <Quiet key={`${flag.problem}-${flag.id}`}>{flag.text}</Quiet>
      ))}
    </ScrollView>
  );
}

const styles = themedStyles((colors) => ({
  scroll: { paddingTop: 22, paddingHorizontal: 22, paddingBottom: 180, gap: 10 },
  input: { minHeight: 48, color: colors.ink, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong, justifyContent: "center" },
  chipOn: { backgroundColor: colors.brass, borderColor: colors.brass },
  chipText: { color: colors.ink, fontWeight: "600" },
  chipTextOn: { color: colors.brassInk },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 6 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "600" },
  placeholder: { color: colors.muted, fontSize: 16 },
  warn: { color: colors.clay, fontSize: 15, lineHeight: 21 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.field },
  zoom: { width: "100%", height: 280, borderRadius: 12, backgroundColor: colors.field }
}));
