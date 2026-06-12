import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';

interface ThemeContextValue {
  pref: ThemePref;
  resolved: 'light' | 'dark';
  setPref: (pref: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'mototrack:theme';

function isDaytime(date: Date): boolean {
  const hour = date.getHours();
  return hour >= 6 && hour < 20;
}

function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return isDaytime(new Date()) ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
  });
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(pref));

  useEffect(() => {
    setResolved(resolveTheme(pref));
    if (pref !== 'auto') return;
    const interval = setInterval(() => setResolved(resolveTheme('auto')), 60_000);
    return () => clearInterval(interval);
  }, [pref]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const setPref = (next: ThemePref) => {
    setPrefState(next);
    localStorage.setItem(STORAGE_KEY, next);
    setResolved(resolveTheme(next));
  };

  return <ThemeContext.Provider value={{ pref, resolved, setPref }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme muss innerhalb von ThemeProvider verwendet werden');
  return ctx;
}
