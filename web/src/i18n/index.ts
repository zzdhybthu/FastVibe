import { useLanguageStore } from '../stores/language-store';
import { zh } from './zh';
import { en } from './en';
import type { Translations } from './zh';

const translations: Record<string, Translations> = { zh, en };

export function useT(): Translations {
  const language = useLanguageStore((s) => s.language);
  return translations[language] ?? zh;
}

export type { Translations };
export { zh, en };
