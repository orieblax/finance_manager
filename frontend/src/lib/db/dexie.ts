import Dexie, { type Table } from 'dexie';

export type AccountType = 'wallet' | 'investment';

export interface AccountRecord {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  investmentMeta?: {
    annualRatePercent?: number; // e.g. 7.0 for Fiducia
    units?: number;             // e.g. 200 crypto
    fxRate?: number;            // e.g. 3400 COP/USDT
  };
  isArchived?: boolean;
  updatedAt: string;
}

export interface TransactionRecord {
  id: string;
  accountId: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description: string;
  date: string;
  toAccountId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringIncomeRecord {
  id: string;
  name: string;
  amount: number;
  dayOfMonth: number;
  netMultiplier: number;
  isActive: boolean;
  updatedAt: string;
}

export interface ReceivableRecord {
  id: string;
  monthKey: string; // e.g. '2026-10'
  tenantName: string;
  amount: number;
  deductions: number;
  netAmount: number;
  dueDay: number;
  isCollected: boolean;
  collectedIntoAccountId?: string;
  collectedAt?: string;
  notes?: string;
  updatedAt: string;
}

export interface RecurringExpenseRecord {
  id: string;
  monthKey: string;
  name: string;
  category: string;
  budgetedAmount: number;
  remainingAmount: number;
  dueDay: number;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  isPaid: boolean;
  updatedAt: string;
}

export interface MonthlyExtraRecord {
  id: string;
  monthKey: string;
  type: 'income' | 'expense';
  name: string;
  rawAmount: number;
  netMultiplier: number;
  netAmount: number;
  isSettled: boolean;
  updatedAt: string;
}

export interface GoalRecord {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  updatedAt: string;
}

export interface SyncMetaRecord {
  key: string;
  value: string;
  updatedAt: string;
}

export class FinanceDatabase extends Dexie {
  accounts!: Table<AccountRecord, string>;
  transactions!: Table<TransactionRecord, string>;
  recurringIncomes!: Table<RecurringIncomeRecord, string>;
  receivables!: Table<ReceivableRecord, string>;
  recurringExpenses!: Table<RecurringExpenseRecord, string>;
  monthlyExtras!: Table<MonthlyExtraRecord, string>;
  goals!: Table<GoalRecord, string>;
  syncMeta!: Table<SyncMetaRecord, string>;

  constructor(dbName: string = 'PersonalFinanceManagerDB') {
    super(dbName);
    this.version(1).stores({
      accounts: 'id, name, type, isArchived, updatedAt',
      transactions: 'id, accountId, type, category, date, toAccountId, createdAt',
      recurringIncomes: 'id, name, dayOfMonth, isActive',
      receivables: 'id, monthKey, tenantName, dueDay, isCollected, updatedAt',
      recurringExpenses: 'id, monthKey, name, category, dueDay, isPaid, updatedAt',
      monthlyExtras: 'id, monthKey, type, isSettled, updatedAt',
      goals: 'id, name, updatedAt',
      syncMeta: 'key, updatedAt'
    });
  }
}

const dbs = new Map<string, FinanceDatabase>();
let currentActiveUserId: string | undefined;

export function setActiveUserId(userId?: string) {
  currentActiveUserId = userId;
}

export function getDb(userId?: string): FinanceDatabase {
  const id = userId ?? currentActiveUserId;
  const dbName = id ? `PersonalFinanceManagerDB_${id}` : 'PersonalFinanceManagerDB';
  let instance = dbs.get(dbName);
  if (!instance) {
    instance = new FinanceDatabase(dbName);
    dbs.set(dbName, instance);
  }
  return instance;
}

// Transparent Proxy that always routes to the currently active user's database
export const db: FinanceDatabase = new Proxy({} as FinanceDatabase, {
  get(_target, prop: keyof FinanceDatabase) {
    const activeDb = getDb();
    const val = activeDb[prop];
    if (typeof val === 'function') {
      return val.bind(activeDb);
    }
    return val;
  },
});
