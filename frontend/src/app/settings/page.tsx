'use client';

import React, { useState } from 'react';
import {
  Settings,
  Languages,
  Upload,
  Download,
  Cloud,
  RefreshCw,
  FileSpreadsheet,
  LogOut,
  User,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { parseAndImportExcelFile, exportLocalDataJson, importLocalDataJson } from '@/lib/import/xlsxImporter';
import { db } from '@/lib/db/dexie';
import { pushToCloud, restoreFromCloud } from '@/lib/sync/cloudSync';

export default function SettingsPage() {
  const { t, lang, setLang, currentMonth, setCurrentMonth, triggerRefresh, showMessage, user, logout } = useApp();

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Handle Excel File Upload
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const res = await parseAndImportExcelFile(buffer, currentMonth, user?.id);
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
      const jsonStr = await exportLocalDataJson(user?.id);
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
      await importLocalDataJson(text, user?.id);
      triggerRefresh();
      showMessage('Copia de seguridad restaurada con éxito', 'success');
    } catch (err: any) {
      showMessage(`Error al restaurar: ${err.message}`, 'error');
    }
  };

  // Handle Cloud Upload (Push current Dexie state to Supabase)
  const handleCloudUpload = async () => {
    if (!user) {
      showMessage('Debes iniciar sesión con tu cuenta para respaldar', 'error');
      return;
    }

    setIsSyncing(true);
    try {
      const res = await pushToCloud(currentMonth, user.id);
      if (res.success) {
        setLastSyncTime(res.timestamp || new Date().toLocaleTimeString());
        showMessage(res.message || 'Copia guardada en la nube con éxito', 'success');
      } else {
        showMessage(res.message || 'Error al respaldar en la nube', 'error');
      }
    } catch (err: any) {
      showMessage(err.message || 'Error durante el respaldo en la nube', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle Cloud Download (Pull latest snapshot from Supabase into Dexie)
  const handleCloudDownload = async () => {
    if (!user) {
      showMessage('Debes iniciar sesión con tu cuenta para descargar datos', 'error');
      return;
    }

    setIsRestoring(true);
    try {
      const res = await restoreFromCloud(currentMonth, user.id);
      if (!res.success) {
        showMessage(res.message || 'Error al descargar datos de la nube', 'error');
      } else if (res.found) {
        if (res.restoredMonthKey && res.restoredMonthKey !== currentMonth) {
          setCurrentMonth(res.restoredMonthKey);
        } else {
          triggerRefresh();
        }
        const time = new Date().toLocaleTimeString();
        setLastSyncTime(time);
        showMessage(res.message || 'Datos descargados y restaurados con éxito', 'success');
      } else {
        showMessage(res.message || 'No se encontraron datos en la nube para este usuario', 'info');
      }
    } catch (err: any) {
      showMessage(err.message || 'Error al descargar datos de la nube', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{t.settings.title}</h1>
        <p className="text-sm text-gray-400">Preferencias, copia de seguridad local, sincronización en nube y privacidad</p>
      </div>

      {/* User Account & Session Profile */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <User className="w-5 h-5 text-indigo-400" />
          <span>Cuenta de Usuario Activa</span>
        </h2>
        <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-medium text-gray-400">Sesión iniciada como:</span>
            <p className="text-base font-bold text-white">{user?.email || 'Usuario Conectado'}</p>
            <p className="text-[11px] text-emerald-400 mt-0.5">Tus datos en este dispositivo están aislados para tu usuario</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
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

        <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-medium text-gray-400">Sincronización en la Nube:</span>
            <p className="text-sm font-bold text-white">{user?.email}</p>
            {lastSyncTime ? (
              <p className="text-[11px] text-emerald-400 mt-0.5">Última acción: {lastSyncTime}</p>
            ) : (
              <p className="text-[11px] text-indigo-400 mt-0.5">Respalda o descarga tus finanzas en cualquier dispositivo</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCloudDownload}
              disabled={isRestoring || isSyncing}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md transition-colors"
            >
              <Download className={`w-3.5 h-3.5 ${isRestoring ? 'animate-bounce' : ''}`} />
              <span>{isRestoring ? 'Descargando...' : t.settings.downloadFromCloud}</span>
            </button>
            <button
              onClick={handleCloudUpload}
              disabled={isSyncing || isRestoring}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Guardando...' : t.settings.uploadToCloud}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
