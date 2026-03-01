import { create } from 'zustand';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'vibecoding_theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const cl = document.documentElement.classList;
  if (theme === 'dark') {
    cl.add('dark');
  } else {
    cl.remove('dark');
  }
  localStorage.setItem(STORAGE_KEY, theme);
}

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: getInitialTheme(),
  toggle: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return { theme: next };
    }),
}));
