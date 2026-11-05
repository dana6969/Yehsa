import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAxionetRuntimeGuarantee } from './src/hooks/useAxionetRuntimeGuarantee';

export default function App() {
  useAxionetRuntimeGuarantee(); // documented stub; does not keep the app alive

  return (
    <View style={styles.container}>
      <Text style={styles.text}>🚀 Axionet is running</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#0ff',
    fontSize: 20,
  },
});
