import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTables = () => {
  const createTable = () => ({
    clear: vi.fn().mockResolvedValue(undefined),
    bulkPut: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    toArray: vi.fn().mockResolvedValue([]),
    where: vi.fn().mockReturnValue({
      equals: vi.fn().mockReturnValue({
        delete: vi.fn().mockResolvedValue(0),
        toArray: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  const tables = {
    accounts: createTable(),
    transactions: createTable(),
    recurringIncomes: createTable(),
    receivables: createTable(),
    recurringExpenses: createTable(),
    monthlyExtras: createTable(),
    goals: createTable(),
    syncMeta: createTable(),
    transaction: vi.fn(async (_mode: string, _tables: any[], fn: () => Promise<void>) => {
      await fn();
    }),
  };

  return tables;
};

let activeMockDb = mockTables();

vi.mock('@/lib/db/dexie', () => ({
  getDb: vi.fn(() => activeMockDb),
  setActiveUserId: vi.fn(),
}));

const mockMaybeSingle = vi.fn();
vi.mock('@/utils/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'test-jwt-token',
            user: { id: 'd66bb5ad-ae91-4cd2-841b-502b19945e75', email: 'orieblax@gmail.com' },
          },
        },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    })),
  })),
}));

import { restoreFromCloud } from './cloudSync';
import { importLocalDataJson } from '@/lib/import/xlsxImporter';

describe('Cloud Sync & JSONB Payload Hydration', () => {
  beforeEach(() => {
    activeMockDb = mockTables();
    vi.clearAllMocks();
  });

  it('hydrates local IndexedDB when Supabase returns payload as a parsed JSONB object', async () => {
    const samplePayload = {
      accounts: [{ id: 'acc_wallet_2', name: 'Daviplata', type: 'wallet', balance: 2893, currency: 'COP', updatedAt: '2026-11-01T05:26:05Z' }],
      receivables: [{ id: 'rec_8', monthKey: '2026-11', tenantName: 'Angelica 1', amount: 700000, deductions: 0, netAmount: 700000, dueDay: 1, isCollected: false, updatedAt: '2026-11-01T05:26:05Z' }],
      recurringExpenses: [{ id: 'exp_2', monthKey: '2026-11', name: 'Merc Aseo', category: 'Hogar', budgetedAmount: 400000, remainingAmount: 200000, dueDay: 15, frequency: 'monthly', isPaid: false, updatedAt: '2026-11-01T05:26:05Z' }],
      monthlyExtras: [],
      goals: [{ id: 'goal_27', name: 'English', targetAmount: 5000000, currentAmount: 500000, updatedAt: '2026-11-01T05:26:05Z' }],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          found: true,
          user_id: 'd66bb5ad-ae91-4cd2-841b-502b19945e75',
          month_key: '2026-11',
          updated_at: '2026-11-01T05:26:05.087+00:00',
          payload: samplePayload, // Object (not string) directly from Supabase JSONB
        }),
      })
    );

    const res = await restoreFromCloud('2026-11', 'd66bb5ad-ae91-4cd2-841b-502b19945e75');

    expect(res.success).toBe(true);
    expect(res.found).toBe(true);
    expect(res.count).toBe(4);
    expect(res.restoredMonthKey).toBe('2026-11');
    expect(activeMockDb.accounts.bulkPut).toHaveBeenCalledWith(samplePayload.accounts);
    expect(activeMockDb.receivables.bulkPut).toHaveBeenCalledWith(samplePayload.receivables);
    expect(activeMockDb.recurringExpenses.bulkPut).toHaveBeenCalledWith(samplePayload.recurringExpenses);
    expect(activeMockDb.goals.bulkPut).toHaveBeenCalledWith(samplePayload.goals);
  });

  it('falls back to direct Supabase RLS query when API endpoint fails', async () => {
    const samplePayload = {
      accounts: [{ id: 'acc_wallet_6', name: 'Nequi', type: 'wallet', balance: 724549, currency: 'COP', updatedAt: '2026-11-01T05:26:05Z' }],
      goals: [{ id: 'goal_27', name: 'English', targetAmount: 5000000, currentAmount: 500000, updatedAt: '2026-11-01T05:26:05Z' }],
    };

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        month_key: '2026-11',
        updated_at: '2026-11-01T05:26:05.087+00:00',
        payload: samplePayload,
      },
      error: null,
    });

    const res = await restoreFromCloud('2026-11', 'd66bb5ad-ae91-4cd2-841b-502b19945e75');

    expect(res.success).toBe(true);
    expect(res.found).toBe(true);
    expect(res.count).toBe(2);
    expect(activeMockDb.accounts.bulkPut).toHaveBeenCalledWith(samplePayload.accounts);
    expect(activeMockDb.goals.bulkPut).toHaveBeenCalledWith(samplePayload.goals);
  });

  it('supports JSON string input in importLocalDataJson for manual JSON file restores', async () => {
    const jsonStr = JSON.stringify({
      accounts: [{ id: 'acc_1', name: 'Caja', type: 'wallet', balance: 1000, currency: 'COP', updatedAt: '2026-11-01T00:00:00Z' }],
    });

    await importLocalDataJson(jsonStr, 'user-1');
    expect(activeMockDb.accounts.bulkPut).toHaveBeenCalledTimes(1);
  });
});
