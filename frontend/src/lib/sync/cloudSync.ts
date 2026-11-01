import { getDb, setActiveUserId } from '@/lib/db/dexie';
import { importLocalDataJson } from '@/lib/import/xlsxImporter';
import { createClient } from '@/utils/supabase/client';

export interface RestoreResult {
  success: boolean;
  found: boolean;
  message?: string;
  count?: number;
  restoredMonthKey?: string;
  updatedAt?: string | null;
}

export interface PushResult {
  success: boolean;
  message?: string;
  timestamp?: string;
  updatedAt?: string;
}

async function fetchCloudSnapshot(
  monthKey: string | undefined,
  effectiveUserId: string,
  accessToken: string | undefined
): Promise<{
  found: boolean;
  month_key: string;
  updated_at: string | null;
  payload: Record<string, any> | null;
}> {
  const supabase = createClient();

  // 1. Primary path: server API with Bearer token + no-store cache busting
  try {
    const params = new URLSearchParams();
    if (monthKey) params.set('month_key', monthKey);
    params.set('_t', String(Date.now()));

    const headers: Record<string, string> = {
      'Cache-Control': 'no-cache',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch(`/api/v1/sync?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      const parsedPayload =
        typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload || null;
      return {
        found: Boolean(data.found && parsedPayload),
        month_key: data.month_key || monthKey || 'latest',
        updated_at: data.updated_at || null,
        payload: parsedPayload,
      };
    }
  } catch {
    // Fall through to direct Supabase client query
  }

  // 2. Fallback path: direct Supabase PostgREST query with authenticated RLS session
  let snapshotRow: any = null;
  if (monthKey && monthKey !== 'latest') {
    const { data, error } = await supabase
      .from('finance_snapshots')
      .select('*')
      .eq('user_id', effectiveUserId)
      .eq('month_key', monthKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    snapshotRow = data;
  }

  if (!snapshotRow) {
    const { data, error } = await supabase
      .from('finance_snapshots')
      .select('*')
      .eq('user_id', effectiveUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    snapshotRow = data;
  }

  const parsedPayload =
    typeof snapshotRow?.payload === 'string'
      ? JSON.parse(snapshotRow.payload)
      : snapshotRow?.payload || null;

  return {
    found: Boolean(snapshotRow && parsedPayload),
    month_key: snapshotRow?.month_key || monthKey || 'latest',
    updated_at: snapshotRow?.updated_at || null,
    payload: parsedPayload,
  };
}

/**
 * Downloads the user's latest financial snapshot from Supabase into local IndexedDB
 */
export async function restoreFromCloud(
  monthKey?: string,
  userId?: string
): Promise<RestoreResult> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const effectiveUserId = userId || session?.user?.id;
    if (!effectiveUserId) {
      return {
        success: false,
        found: false,
        message: 'Sesión no activa. Por favor inicia sesión nuevamente.',
      };
    }

    setActiveUserId(effectiveUserId);

    const cloud = await fetchCloudSnapshot(monthKey, effectiveUserId, session?.access_token);

    if (!cloud.found || !cloud.payload) {
      return {
        success: true,
        found: false,
        message: 'No se encontraron copias en la nube para este usuario',
      };
    }

    const payload = cloud.payload;
    const replaceKey =
      cloud.month_key && /^\d{4}-\d{2}$/.test(cloud.month_key) ? cloud.month_key : undefined;

    // Hydrate local IndexedDB safely (supports object or JSON string)
    await importLocalDataJson(payload, effectiveUserId, { replaceMonthKey: replaceKey });

    const targetDb = getDb(effectiveUserId);
    if (cloud.updated_at) {
      await targetDb.syncMeta.put({
        key: 'last_cloud_updated_at',
        value: cloud.updated_at,
        updatedAt: new Date().toISOString(),
      });
    }

    const count =
      (payload.accounts?.length || 0) +
      (payload.transactions?.length || 0) +
      (payload.receivables?.length || 0) +
      (payload.recurringExpenses?.length || 0) +
      (payload.monthlyExtras?.length || 0) +
      (payload.goals?.length || 0);

    return {
      success: true,
      found: true,
      count,
      restoredMonthKey: replaceKey,
      updatedAt: cloud.updated_at,
      message: `Datos sincronizados desde la nube (${count} registros cargados)`,
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
 * Automatically restores from Supabase if local DB is empty OR if cloud snapshot is newer
 * than the last synced version (without overwriting unsaved local edits).
 */
export async function autoSyncFromCloud(
  monthKey?: string,
  userId?: string
): Promise<RestoreResult> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const effectiveUserId = userId || session?.user?.id;
    if (!effectiveUserId) {
      return { success: false, found: false };
    }

    setActiveUserId(effectiveUserId);
    const targetDb = getDb(effectiveUserId);
    const accountCount = await targetDb.accounts.count();

    // Case 1: Fresh device / empty local DB -> always restore immediately
    if (accountCount === 0) {
      return await restoreFromCloud(monthKey, effectiveUserId);
    }

    // Case 2: Existing local DB -> check if cloud has a newer snapshot than our last sync
    const cloud = await fetchCloudSnapshot(monthKey, effectiveUserId, session?.access_token);
    if (!cloud.found || !cloud.payload || !cloud.updated_at) {
      return { success: true, found: false };
    }

    const lastSyncMeta = await targetDb.syncMeta.get('last_cloud_updated_at');
    const cloudTime = new Date(cloud.updated_at).getTime();
    const lastSyncTime = lastSyncMeta?.value ? new Date(lastSyncMeta.value).getTime() : 0;

    if (cloudTime <= lastSyncTime) {
      return { success: true, found: false };
    }

    // Check if there are unsynced local changes newer than lastSyncTime
    const localAccounts = await targetDb.accounts.toArray();
    const newestLocalEdit = localAccounts.reduce((max, acc) => {
      const t = acc.updatedAt ? new Date(acc.updatedAt).getTime() : 0;
      return t > max ? t : max;
    }, 0);

    // Only auto-apply if cloud is newer than local edits as well
    if (lastSyncTime > 0 && newestLocalEdit > lastSyncTime && newestLocalEdit > cloudTime) {
      return { success: true, found: false };
    }

    const replaceKey =
      cloud.month_key && /^\d{4}-\d{2}$/.test(cloud.month_key) ? cloud.month_key : undefined;

    await importLocalDataJson(cloud.payload, effectiveUserId, { replaceMonthKey: replaceKey });
    await targetDb.syncMeta.put({
      key: 'last_cloud_updated_at',
      value: cloud.updated_at,
      updatedAt: new Date().toISOString(),
    });

    const payload = cloud.payload;
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
      restoredMonthKey: replaceKey,
      updatedAt: cloud.updated_at,
    };
  } catch {
    return { success: false, found: false };
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
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const effectiveUserId = userId || session?.user?.id;
    if (!effectiveUserId) {
      return {
        success: false,
        message: 'Sesión no activa. Por favor inicia sesión nuevamente.',
      };
    }

    setActiveUserId(effectiveUserId);
    const targetDb = getDb(effectiveUserId);

    const [
      accounts,
      transactions,
      recurringIncomes,
      receivables,
      recurringExpenses,
      monthlyExtras,
      goals,
    ] = await Promise.all([
      targetDb.accounts.toArray(),
      targetDb.transactions.toArray(),
      targetDb.recurringIncomes.toArray(),
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
      transactions,
      recurringIncomes,
      receivables,
      recurringExpenses,
      monthlyExtras,
      goals,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    let savedUpdatedAt = new Date().toISOString();
    let pushedViaApi = false;

    try {
      const res = await fetch('/api/v1/sync', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          month_key: monthKey,
          device_id: 'pwa-client',
          payload,
        }),
      });

      if (res.ok) {
        const resData = await res.json().catch(() => ({}));
        if (resData.updated_at) savedUpdatedAt = resData.updated_at;
        pushedViaApi = true;
      }
    } catch {
      // Fall back to direct Supabase upsert
    }

    if (!pushedViaApi) {
      const { error } = await supabase.from('finance_snapshots').upsert(
        {
          user_id: effectiveUserId,
          month_key: monthKey,
          payload,
          device_id: 'pwa-client',
          updated_at: savedUpdatedAt,
        },
        { onConflict: 'user_id,month_key' }
      );
      if (error) {
        throw new Error(error.message);
      }
    }

    await targetDb.syncMeta.put({
      key: 'last_cloud_updated_at',
      value: savedUpdatedAt,
      updatedAt: new Date().toISOString(),
    });

    const time = new Date().toLocaleTimeString();
    return {
      success: true,
      timestamp: time,
      updatedAt: savedUpdatedAt,
      message: `Copia guardada en la nube con éxito (${time})`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error al guardar en la nube',
    };
  }
}
