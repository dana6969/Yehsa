import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SAT_SOS_TITLE as TITLE, SAT_SOS_LEAD as LEAD, SAT_SOS_SECTIONS as SECTIONS } from "../../data/text/sat_sos_guide.js";
import { Quiet, ScreenHeader, colors, themedStyles } from "./ui.js";
import { radius, space, type } from "./tokens.js";

export default function SatSosGuide({ onBack, backLabel } = {}) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={TITLE} lead={LEAD} onBack={onBack} backLabel={backLabel} />
      {SECTIONS.map((section) => (
        <View key={section.id} style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>{section.title}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}
      <Quiet>Check your phone's settings for the steps that apply to your model. Yehsa does not send satellite messages.</Quiet>
    </ScrollView>
  );
}

const styles = themedStyles((colors) => ({
  scroll: {
    paddingTop: space.xl,
    paddingHorizontal: space.xl,
    paddingBottom: 180,
    gap: space.md,
    backgroundColor: colors.bg
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.sm
  },
  heading: {
    color: colors.brassText,
    fontSize: type.action.fontSize,
    lineHeight: type.action.lineHeight,
    fontWeight: "600"
  },
  body: {
    color: colors.ink,
    fontSize: type.prose.fontSize,
    lineHeight: type.prose.lineHeight
  }
}));
