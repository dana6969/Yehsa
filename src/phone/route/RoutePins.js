// The destination pin on the map: a flag shape and the place name (never color alone).
import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, themedStyles } from "../ui.js";

export function DestinationPin({ name }) {
  return (
    <View pointerEvents="none" style={styles.box} accessibilityLabel={`Destination: ${name}`}>
      <View style={styles.pill}>
        <Ionicons name="flag" size={14} color={colors.brassInk} />
        <Text numberOfLines={1} style={styles.text}>{name}</Text>
      </View>
      <View style={styles.stem} />
    </View>
  );
}

const styles = themedStyles((c) => ({
  box: { alignItems: "center", maxWidth: 180 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: c.brass, borderWidth: 1, borderColor: c.brassInk, maxWidth: 180 },
  text: { color: c.brassInk, fontWeight: "800", fontSize: 12 },
  stem: { width: 2, height: 10, backgroundColor: c.brass }
}));
