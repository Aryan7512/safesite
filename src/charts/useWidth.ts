import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/** Measure a container so SVG charts can fill it. */
export function useWidth(initial = 0) {
  const [width, setWidth] = useState(initial);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth((old) => (Math.abs(old - w) > 1 ? w : old));
  }, []);
  return { width, onLayout };
}

/** Font for SVG text: the loaded IBM Plex family (else SVG falls back to a serif). */
export const SVG_FONT = 'IBMPlexSans_600SemiBold';
