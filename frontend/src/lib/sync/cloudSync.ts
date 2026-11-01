import { getDb } from '@/lib/db/dexie';
import { importLocalDataJson } from '@/lib/import/xlsxImporter';

export interface RestoreResult {
  success: boolean;
  found: boolean;
  message?: string;
  count?: number;
}

export interface PushResult {
  success: boolean;
  message?: string;
  timestamp?: string;
}

/**
 * Downloads the user's latest financial snapshot from Supabase into local IndexedDB
 */
export async function restoreFromCloud(
  monthKey?: string,
  userId?: string
): Promise<RestoreResult> {
  try {
    const url = `/api/v1/sync${monthKey ? `?month_key=${encodeURIComponent(monthKey)}` : ''}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        found: false,
        message: err.error || `HTTP error ${res.status}`,
      };
    }

    const data = await res.json();
    if (!data.found || !data.payload) {
      return {
        success: true,
        found: false,
        message: 'No se encontraron copias en la nube para este usuario',
      };
    }

    // Hydrate local IndexedDB
    await importLocalDataJson(data.payload, userId);

    const payload = data.payload;
    const count =
      (payload.accounts?.length || 0) +
      (payload.receivables?.length || 0) +
      (payload.recurringExpenses?.length || 0) +
      (payload.monthlyExtras?.length || 0) +
      (payload.goals?.length || 0);

    return {
      success: true,
      found: true,
      count,
      message: `Restaurado con éxito (${count} registros cargados)`,
    };
  } catch (err: any) {
    return {
      success: false,
      found: false,
      message: err.message || 'Error de conexión con la nube',
    };
  }
}

/**
 * Pushes the local IndexedDB financial records for the active user to Supabase
 */
export async function pushToCloud(
  monthKey: string,
  userId?: string
): Promise<PushResult> {
  try {
    const targetDb = getDb(userId);

    const [accounts, receivables, recurringExpenses, monthlyExtras, goals] = await Promise.all([
      targetDb.accounts.toArray(),
      targetDb.receivables.where('monthKey').equals(monthKey).toArray(),
      targetDb.recurringExpenses.where('monthKey').equals(monthKey).toArray(),
      targetDb.monthlyExtras.where('monthKey').equals(monthKey).toArray(),
      targetDb.goals.toArray(),
    ]);

    const totalLocalItems =
      accounts.length +
      receivables.length +
      recurringExpenses.length +
      monthlyExtras.length +
      goals.length;

    if (totalLocalItems === 0) {
      return {
        success: false,
        message: 'No hay datos locales para sincronizar. Primero carga tu archivo Excel o añade cuentas.',
      };
    }

    const payload = {
      accounts,
      receivables,
      recurringExpenses,
      monthlyExtras,
      goals,
    };

    const res = await fetch('/api/v1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month_key: monthKey,
        device_id: 'pwa-client',
        payload,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }

    const time = new Date().toLocaleTimeString();
    return {
      success: true,
      timestamp: time,
      message: `Copia guardada en la nube con éxito (${time})`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error al guardar en la nube',
    };
  }
}
