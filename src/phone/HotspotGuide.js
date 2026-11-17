import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { HOTSPOT_TITLE as TITLE, HOTSPOT_LEAD as LEAD, HOTSPOT_SECTIONS as SECTIONS } from "../../data/text/hotspot_guide.js";
import { Quiet, ScreenHeader } from "./ui.js";
import { colors, radius, space, type } from "./tokens.js";

export default function HotspotGuide() {
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={TITLE} lead={LEAD} />
      {SECTIONS.map((section) => (
        <View key={section.id} style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>{section.title}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}
      <Quiet>A hotspot needs a connection to share. The mesh can carry a short note without a cell signal, only to a nearby Yehsa install.</Quiet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
});
