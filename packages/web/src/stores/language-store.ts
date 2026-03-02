import { create } from 'zustand';

export type Language = 'zh' | 'en';

const STORAGE_KEY = 'vibecoding_language';

function getInitialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  // Detect from browser
  const browserLang = navigator.language || '';
  if (browserLang.startsWith('zh')) return 'zh';
  return 'en';
}

interface LanguageStore {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageStore>((set) => ({
  language: getInitialLanguage(),
  setLanguage: (lang: Language) => {
    localStorage.setItem(STORAGE_KEY, lang);
    set({ language: lang });
  },
}));
