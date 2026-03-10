/**
 * @file src/contexts/I18nContext.tsx
 * @description 경량 i18n Context (한국어/영어 지원)
 *
 * 초보자 가이드:
 * 1. **사용법**: `const { t, locale, setLocale } = useI18n();`
 * 2. **번역 호출**: `t('nav.dashboard')` → 현재 locale에 맞는 번역 반환
 * 3. **언어 전환**: `setLocale('en')` 또는 `setLocale('ko')`
 */

'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { type Locale, locales, getNestedValue } from '@/locales';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'ko',
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ko');

  useEffect(() => {
    const saved = localStorage.getItem('locale') as Locale | null;
    if (saved && (saved === 'ko' || saved === 'en' || saved === 'es')) {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem('locale', next);
  }, []);

  const t = useCallback((key: string): string => {
    return getNestedValue(locales[locale], key);
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
