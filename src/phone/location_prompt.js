// The consent prompt the Map shows before it turns on the one location setting.
// Same words as the Settings, Location switch (symbolic/location_setting.js).
import { Alert, Platform } from "react-native";

export function confirmLocation(text) {
  if (Platform.OS === "web") {
    const ask = globalThis.confirm;
    return Promise.resolve(typeof ask === "function" ? ask(`${text.title}\n\n${text.body}`) === true : false);
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    Alert.alert(text.title, text.body, [
      { text: text.no, style: "cancel", onPress: () => finish(false) },
      { text: text.yes, onPress: () => finish(true) }
    ], { cancelable: true, onDismiss: () => finish(false) });
  });
}
