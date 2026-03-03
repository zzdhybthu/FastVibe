import { create } from 'zustand';

export type Language = 'zh' | 'en';

const STORAGE_KEY = 'vibecoding_language';
const VOICE_LANG_KEY = 'vibecoding_voice_lang';

function getInitialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  return 'zh';
}

function getInitialVoiceLang(): Language {
  const stored = localStorage.getItem(VOICE_LANG_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  return 'zh';
}

interface LanguageStore {
  language: Language;
  setLanguage: (lang: Language) => void;
  voiceLang: Language;
  setVoiceLang: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageStore>((set) => ({
  language: getInitialLanguage(),
  setLanguage: (lang: Language) => {
    localStorage.setItem(STORAGE_KEY, lang);
    set({ language: lang });
  },
  voiceLang: getInitialVoiceLang(),
  setVoiceLang: (lang: Language) => {
    localStorage.setItem(VOICE_LANG_KEY, lang);
    set({ voiceLang: lang });
  },
}));
