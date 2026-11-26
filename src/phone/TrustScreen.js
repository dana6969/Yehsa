import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PLEDGE_TITLE as TITLE, PLEDGE_LEAD as LEAD, PLEDGE_SECTIONS as SECTIONS } from "../../data/text/no_account_pledge.js";
import { Quiet, ScreenHeader, colors, themedStyles } from "./ui.js";
import { radius, space, type } from "./tokens.js";

export default function TrustScreen({ onBack, backLabel } = {}) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={TITLE} lead={LEAD} onBack={onBack} backLabel={backLabel} />
      {SECTIONS.map((section) => (
        <View key={section.id} style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>{section.title}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}
      <Quiet>This pledge stays on the phone with the app. It is not a posted public statement until it has been reviewed.</Quiet>
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
