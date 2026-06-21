import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { I18n } from 'i18n-js';
import en from '../locales/en.json';
import hi from '../locales/hi.json';

export type Language = 'en' | 'hi';

const LANGUAGE_KEY = 'capto_language';

export const i18n = new I18n({ en, hi });
i18n.defaultLocale = 'en';
i18n.enableFallback = true;

async function storedGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function storedSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
  return SecureStore.setItemAsync(key, value);
}

export interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  isLanguageLoading: boolean;
  hasSelectedLanguage: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [isLanguageLoading, setIsLanguageLoading] = useState(true);
  const [hasSelectedLanguage, setHasSelectedLanguage] = useState(false);

  useEffect(() => {
    async function loadLanguage() {
      const stored = await storedGet(LANGUAGE_KEY);
      if (stored === 'en' || stored === 'hi') {
        setLanguageState(stored);
        i18n.locale = stored;
        setHasSelectedLanguage(true);
      } else {
        i18n.locale = 'en';
        setHasSelectedLanguage(false);
      }
      setIsLanguageLoading(false);
    }
    void loadLanguage();
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    i18n.locale = lang;
    setHasSelectedLanguage(true);
    await storedSet(LANGUAGE_KEY, lang);
  }, []);

  const t = useCallback(
    (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isLanguageLoading, hasSelectedLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
