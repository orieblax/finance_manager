'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language } from '@/lib/i18n';

interface AppContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: typeof translations['es'];
  currentMonth: string;
  setCurrentMonth: (m: string) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  message: { text: string; type: 'success' | 'error' | 'info' } | null;
  showMessage: (text: string, type?: 'success' | 'error' | 'info') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('es');
  const [currentMonth, setCurrentMonthState] = useState<string>('2026-10');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    const savedLang = localStorage.getItem('pfm_lang') as Language;
    if (savedLang && (savedLang === 'es' || savedLang === 'en')) {
      setLangState(savedLang);
    }
    const savedMonth = localStorage.getItem('pfm_month');
    if (savedMonth) {
      setCurrentMonthState(savedMonth);
    } else {
      const d = new Date();
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      setCurrentMonthState(mStr);
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('pfm_lang', newLang);
  };

  const setCurrentMonth = (m: string) => {
    setCurrentMonthState(m);
    localStorage.setItem('pfm_month', m);
    triggerRefresh();
  };

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const showMessage = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMessage({ text, type });
    setTimeout(() => {
      setMessage(null);
    }, 4000);
  };

  const t = translations[lang];

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        t,
        currentMonth,
        setCurrentMonth,
        refreshTrigger,
        triggerRefresh,
        message,
        showMessage,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}
