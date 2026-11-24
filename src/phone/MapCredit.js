// One "About this map" link under the map. The full credit shows once, when it is opened.
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

export default function MapCredit({ text, empty = false }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  if (empty) return <Text style={{ color: "#b7bfb2", marginTop: 8 }}>{text}</Text>;
  return (
    <View style={{ marginTop: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="About this map" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={{ minHeight: 44, justifyContent: "center" }}>
        <Text style={{ color: "#e2b15a", fontWeight: "600" }}>{open ? "About this map ▴" : "About this map ▾"}</Text>
      </Pressable>
      {open ? <Text style={{ color: "#b7bfb2", lineHeight: 20 }}>{text}</Text> : null}
    </View>
  );
}
