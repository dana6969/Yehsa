import { createContext, useContext, useEffect, useRef } from "react";

// Open sheets and subviews register here so the Android back key closes
// them before the shell's own stack. The shell owns the list.
export const BackLayers = createContext(null);

export function useBackLayer(open, onBack) {
  const layers = useContext(BackLayers);
  const handler = useRef(onBack);
  handler.current = onBack;
  useEffect(() => {
    if (!open || !layers) return undefined;
    return layers.push(() => {
      handler.current?.();
      return true;
    });
  }, [open, layers]);
}
