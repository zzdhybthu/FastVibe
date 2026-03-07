import { create } from 'zustand';
import type { AgentType, LogLevel } from '@fastvibe/shared';

export type Language = 'zh' | 'en';

const STORAGE_KEY = 'fastvibe_language';
const VOICE_LANG_KEY = 'fastvibe_voice_lang';
const DEFAULT_AGENT_KEY = 'fastvibe_default_agent';
const LOG_LEVEL_KEY = 'fastvibe_log_level';

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

function getInitialDefaultAgent(): AgentType {
  const stored = localStorage.getItem(DEFAULT_AGENT_KEY);
  if (stored === 'claude-code' || stored === 'codex') return stored;
  return 'claude-code';
}

function getInitialLogLevel(): LogLevel {
  const stored = localStorage.getItem(LOG_LEVEL_KEY);
  if (stored === 'debug' || stored === 'info' || stored === 'warn' || stored === 'error') return stored;
  return 'debug';
}

interface LanguageStore {
  language: Language;
  setLanguage: (lang: Language) => void;
  voiceLang: Language;
  setVoiceLang: (lang: Language) => void;
  defaultAgent: AgentType;
  setDefaultAgent: (agent: AgentType) => void;
  logLevel: LogLevel;
  setLogLevel: (level: LogLevel) => void;
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
  defaultAgent: getInitialDefaultAgent(),
  setDefaultAgent: (agent: AgentType) => {
    localStorage.setItem(DEFAULT_AGENT_KEY, agent);
    set({ defaultAgent: agent });
  },
  logLevel: getInitialLogLevel(),
  setLogLevel: (level: LogLevel) => {
    localStorage.setItem(LOG_LEVEL_KEY, level);
    set({ logLevel: level });
  },
}));
