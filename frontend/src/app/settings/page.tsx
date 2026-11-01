'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Languages,
  Upload,
  Download,
  Cloud,
  RefreshCw,
  Copy,
  Check,
  Shield,
  FileSpreadsheet,
  LogIn,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { parseAndImportExcelFile, exportLocalDataJson, importLocalDataJson } from '@/lib/import/xlsxImporter';
import { createClient } from '@/utils/supabase/client';
import { db } from '@/lib/db/dexie';

export default function SettingsPage() {
  const { t, lang, setLang, currentMonth, triggerRefresh, showMessage } = useApp();

  // Supabase Auth State
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Copied SQL state
  const [isSqlCopied, setIsSqlCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Handle Excel File Upload
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const res = await parseAndImportExcelFile(buffer, currentMonth);
      triggerRefresh();
      showMessage(
        `Importación exitosa: ${res.accountsCount} cuentas, ${res.expensesCount} egresos, ${res.receivablesCount} cobros, ${res.goalsCount} metas`,
        'success'
      );
    } catch (err: any) {
      showMessage(`Error al importar: ${err.message}`, 'error');
    }
  };

  // Handle JSON Export
  const handleExportJson = async () => {
    try {
      const jsonStr = await exportLocalDataJson();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finances_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage('Copia de seguridad descargada', 'success');
    } catch (err: any) {
      showMessage(`Error al exportar: ${err.message}`, 'error');
    }
  };

  // Handle JSON Restore
  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      await importLocalDataJson(text);
      triggerRefresh();
      showMessage('Copia de seguridad restaurada con éxito', 'success');
    } catch (err: any) {
      showMessage(`Error al restaurar: ${err.message}`, 'error');
    }
  };

  // Handle Supabase Sign In / Sign Up
  const handleAuth = async (isSignUp: boolean) => {
    if (!email || !password) return;
    setAuthLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        showMessage('Cuenta creada. Revisa tu email o inicia sesión', 'success');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showMessage('Sesión iniciada con éxito', 'success');
      }
    } catch (err: any) {
      showMessage(err.message || 'Error de autenticación', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    showMessage('Sesión cerrada', 'info');
  };

  // Handle Cloud Sync (Push current Dexie state to Supabase)
  const handleCloudSync = async () => {
    if (!user) {
      showMessage('Debes iniciar sesión con Supabase para sincronizar en la nube', 'error');
      return;
    }

    setIsSyncing(true);
    try {
      // 1. Export local state
      const [accounts, receivables, recurringExpenses, monthlyExtras, goals] = await Promise.all([
        db.accounts.toArray(),
        db.receivables.where('monthKey').equals(currentMonth).toArray(),
        db.recurringExpenses.where('monthKey').equals(currentMonth).toArray(),
        db.monthlyExtras.where('monthKey').equals(currentMonth).toArray(),
        db.goals.toArray(),
      ]);

      const payload = { accounts, receivables, recurringExpenses, monthlyExtras, goals };

      const res = await fetch('/api/v1/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month_key: currentMonth,
          device_id: 'web-pwa',
          payload,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fallo al sincronizar con el servidor');
      }

      const syncTime = new Date().toLocaleTimeString();
      setLastSyncTime(syncTime);
      showMessage(`Sincronización completada con éxito (${syncTime})`, 'success');
    } catch (err: any) {
      showMessage(err.message || 'Error durante la sincronización', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Copy Schema SQL
  const handleCopySql = () => {
    const sql = `-- Copia y pega esto en el SQL Editor de tu Dashboard de Supabase:
CREATE TABLE IF NOT EXISTS public.finance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    device_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_month UNIQUE (user_id, month_key)
);
ALTER TABLE public.finance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own snapshots" ON public.finance_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`;

    navigator.clipboard.writeText(sql);
    setIsSqlCopied(true);
    setTimeout(() => setIsSqlCopied(false), 3000);
    showMessage('SQL copiado al portapapeles', 'success');
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{t.settings.title}</h1>
        <p className="text-sm text-gray-400">Preferencias, copia de seguridad local, sincronización en nube y privacidad</p>
      </div>

      {/* Language Preferences */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Languages className="w-5 h-5 text-indigo-400" />
          {t.settings.language}
        </h2>
        <div className="flex gap-3">
          <button
            onClick={() => setLang('es')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              lang === 'es'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Español (CO)
          </button>
          <button
            onClick={() => setLang('en')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              lang === 'en'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* Excel & Local Backup */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            {t.settings.importExportTitle}
          </h2>
        </div>
        <p className="text-xs text-gray-400">
          {t.settings.storageNotice}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Import Excel */}
          <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-gray-700 hover:border-emerald-500 rounded-2xl cursor-pointer bg-gray-800/40 hover:bg-gray-800/80 transition-all text-center">
            <Upload className="w-6 h-6 text-emerald-400 mb-2" />
            <span className="text-sm font-bold text-gray-200">{t.settings.importExcel}</span>
            <span className="text-[11px] text-gray-400 mt-1">Sube tu archivo .xlsx directamente sin enviar a ningún servidor</span>
            <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
          </label>

          {/* Export JSON */}
          <div className="flex flex-col justify-between p-5 border border-gray-800 rounded-2xl bg-gray-800/30">
            <div>
              <Download className="w-6 h-6 text-indigo-400 mb-2" />
              <h3 className="text-sm font-bold text-gray-200">{t.settings.exportBackup}</h3>
              <p className="text-[11px] text-gray-400 mt-1">Descarga una copia completa de tus finanzas en formato JSON</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleExportJson}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl text-xs font-semibold shadow-md transition-colors"
              >
                Descargar Copia
              </button>
              <label className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 py-2 rounded-xl text-xs font-semibold text-center cursor-pointer transition-colors">
                Restaurar JSON
                <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Cloud Sync & Supabase */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Cloud className="w-5 h-5 text-indigo-400" />
          {t.settings.cloudSyncTitle}
        </h2>
        <p className="text-xs text-gray-400">{t.settings.syncNotice}</p>

        {user ? (
          <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-medium text-gray-400">Conectado como:</span>
              <p className="text-sm font-bold text-white">{user.email}</p>
              {lastSyncTime && (
                <p className="text-[11px] text-indigo-400 mt-0.5">Última sincronización: {lastSyncTime}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCloudSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Sincronizando...' : t.settings.syncNow}</span>
              </button>
              <button
                onClick={handleSignOut}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 p-2 rounded-xl text-xs"
                title="Cerrar Sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="email"
                placeholder="tu-correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleAuth(false)}
                disabled={authLoading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl text-xs font-semibold shadow-md transition-colors"
              >
                {authLoading ? 'Procesando...' : 'Iniciar Sesión'}
              </button>
              <button
                type="button"
                onClick={() => handleAuth(true)}
                disabled={authLoading}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 py-2 rounded-xl text-xs font-semibold transition-colors"
              >
                Crear Cuenta
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SQL Setup Helper */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            {t.settings.sqlHelpTitle}
          </h2>
          <button
            onClick={handleCopySql}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-indigo-400 px-3 py-1.5 rounded-xl text-xs font-semibold border border-gray-700 transition-colors"
          >
            {isSqlCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{isSqlCopied ? '¡Copiado!' : t.settings.copySqlBtn}</span>
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Si aún no has creado las tablas en tu proyecto de Supabase, puedes copiar el script SQL generado (con seguridad RLS por usuario) y ejecutarlo en el SQL Editor de tu consola de Supabase.
        </p>
      </div>
    </div>
  );
}
