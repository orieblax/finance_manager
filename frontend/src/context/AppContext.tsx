'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { translations, Language } from '@/lib/i18n';
import { createClient } from '@/utils/supabase/client';
import { setActiveUserId } from '@/lib/db/dexie';
import { autoSyncFromCloud } from '@/lib/sync/cloudSync';

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
  user: any | null;
  authLoading: boolean;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [supabase] = useState(() => createClient());

  const [lang, setLangState] = useState<Language>('es');
  const [currentMonth, setCurrentMonthState] = useState<string>('2026-10');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  useEffect(() => {
    const savedLang = localStorage.getItem('pfm_lang') as Language;
    if (savedLang && (savedLang === 'es' || savedLang === 'en')) {
      setLangState(savedLang);
    }
    const savedMonth = localStorage.getItem('pfm_month');
    const d = new Date();
    const defaultMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const initialMonth = savedMonth || defaultMonth;
    setCurrentMonthState(initialMonth);

    // Check active auth session once on mount and auto-sync from Supabase
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user ?? null);
      if (user) {
        setActiveUserId(user.id);
        setAuthLoading(false);
        triggerRefresh();

        // Sync fresh or newer cloud snapshot in background and refresh UI when ready
        const syncRes = await autoSyncFromCloud(initialMonth, user.id);
        if (syncRes.success && syncRes.found) {
          if (syncRes.restoredMonthKey && !savedMonth) {
            setCurrentMonthState(syncRes.restoredMonthKey);
            localStorage.setItem('pfm_month', syncRes.restoredMonthKey);
          }
          triggerRefresh();
        }
      } else {
        setActiveUserId(undefined);
        setAuthLoading(false);
        triggerRefresh();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const activeUser = session?.user ?? null;
      setUser(activeUser);
      if (activeUser) {
        setActiveUserId(activeUser.id);
        setAuthLoading(false);
        triggerRefresh();

        if (event === 'SIGNED_IN') {
          const syncRes = await autoSyncFromCloud(initialMonth, activeUser.id);
          if (syncRes.success && syncRes.found) {
            triggerRefresh();
          }
        }
      } else {
        setActiveUserId(undefined);
        setAuthLoading(false);
        triggerRefresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!authLoading && !user && pathname !== '/login') {
      router.push('/login');
    }
  }, [authLoading, user, pathname, router]);

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

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setActiveUserId(undefined);
    triggerRefresh();
    router.push('/login');
    router.refresh();
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
        user,
        authLoading,
        logout,
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
