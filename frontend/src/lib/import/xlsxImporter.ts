import * as XLSX from 'xlsx';
import {
  db,
  AccountRecord,
  ReceivableRecord,
  RecurringExpenseRecord,
  MonthlyExtraRecord,
  GoalRecord,
} from '../db/dexie';

export interface ImportSummary {
  accountsCount: number;
  expensesCount: number;
  receivablesCount: number;
  extrasCount: number;
  goalsCount: number;
}

export async function parseAndImportExcelFile(
  fileBuffer: ArrayBuffer,
  monthKey: string = '2026-10'
): Promise<ImportSummary> {
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellFormula: true, cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const nowIso = new Date().toISOString();

  // Helper to read cell value or evaluated formula value
  const getCellVal = (cellRef: string): { v: any; f?: string } => {
    const c = worksheet[cellRef];
    if (!c) return { v: null };
    return { v: c.v !== undefined ? c.v : null, f: c.f };
  };

  const accounts: AccountRecord[] = [];
  const expenses: RecurringExpenseRecord[] = [];
  const receivables: ReceivableRecord[] = [];
  const extras: MonthlyExtraRecord[] = [];
  const goals: GoalRecord[] = [];

  // 1. Liquid Accounts (Rows 2 to 6)
  const walletRows = [
    { row: 2, defaultName: 'Daviplata' },
    { row: 3, defaultName: 'Caja social' },
    { row: 4, defaultName: 'Bolsillo' },
    { row: 5, defaultName: 'Colchon' },
    { row: 6, defaultName: 'Nequi' },
  ];

  for (const item of walletRows) {
    const nameCell = getCellVal(`A${item.row}`);
    const valCell = getCellVal(`B${item.row}`);
    const name = (nameCell.v ? String(nameCell.v) : item.defaultName).trim();
    const balance = typeof valCell.v === 'number' ? valCell.v : 0;

    accounts.push({
      id: `acc_wallet_${item.row}`,
      name,
      type: 'wallet',
      balance,
      currency: 'COP',
      updatedAt: nowIso,
    });
  }

  // Capital & Investments (Rows 15 to 17)
  const cesantiasVal = getCellVal('B15').v;
  if (typeof cesantiasVal === 'number') {
    accounts.push({
      id: 'acc_invest_cesantias',
      name: 'Cesantías',
      type: 'investment',
      balance: cesantiasVal,
      currency: 'COP',
      updatedAt: nowIso,
    });
  }

  const cryptoVal = getCellVal('B16');
  accounts.push({
    id: 'acc_invest_crypto',
    name: 'Crypto',
    type: 'investment',
    balance: typeof cryptoVal.v === 'number' ? cryptoVal.v : 680000,
    currency: 'COP',
    investmentMeta: { units: 200, fxRate: 3400 },
    updatedAt: nowIso,
  });

  const fiduciaPrincipalVal = getCellVal('B17');
  accounts.push({
    id: 'acc_invest_fiducia',
    name: 'Fiducia Capital',
    type: 'investment',
    balance: typeof fiduciaPrincipalVal.v === 'number' ? fiduciaPrincipalVal.v : 30000000,
    currency: 'COP',
    investmentMeta: { annualRatePercent: 7.0 },
    updatedAt: nowIso,
  });

  // 2. Recurring Expenses (Rows 2 to 13, columns E, F, G)
  for (let r = 2; r <= 13; r++) {
    const nameCell = getCellVal(`E${r}`);
    const budgetedCell = getCellVal(`F${r}`);
    const pendingCell = getCellVal(`G${r}`);

    if (nameCell.v) {
      const rawName = String(nameCell.v).trim();
      const budgeted = typeof budgetedCell.v === 'number' ? budgetedCell.v : 0;
      const pending = typeof pendingCell.v === 'number' ? pendingCell.v : 0;

      // Extract day from name like "Movistar 1-26" -> 26 or "Gas 15" -> 15
      const dayMatch = rawName.match(/\b(\d{1,2})\b/);
      const dueDay = dayMatch ? Math.min(31, Math.max(1, parseInt(dayMatch[1], 10))) : 15;

      let category = 'Servicios';
      if (rawName.toLowerCase().includes('merc') || rawName.toLowerCase().includes('aseo')) category = 'Hogar';
      else if (rawName.toLowerCase().includes('mamá') || rawName.toLowerCase().includes('papá')) category = 'Familia';
      else if (rawName.toLowerCase().includes('planilla')) category = 'Obligaciones';
      else if (rawName.toLowerCase().includes('moto')) category = 'Transporte';

      expenses.push({
        id: `exp_${r}`,
        monthKey,
        name: rawName,
        category,
        budgetedAmount: budgeted,
        remainingAmount: pending,
        dueDay,
        frequency: rawName.toLowerCase().includes('moto') ? 'weekly' : 'monthly',
        isPaid: pending === 0 && budgeted > 0,
        updatedAt: nowIso,
      });
    }
  }

  // 3. Receivables & Tenant Collections (Rows 8 to 13 in Column A / B)
  for (let r = 8; r <= 13; r++) {
    const nameCell = getCellVal(`A${r}`);
    const valCell = getCellVal(`B${r}`);
    if (nameCell.v) {
      const tenantName = String(nameCell.v).trim();
      const netAmount = typeof valCell.v === 'number' ? valCell.v : 0;
      const dayMatch = tenantName.match(/\b(\d{1,2})\b/);
      const dueDay = dayMatch ? Math.min(31, Math.max(1, parseInt(dayMatch[1], 10))) : 1;

      receivables.push({
        id: `rec_${r}`,
        monthKey,
        tenantName,
        amount: netAmount,
        deductions: 0,
        netAmount,
        dueDay,
        isCollected: false,
        updatedAt: nowIso,
      });
    }
  }

  // Also row 5: Fiducia monthly yield in C5 / D5
  const fidYield = getCellVal('D5');
  if (fidYield.v) {
    receivables.push({
      id: 'rec_fiducia_yield',
      monthKey,
      tenantName: 'Fiducia Rendimiento Mensual',
      amount: typeof fidYield.v === 'number' ? fidYield.v : 175000,
      deductions: 0,
      netAmount: typeof fidYield.v === 'number' ? fidYield.v : 175000,
      dueDay: 1,
      isCollected: false,
      updatedAt: nowIso,
    });
  }

  // 4. Monthly Extras (Columns I & J, Rows 2 to 7)
  for (let r = 2; r <= 7; r++) {
    const nameCell = getCellVal(`I${r}`);
    const valCell = getCellVal(`J${r}`);
    if (nameCell.v && valCell.v !== null && valCell.v !== 0) {
      const extraName = String(nameCell.v).trim();
      const val = typeof valCell.v === 'number' ? valCell.v : 0;
      const isIncome = val > 0;
      const absVal = Math.abs(val);

      extras.push({
        id: `extra_${r}`,
        monthKey,
        type: isIncome ? 'income' : 'expense',
        name: extraName,
        rawAmount: absVal,
        netMultiplier: 1.0,
        netAmount: absVal,
        isSettled: false,
        updatedAt: nowIso,
      });
    }
  }

  // 5. Goals (Rows 27 to 32, Column A & B)
  for (let r = 27; r <= 32; r++) {
    const nameCell = getCellVal(`A${r}`);
    const valCell = getCellVal(`B${r}`);
    if (nameCell.v) {
      const goalName = String(nameCell.v).trim();
      const current = typeof valCell.v === 'number' ? valCell.v : 0;
      let target = 5000000;
      if (goalName.toLowerCase().includes('maestría')) target = 25000000;
      if (goalName.toLowerCase().includes('casa')) target = 80000000;
      if (goalName.toLowerCase().includes('matrimonio')) target = 15000000;

      goals.push({
        id: `goal_${r}`,
        name: goalName,
        targetAmount: target,
        currentAmount: current,
        updatedAt: nowIso,
      });
    }
  }

  // Save to Dexie IndexedDB
  await db.transaction('rw', [db.accounts, db.recurringExpenses, db.receivables, db.monthlyExtras, db.goals], async () => {
    if (accounts.length > 0) await db.accounts.bulkPut(accounts);
    if (expenses.length > 0) await db.recurringExpenses.bulkPut(expenses);
    if (receivables.length > 0) await db.receivables.bulkPut(receivables);
    if (extras.length > 0) await db.monthlyExtras.bulkPut(extras);
    if (goals.length > 0) await db.goals.bulkPut(goals);
  });

  return {
    accountsCount: accounts.length,
    expensesCount: expenses.length,
    receivablesCount: receivables.length,
    extrasCount: extras.length,
    goalsCount: goals.length,
  };
}

export async function exportLocalDataJson(): Promise<string> {
  const [accounts, transactions, recurringIncomes, receivables, recurringExpenses, monthlyExtras, goals] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.recurringIncomes.toArray(),
    db.receivables.toArray(),
    db.recurringExpenses.toArray(),
    db.monthlyExtras.toArray(),
    db.goals.toArray(),
  ]);

  return JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    accounts,
    transactions,
    recurringIncomes,
    receivables,
    recurringExpenses,
    monthlyExtras,
    goals,
  }, null, 2);
}

export async function importLocalDataJson(jsonString: string): Promise<void> {
  const data = JSON.parse(jsonString);
  await db.transaction('rw', [
    db.accounts,
    db.transactions,
    db.recurringIncomes,
    db.receivables,
    db.recurringExpenses,
    db.monthlyExtras,
    db.goals,
  ], async () => {
    if (data.accounts?.length) await db.accounts.bulkPut(data.accounts);
    if (data.transactions?.length) await db.transactions.bulkPut(data.transactions);
    if (data.recurringIncomes?.length) await db.recurringIncomes.bulkPut(data.recurringIncomes);
    if (data.receivables?.length) await db.receivables.bulkPut(data.receivables);
    if (data.recurringExpenses?.length) await db.recurringExpenses.bulkPut(data.recurringExpenses);
    if (data.monthlyExtras?.length) await db.monthlyExtras.bulkPut(data.monthlyExtras);
    if (data.goals?.length) await db.goals.bulkPut(data.goals);
  });
}
