import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { PALETTES, type Palette, type ThemeName } from './tokens';

const KEY = 'safesite.theme';

interface ThemeCtx {
  p: Palette;
  name: ThemeName;
  setTheme: (n: ThemeName) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ p: PALETTES.plant, name: 'plant', setTheme: () => {}, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName>('plant');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'plant' || v === 'control' || v === 'daylight') setName(v);
      })
      .catch(() => {});
  }, []);

  const setTheme = useCallback((n: ThemeName) => {
    setName(n);
    AsyncStorage.setItem(KEY, n).catch(() => {});
  }, []);

  const p = PALETTES[name];

  // Web: keep the page background and colour-scheme in step with the theme.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.backgroundColor = p.bg;
    document.body.style.backgroundColor = p.bg;
    document.documentElement.style.colorScheme = p.statusBar === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = name;
  }, [p, name]);

  const value = useMemo(
    () => ({ p, name, setTheme, toggle: () => setTheme(name === 'control' ? 'plant' : 'control') }),
    [p, name, setTheme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
