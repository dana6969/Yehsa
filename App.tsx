import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAxionetRuntimeGuarantee } from './src/hooks/useAxionetRuntimeGuarantee';

export default function App() {
  useAxionetRuntimeGuarantee(); // keeps app alive and active

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
