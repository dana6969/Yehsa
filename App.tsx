import React from 'react';
import { useAxionetRuntimeGuarantee } from './src/hooks/useAxionetRuntimeGuarantee';
import YehsaApp from './src/phone/YehsaApp';

export default function App() {
  useAxionetRuntimeGuarantee();
  return <YehsaApp />;
}
